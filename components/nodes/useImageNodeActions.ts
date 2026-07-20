import { useEffect, useRef, useState } from 'react';
import {
  createReferenceImagePayload,
  imageAssetFromDataUrl,
  resolveReferenceImages,
  type CanvasImageAsset,
} from '../../lib/canvasState';
import { generateImage } from '../../services/gemini';
import type { AppNode } from '../../store';
import { DEFAULT_PROMPT_IMAGE_MODEL } from '../../lib/imageModels';
import { buildImageDownloadFileName } from '../../lib/imageDownloads';

export function canRerunImageNode(data: Partial<AppNode['data']>) {
  return Boolean(data.prompt)
    && data.generationMode !== 'mask-edit'
    && data.generationMode !== 'imported';
}

export function getRerunReferenceImages(
  data: Partial<AppNode['data']>,
  assets: Record<string, CanvasImageAsset>
) {
  const referenceImages = resolveReferenceImages(data as AppNode['data'], assets);
  return referenceImages.length > 0
    ? referenceImages.map((image) => ({ data: image.data, mimeType: image.mimeType }))
    : undefined;
}

export function buildDownloadFileName(now = Date.now(), imageUrl?: string) {
  return buildImageDownloadFileName(now, imageUrl);
}

export function buildReferenceNodeData({
  referencePayload,
}: {
  referencePayload: Partial<AppNode['data']>;
}): AppNode['data'] {
  return {
    prompt: '',
    imageModel: DEFAULT_PROMPT_IMAGE_MODEL,
    bananaOptions: undefined,
    ...referencePayload,
  };
}

export function useImageNodeActions() {
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const rerunAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      rerunAbortRef.current?.abort();
    };
  }, []);

  return {
    copiedImage,
    copiedPrompt,
    isRegenerating,
    setCopiedImage,
    setCopiedPrompt,
    setIsRegenerating,
    rerunAbortRef,
    generateImage,
    createReferenceImagePayload,
    imageAssetFromDataUrl,
  };
}
