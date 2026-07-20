import { useRef, useState } from 'react';
import { resolveReferenceImages, type InlineImageData } from '../../lib/canvasState';
import {
  detectReferenceImageMimeType,
  inferReferenceImageMimeType,
  isGenerationReferenceImageMimeType,
  isMatchingReferenceImageFormat,
  isSupportedReferenceImageFile,
  isSupportedReferenceImageMimeType,
  MAX_REFERENCE_IMAGES,
  UNSUPPORTED_REFERENCE_IMAGE_MESSAGE,
  type SupportedReferenceImageMimeType,
} from '../../lib/referenceImageFormats';
import type { AppNode } from '../../store';

export type ReferenceImagePatch = Pick<AppNode['data'], 'referenceImage' | 'referenceImages' | 'referenceImageIds'>;

export type ReadImageFile = (file: File) => Promise<InlineImageData>;
export type ReadImageUrl = (url: string) => Promise<InlineImageData>;
export type OnReferenceImageReadError = (message: string) => void;

type ConvertReferenceBlob = (blob: Blob) => Promise<Blob>;

export function parseImageDataUrl(dataUrl: string): InlineImageData {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image format');
  const mimeType = match[1].toLowerCase();
  if (!isSupportedReferenceImageMimeType(mimeType)) {
    throw new Error(UNSUPPORTED_REFERENCE_IMAGE_MESSAGE);
  }
  return { mimeType, data: match[2], url: dataUrl };
}

function readBlobAsDataUrl(
  blob: Blob,
  createFileReader: () => FileReader
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = createFileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('读取图片失败'));
      }
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

function inlineImageToBlob(image: InlineImageData) {
  const binary = globalThis.atob(image.data);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: image.mimeType });
}

async function defaultConvertHeicToPng(blob: Blob) {
  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({ blob, toType: 'image/png' });
  const firstBlob = Array.isArray(converted) ? converted[0] : converted;
  if (!firstBlob) throw new Error('HEIC/HEIF 图片转换失败');
  return new Blob([await firstBlob.arrayBuffer()], { type: 'image/png' });
}

async function defaultRenderImageToPng(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('图片无法解码，请检查文件是否完整'));
      image.src = objectUrl;
    });

    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('图片尺寸无效');
    }

    const maxDimension = 4096;
    const maxPixels = 16_000_000;
    const dimensionScale = Math.min(
      1,
      maxDimension / sourceWidth,
      maxDimension / sourceHeight
    );
    const pixelScale = Math.min(
      1,
      Math.sqrt(maxPixels / (sourceWidth * sourceHeight))
    );
    const scale = Math.min(dimensionScale, pixelScale);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('图片转换功能不可用');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('图片转换为 PNG 失败'));
      }, 'image/png');
    });
    return pngBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function normalizeBrowserReferenceImageBlob(
  blob: Blob,
  mimeType: SupportedReferenceImageMimeType,
  {
    convertHeicToPng = defaultConvertHeicToPng,
    renderImageToPng = defaultRenderImageToPng,
  }: {
    convertHeicToPng?: ConvertReferenceBlob;
    renderImageToPng?: ConvertReferenceBlob;
  } = {}
) {
  if (isGenerationReferenceImageMimeType(mimeType)) {
    return blob.type === mimeType
      ? blob
      : new Blob([await blob.arrayBuffer()], { type: mimeType });
  }

  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    return convertHeicToPng(blob);
  }

  return renderImageToPng(blob);
}

export function createBrowserImageFileReader({
  createFileReader = () => new FileReader(),
  convertHeicToPng,
  renderImageToPng,
}: {
  createFileReader?: () => FileReader;
  convertHeicToPng?: ConvertReferenceBlob;
  renderImageToPng?: ConvertReferenceBlob;
} = {}): ReadImageFile {
  return async (file) => {
    const declaredMimeType = inferReferenceImageMimeType(file);
    if (!declaredMimeType) {
      throw new Error(UNSUPPORTED_REFERENCE_IMAGE_MESSAGE);
    }

    const header = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    if (!isMatchingReferenceImageFormat(
      declaredMimeType,
      detectReferenceImageMimeType(header)
    )) {
      throw new Error('图片内容与文件格式不一致，请重新导出后再试。');
    }

    const normalizedBlob = await normalizeBrowserReferenceImageBlob(
      file,
      declaredMimeType,
      { convertHeicToPng, renderImageToPng }
    );
    return parseImageDataUrl(
      await readBlobAsDataUrl(normalizedBlob, createFileReader)
    );
  };
}

export const readImageFile = createBrowserImageFileReader();

export function createBrowserImageUrlReader(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  {
    createFileReader = () => new FileReader(),
    convertHeicToPng,
    renderImageToPng,
  }: {
    createFileReader?: () => FileReader;
    convertHeicToPng?: ConvertReferenceBlob;
    renderImageToPng?: ConvertReferenceBlob;
  } = {}
): ReadImageUrl {
  return async (url) => {
    const response = await fetchImpl('/api/reference-images/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json() as {
      image?: InlineImageData;
      error?: string;
    };
    if (!response.ok || !payload.image) {
      throw new Error(payload.error || '图片链接读取失败');
    }
    const parsedImage = parseImageDataUrl(payload.image.url);
    if (isGenerationReferenceImageMimeType(parsedImage.mimeType)) {
      return parsedImage;
    }

    const normalizedBlob = await normalizeBrowserReferenceImageBlob(
      inlineImageToBlob(parsedImage),
      parsedImage.mimeType as SupportedReferenceImageMimeType,
      { convertHeicToPng, renderImageToPng }
    );
    return parseImageDataUrl(
      await readBlobAsDataUrl(normalizedBlob, createFileReader)
    );
  };
}

export function canAddReferenceImage({
  hasPendingReferenceHydration,
  referenceCount,
}: {
  hasPendingReferenceHydration: boolean;
  referenceCount: number;
}) {
  return !hasPendingReferenceHydration && referenceCount < MAX_REFERENCE_IMAGES;
}

export function selectImageFiles(
  files: Iterable<File>,
  { currentCount, maxCount = MAX_REFERENCE_IMAGES }: { currentCount: number; maxCount?: number }
) {
  const remainingSlots = Math.max(0, maxCount - currentCount);
  return Array.from(files)
    .filter(isSupportedReferenceImageFile)
    .slice(0, remainingSlots);
}

export function extractPasteImageFiles(clipboardData: {
  items?: Iterable<{ kind: string; type: string; getAsFile: () => File | null }>;
}) {
  return Array.from(clipboardData.items ?? [])
    .filter((item) => (
      item.kind === 'file'
      && isSupportedReferenceImageMimeType(item.type)
    ))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export function buildAddReferenceImagePatch({
  usesReferenceImageIds,
  referenceImageIds,
  referenceImages,
  nextImage,
}: {
  usesReferenceImageIds: boolean;
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
  nextImage: InlineImageData;
}): ReferenceImagePatch {
  if (usesReferenceImageIds) {
    return {
      referenceImageIds,
      referenceImages: [nextImage],
      referenceImage: undefined,
    };
  }

  return {
    referenceImages: [...referenceImages, nextImage].slice(0, MAX_REFERENCE_IMAGES),
    referenceImageIds: undefined,
    referenceImage: undefined,
  };
}

export function buildRemoveReferenceImagePatch({
  usesReferenceImageIds,
  referenceImageIds,
  referenceImages,
  index,
}: {
  usesReferenceImageIds: boolean;
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
  index: number;
}): ReferenceImagePatch {
  if (usesReferenceImageIds) {
    return {
      referenceImageIds: referenceImageIds.filter((_, currentIndex) => currentIndex !== index),
      referenceImages: undefined,
      referenceImage: undefined,
    };
  }

  return {
    referenceImages: referenceImages.filter((_, currentIndex) => currentIndex !== index),
    referenceImageIds: undefined,
    referenceImage: undefined,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '读取图片失败';
}

function alertReadError(message: string) {
  if (typeof globalThis.alert === 'function') {
    globalThis.alert(message);
  }
}

export function createReferenceImageController({
  nodeId,
  data,
  assets,
  assetsHydrated,
  updateNodeData,
  readImageFile,
  readImageUrl = async () => {
    throw new Error('图片链接读取功能不可用');
  },
  onReadError = alertReadError,
}: {
  nodeId: string;
  data: AppNode['data'];
  assets: Parameters<typeof resolveReferenceImages>[1];
  assetsHydrated: boolean;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  readImageFile: ReadImageFile;
  readImageUrl?: ReadImageUrl;
  onReadError?: OnReferenceImageReadError;
}) {
  const referenceImages = resolveReferenceImages(data, assets);
  const rawReferenceImageIds = data.referenceImageIds ?? [];
  const referenceImageIds = assetsHydrated
    ? rawReferenceImageIds.filter((referenceImageId) => assets[referenceImageId])
    : rawReferenceImageIds;
  const usesReferenceImageIds = data.referenceImageIds != null;
  const hasPendingReferenceHydration = !assetsHydrated && rawReferenceImageIds.length > 0;

  const appendReferenceImage = (nextImage: InlineImageData) => {
    if (!canAddReferenceImage({ hasPendingReferenceHydration, referenceCount: referenceImages.length })) return;
    updateNodeData(nodeId, buildAddReferenceImagePatch({
      usesReferenceImageIds,
      referenceImageIds,
      referenceImages,
      nextImage,
    }));
  };

  const removeReferenceImage = (index: number) => {
    if (hasPendingReferenceHydration) return;
    updateNodeData(nodeId, buildRemoveReferenceImagePatch({
      usesReferenceImageIds,
      referenceImageIds,
      referenceImages,
      index,
    }));
  };

  const readAndAppendFiles = async (files: File[]) => {
    if (hasPendingReferenceHydration) return;

    if (files.some((file) => !isSupportedReferenceImageMimeType(file.type))) {
      onReadError(UNSUPPORTED_REFERENCE_IMAGE_MESSAGE);
    }

    const existingInlineReferenceImages = usesReferenceImageIds
      ? [...(data.referenceImages ?? [])]
      : [...referenceImages];
    const selectedFiles = selectImageFiles(files, {
      currentCount: usesReferenceImageIds
        ? referenceImageIds.length + existingInlineReferenceImages.length
        : existingInlineReferenceImages.length,
    });
    let nextReferenceImages = existingInlineReferenceImages;

    for (const file of selectedFiles) {
      try {
        const nextImage = await readImageFile(file);
        const availableSlots = usesReferenceImageIds
          ? Math.max(0, MAX_REFERENCE_IMAGES - referenceImageIds.length)
          : MAX_REFERENCE_IMAGES;
        nextReferenceImages = [...nextReferenceImages, nextImage].slice(0, availableSlots);

        updateNodeData(nodeId, {
          referenceImageIds: usesReferenceImageIds ? referenceImageIds : undefined,
          referenceImages: nextReferenceImages,
          referenceImage: undefined,
        });
      } catch (error) {
        onReadError(getErrorMessage(error));
      }
    }
  };

  const handleImageUpload = async (event: { target: { files: FileList | File[] | null; value: string } }) => {
    await readAndAppendFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handlePaste = async (event: { clipboardData: Parameters<typeof extractPasteImageFiles>[0]; preventDefault: () => void }) => {
    const files = extractPasteImageFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    await readAndAppendFiles(files);
  };

  const handleDrop = async (event: {
    dataTransfer: { files: FileList | File[] };
    preventDefault: () => void;
  }) => {
    if (event.dataTransfer.files.length > 0) {
      event.preventDefault();
    }
    const files = selectImageFiles(event.dataTransfer.files, {
      currentCount: referenceImages.length,
    });
    if (!files.length) {
      if (event.dataTransfer.files.length > 0) {
        onReadError(UNSUPPORTED_REFERENCE_IMAGE_MESSAGE);
      }
      return;
    }
    await readAndAppendFiles(files);
  };

  const handleImageUrl = async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) {
      onReadError('请输入图片链接');
      return false;
    }
    if (!canAddReferenceImage({
      hasPendingReferenceHydration,
      referenceCount: referenceImages.length,
    })) {
      return false;
    }

    try {
      appendReferenceImage(await readImageUrl(url));
      return true;
    } catch (error) {
      onReadError(getErrorMessage(error));
      return false;
    }
  };

  return {
    referenceImages,
    referenceImageIds,
    usesReferenceImageIds,
    hasPendingReferenceHydration,
    appendReferenceImage,
    removeReferenceImage,
    handleImageUpload,
    handlePaste,
    handleDrop,
    handleImageUrl,
  };
}

export function useReferenceImages({
  nodeId,
  data,
  assets,
  assetsHydrated,
  updateNodeData,
  readImageFile = createBrowserImageFileReader(),
  readImageUrl = createBrowserImageUrlReader(),
  onReadError = alertReadError,
}: {
  nodeId: string;
  data: AppNode['data'];
  assets: Parameters<typeof resolveReferenceImages>[1];
  assetsHydrated: boolean;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  readImageFile?: ReadImageFile;
  readImageUrl?: ReadImageUrl;
  onReadError?: OnReferenceImageReadError;
}) {
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controller = createReferenceImageController({
    nodeId,
    data,
    assets,
    assetsHydrated,
    updateNodeData,
    readImageFile,
    readImageUrl,
    onReadError,
  });

  const withReadingState = async <T,>(action: () => Promise<T>) => {
    setIsReadingFile(true);
    try {
      return await action();
    } finally {
      setIsReadingFile(false);
    }
  };

  return {
    fileInputRef,
    isReadingFile,
    setIsReadingFile,
    ...controller,
    handleImageUpload: (event: Parameters<typeof controller.handleImageUpload>[0]) =>
      withReadingState(() => controller.handleImageUpload(event)),
    handlePaste: (event: Parameters<typeof controller.handlePaste>[0]) =>
      withReadingState(() => controller.handlePaste(event)),
    handleDrop: (event: Parameters<typeof controller.handleDrop>[0]) =>
      withReadingState(() => controller.handleDrop(event)),
    handleImageUrl: (url: string) =>
      withReadingState(() => controller.handleImageUrl(url)),
  };
}
