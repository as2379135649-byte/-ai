export const SUPPORTED_REFERENCE_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/heic',
  'image/heif',
] as const;

export const MAX_REFERENCE_IMAGES = 5;

export type SupportedReferenceImageMimeType =
  (typeof SUPPORTED_REFERENCE_IMAGE_MIME_TYPES)[number];

export const GENERATION_REFERENCE_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type GenerationReferenceImageMimeType =
  (typeof GENERATION_REFERENCE_IMAGE_MIME_TYPES)[number];

const SUPPORTED_REFERENCE_IMAGE_MIME_TYPE_SET = new Set<string>(
  SUPPORTED_REFERENCE_IMAGE_MIME_TYPES
);

const GENERATION_REFERENCE_IMAGE_MIME_TYPE_SET = new Set<string>(
  GENERATION_REFERENCE_IMAGE_MIME_TYPES
);

const REFERENCE_IMAGE_EXTENSIONS: Record<string, SupportedReferenceImageMimeType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
};

export const SUPPORTED_REFERENCE_IMAGE_LABEL =
  'PNG、JPEG、WebP、GIF、SVG、HEIC/HEIF';
export const UNSUPPORTED_REFERENCE_IMAGE_MESSAGE =
  `仅支持 ${SUPPORTED_REFERENCE_IMAGE_LABEL} 图片。`;

export function isSupportedReferenceImageMimeType(
  mimeType: unknown
): mimeType is SupportedReferenceImageMimeType {
  return typeof mimeType === 'string'
    && SUPPORTED_REFERENCE_IMAGE_MIME_TYPE_SET.has(mimeType.trim().toLowerCase());
}

export function isGenerationReferenceImageMimeType(
  mimeType: unknown
): mimeType is GenerationReferenceImageMimeType {
  return typeof mimeType === 'string'
    && GENERATION_REFERENCE_IMAGE_MIME_TYPE_SET.has(mimeType.trim().toLowerCase());
}

export function inferReferenceImageMimeType({
  type,
  name,
}: {
  type?: string;
  name?: string;
}): SupportedReferenceImageMimeType | null {
  const normalizedType = type?.trim().toLowerCase();
  if (isSupportedReferenceImageMimeType(normalizedType)) {
    return normalizedType;
  }

  const extension = name?.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? REFERENCE_IMAGE_EXTENSIONS[extension] ?? null : null;
}

export function isSupportedReferenceImageFile(file: {
  type?: string;
  name?: string;
}) {
  return inferReferenceImageMimeType(file) !== null;
}

export function isMatchingReferenceImageFormat(
  declaredMimeType: SupportedReferenceImageMimeType,
  detectedMimeType: SupportedReferenceImageMimeType | null
) {
  if (!detectedMimeType) return false;
  if (declaredMimeType === detectedMimeType) return true;

  return (
    (declaredMimeType === 'image/heic' || declaredMimeType === 'image/heif')
    && (detectedMimeType === 'image/heic' || detectedMimeType === 'image/heif')
  );
}

export function detectReferenceImageMimeType(
  bytes: Uint8Array
): SupportedReferenceImageMimeType | null {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  if (
    bytes.length >= 6
    && bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39)
    && bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  if (
    bytes.length >= 12
    && bytes[4] === 0x66
    && bytes[5] === 0x74
    && bytes[6] === 0x79
    && bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) {
      return 'image/heic';
    }
    if (['mif1', 'msf1'].includes(brand)) {
      return 'image/heif';
    }
  }

  const textPrefix = new TextDecoder()
    .decode(bytes.slice(0, 512))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  if (
    textPrefix.startsWith('<svg')
    || (
      textPrefix.startsWith('<?xml')
      && /<svg(?:\s|>)/.test(textPrefix)
    )
    || /(?:^|-->)\s*<svg(?:\s|>)/.test(textPrefix)
  ) {
    return 'image/svg+xml';
  }

  return null;
}
