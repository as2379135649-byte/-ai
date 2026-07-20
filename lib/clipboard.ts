type ClipboardWriter = Pick<Clipboard, 'write'>;
type ClipboardTextWriter = Pick<Clipboard, 'writeText'>;
type ClipboardReader = Pick<Clipboard, 'read'>;
type Fetcher = typeof fetch;
type ClipboardItemConstructor = typeof ClipboardItem;
type BlobToPngConverter = (blob: Blob) => Promise<Blob>;

interface CopyImageDeps {
  fetcher?: Fetcher;
  clipboard?: ClipboardWriter;
  clipboardItem?: ClipboardItemConstructor;
  convertBlobToPng?: BlobToPngConverter;
}

interface CopyTextDeps {
  clipboard?: ClipboardTextWriter;
}

interface ReadClipboardImagesDeps {
  clipboard?: ClipboardReader;
  createFile?: (blob: Blob, name: string, type: string) => File;
  now?: () => number;
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const CLIPBOARD_IMAGE_MIME_TYPE = 'image/png';
const CLIPBOARD_IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

export function inferImageMimeTypeFromUrl(imageUrl: string): string {
  return inferExplicitImageMimeTypeFromUrl(imageUrl) || 'image/png';
}

function inferExplicitImageMimeTypeFromUrl(imageUrl: string): string | null {
  const dataUrlMatch = imageUrl.match(/^data:(image\/[^;,]+)[;,]/i);
  if (dataUrlMatch) {
    return dataUrlMatch[1].toLowerCase();
  }

  const path = imageUrl.split(/[?#]/, 1)[0] ?? '';
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return (extension && IMAGE_MIME_BY_EXTENSION[extension]) || null;
}

function getClipboardWriter(clipboard?: ClipboardWriter): ClipboardWriter {
  const writer = clipboard ?? globalThis.navigator?.clipboard;
  if (!writer?.write) {
    throw new Error('Clipboard image writing is not available');
  }
  return writer;
}

function getClipboardTextWriter(clipboard?: ClipboardTextWriter): ClipboardTextWriter {
  const writer = clipboard ?? globalThis.navigator?.clipboard;
  if (!writer?.writeText) {
    throw new Error('Clipboard text writing is not available');
  }
  return writer;
}

function getClipboardReader(clipboard?: ClipboardReader): ClipboardReader {
  const reader = clipboard ?? globalThis.navigator?.clipboard;
  if (!reader?.read) {
    throw new Error('当前浏览器不支持点击读取剪贴板，请使用 Ctrl/⌘+V 粘贴图片');
  }
  return reader;
}

function getClipboardItemConstructor(clipboardItem?: ClipboardItemConstructor): ClipboardItemConstructor {
  const ctor = clipboardItem ?? globalThis.ClipboardItem;
  if (!ctor) {
    throw new Error('ClipboardItem is not available');
  }
  return ctor;
}

function blobToCanvasPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      reject(new Error('Image conversion is not available'));
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas 2D context is not available'));
        return;
      }

      context.drawImage(image, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error('Image conversion to PNG failed'));
        }
      }, CLIPBOARD_IMAGE_MIME_TYPE);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image could not be decoded for clipboard conversion'));
    };
    image.src = objectUrl;
  });
}

async function normalizeImageBlobForClipboard(
  blob: Blob,
  convertBlobToPng: BlobToPngConverter,
): Promise<Blob> {
  if (blob.type === CLIPBOARD_IMAGE_MIME_TYPE) {
    return blob;
  }

  return convertBlobToPng(blob);
}

export async function copyImageToClipboard(imageUrl: string, deps: CopyImageDeps = {}): Promise<void> {
  const fetcher = deps.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    throw new Error('Fetch is not available');
  }

  const clipboard = getClipboardWriter(deps.clipboard);
  const ClipboardItemCtor = getClipboardItemConstructor(deps.clipboardItem);
  const convertBlobToPng = deps.convertBlobToPng ?? blobToCanvasPng;
  const blobPromise = fetcher(imageUrl).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to load image for clipboard: ${response.status}`);
    }

    const blob = await response.blob();
    return normalizeImageBlobForClipboard(blob, convertBlobToPng);
  });

  await clipboard.write([
    new ClipboardItemCtor({
      [CLIPBOARD_IMAGE_MIME_TYPE]: blobPromise,
    }),
  ]);
}

export async function copyTextToClipboard(text: string, deps: CopyTextDeps = {}): Promise<void> {
  await getClipboardTextWriter(deps.clipboard).writeText(text);
}

export async function readImageFilesFromClipboard(
  deps: ReadClipboardImagesDeps = {}
): Promise<File[]> {
  const clipboardItems = await getClipboardReader(deps.clipboard).read();
  const createFile = deps.createFile ?? (
    (blob: Blob, name: string, type: string) => new File([blob], name, { type })
  );
  const timestamp = (deps.now ?? Date.now)();
  const files: File[] = [];

  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => (
      CLIPBOARD_IMAGE_EXTENSION_BY_MIME_TYPE[type.trim().toLowerCase()]
    ));
    if (!imageType) continue;

    const normalizedImageType = imageType.trim().toLowerCase();
    const blob = await item.getType(imageType);
    const extension = CLIPBOARD_IMAGE_EXTENSION_BY_MIME_TYPE[normalizedImageType];
    files.push(createFile(
      blob,
      `clipboard-${timestamp}-${files.length + 1}.${extension}`,
      normalizedImageType
    ));
  }

  return files;
}
