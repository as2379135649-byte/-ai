import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAddReferenceImagePatch,
  buildRemoveReferenceImagePatch,
  canAddReferenceImage,
  createBrowserImageUrlReader,
  createReferenceImageController,
  extractPasteImageFiles,
  normalizeBrowserReferenceImageBlob,
  parseImageDataUrl,
  selectImageFiles,
} from './useReferenceImages';

const image = { data: 'base64', mimeType: 'image/png', url: 'data:image/png;base64,base64' };
const secondImage = { data: 'second', mimeType: 'image/png', url: 'data:image/png;base64,second' };
const thirdImage = { data: 'third', mimeType: 'image/webp', url: 'data:image/webp;base64,third' };

test('canAddReferenceImage enforces hydration and five-image limit', () => {
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: true, referenceCount: 0 }), false);
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: false, referenceCount: 5 }), false);
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: false, referenceCount: 4 }), true);
});

test('selectImageFiles accepts every configured image format and respects remaining slots', () => {
  const png = { type: 'image/png', name: 'a.png' } as File;
  const jpg = { type: 'image/jpeg', name: 'b.jpg' } as File;
  const gif = { type: 'image/gif', name: 'animated.gif' } as File;
  const heic = { type: 'image/heic', name: 'phone.heic' } as File;
  const svg = { type: 'image/svg+xml', name: 'vector.svg' } as File;
  const webp = { type: 'image/webp', name: 'photo.webp' } as File;
  const text = { type: 'text/plain', name: 'notes.txt' } as File;

  assert.deepEqual(
    selectImageFiles([gif, png, heic, text, jpg, svg, webp], { currentCount: 2, maxCount: 4 }),
    [gif, png]
  );
  assert.deepEqual(
    selectImageFiles([gif, png, heic, text, jpg, svg, webp], { currentCount: 0, maxCount: 8 }),
    [gif, png, heic, jpg, svg, webp]
  );
  assert.deepEqual(selectImageFiles([png, jpg], { currentCount: 5 }), []);
});

test('extractPasteImageFiles reads image files from clipboard items without DOM dependencies', () => {
  const png = { type: 'image/png', name: 'paste.png' } as File;
  const files = extractPasteImageFiles({
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => png },
    ],
  });

  assert.deepEqual(files, [png]);
});

test('parseImageDataUrl returns inline image data without FileReader', () => {
  assert.deepEqual(
    parseImageDataUrl('data:image/png;base64,abc123'),
    { mimeType: 'image/png', data: 'abc123', url: 'data:image/png;base64,abc123' }
  );
  assert.throws(() => parseImageDataUrl('not-a-data-url'), /Invalid image format/);
  assert.deepEqual(
    parseImageDataUrl('data:image/gif;base64,abc123'),
    { mimeType: 'image/gif', data: 'abc123', url: 'data:image/gif;base64,abc123' }
  );
  assert.throws(() => parseImageDataUrl('data:image/bmp;base64,abc123'), /仅支持/);
});

test('non-generation formats are normalized to PNG with the matching converter', async () => {
  const source = new Blob(['source'], { type: 'image/gif' });
  const converted = new Blob(['png'], { type: 'image/png' });
  const calls: string[] = [];

  assert.equal(
    await normalizeBrowserReferenceImageBlob(source, 'image/gif', {
      renderImageToPng: async () => {
        calls.push('render');
        return converted;
      },
      convertHeicToPng: async () => {
        calls.push('heic');
        return converted;
      },
    }),
    converted
  );
  assert.equal(
    await normalizeBrowserReferenceImageBlob(source, 'image/heic', {
      renderImageToPng: async () => {
        calls.push('render');
        return converted;
      },
      convertHeicToPng: async () => {
        calls.push('heic');
        return converted;
      },
    }),
    converted
  );
  assert.deepEqual(calls, ['render', 'heic']);
});

test('reference image controller refuses unsupported dropped files and prevents browser navigation', async () => {
  const readErrors: string[] = [];
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: () => {
      throw new Error('unsupported files must not update the node');
    },
    readImageFile: async () => {
      throw new Error('unsupported files must not be read');
    },
    onReadError: (message) => readErrors.push(message),
  });
  let prevented = false;

  await controller.handleDrop({
    dataTransfer: {
      files: [{ type: 'image/bmp', name: 'bitmap.bmp' } as File],
    },
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.deepEqual(
    readErrors,
    ['仅支持 PNG、JPEG、WebP、GIF、SVG、HEIC/HEIF 图片。']
  );
});

test('browser image URL reader imports an external image through the local API', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const readImageUrl = createBrowserImageUrlReader(async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({
      image: {
        mimeType: 'image/webp',
        data: 'external',
        url: 'data:image/webp;base64,external',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  assert.deepEqual(await readImageUrl('https://images.example.test/a.webp'), {
    mimeType: 'image/webp',
    data: 'external',
    url: 'data:image/webp;base64,external',
  });
  assert.equal(requests[0].url, '/api/reference-images/import');
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal(requests[0].init?.body, JSON.stringify({
    url: 'https://images.example.test/a.webp',
  }));
});

test('reference image controller upload and paste read through injected reader and patch node data', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const png = { type: 'image/png', name: 'upload.png' } as File;
  const paste = { type: 'image/jpeg', name: 'paste.jpg' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async (file) => ({
      data: file.name,
      mimeType: file.type,
      url: `data:${file.type};base64,${file.name}`,
    }),
  });

  const uploadEvent = { target: { files: [png], value: 'selected' } };
  await controller.handleImageUpload(uploadEvent);

  let prevented = false;
  await controller.handlePaste({
    clipboardData: { items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => paste }] },
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(uploadEvent.target.value, '');
  assert.equal(prevented, true);
  assert.deepEqual(patches, [
    {
      nodeId: 'prompt-1',
      patch: {
        referenceImages: [{ data: 'upload.png', mimeType: 'image/png', url: 'data:image/png;base64,upload.png' }],
        referenceImageIds: undefined,
        referenceImage: undefined,
      },
    },
    {
      nodeId: 'prompt-1',
      patch: {
        referenceImages: [{ data: 'paste.jpg', mimeType: 'image/jpeg', url: 'data:image/jpeg;base64,paste.jpg' }],
        referenceImageIds: undefined,
        referenceImage: undefined,
      },
    },
  ]);
});

test('reference image controller accepts dropped files and external image URLs', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const dropped = { type: 'image/png', name: 'dropped.png' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async (file) => ({
      data: file.name,
      mimeType: file.type,
      url: `data:${file.type};base64,${file.name}`,
    }),
    readImageUrl: async () => ({
      data: 'remote',
      mimeType: 'image/jpeg',
      url: 'data:image/jpeg;base64,remote',
    }),
  });

  let prevented = false;
  await controller.handleDrop({
    dataTransfer: { files: [dropped] },
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(await controller.handleImageUrl('https://images.example.test/photo.jpg'), true);
  assert.deepEqual(patches, [
    {
      nodeId: 'prompt-1',
      patch: {
        referenceImages: [{
          data: 'dropped.png',
          mimeType: 'image/png',
          url: 'data:image/png;base64,dropped.png',
        }],
        referenceImageIds: undefined,
        referenceImage: undefined,
      },
    },
    {
      nodeId: 'prompt-1',
      patch: {
        referenceImages: [{
          data: 'remote',
          mimeType: 'image/jpeg',
          url: 'data:image/jpeg;base64,remote',
        }],
        referenceImageIds: undefined,
        referenceImage: undefined,
      },
    },
  ]);
});

test('reference image controller accumulates multiple uploaded files with existing inline references', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const png = { type: 'image/png', name: 'second' } as File;
  const webp = { type: 'image/webp', name: 'third' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [image] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async (file) => ({
      data: file.name,
      mimeType: file.type,
      url: `data:${file.type};base64,${file.name}`,
    }),
  });

  await controller.handleImageUpload({ target: { files: [png, webp], value: 'selected' } });

  assert.deepEqual(patches.at(-1), {
    nodeId: 'prompt-1',
    patch: {
      referenceImages: [image, secondImage, thirdImage],
      referenceImageIds: undefined,
      referenceImage: undefined,
    },
  });
});

test('reference image controller accumulates multiple uploaded files with existing asset references', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const png = { type: 'image/png', name: 'second' } as File;
  const webp = { type: 'image/webp', name: 'third' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImageIds: ['asset-1'] } as any,
    assets: {
      'asset-1': { id: 'asset-1', data: 'base64', mimeType: 'image/png' },
    },
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async (file) => ({
      data: file.name,
      mimeType: file.type,
      url: `data:${file.type};base64,${file.name}`,
    }),
  });

  await controller.handleImageUpload({ target: { files: [png, webp], value: 'selected' } });

  assert.deepEqual(patches.at(-1), {
    nodeId: 'prompt-1',
    patch: {
      referenceImageIds: ['asset-1'],
      referenceImages: [secondImage, thirdImage],
      referenceImage: undefined,
    },
  });
});

test('reference image controller reports injected read failures without storing node errors and recovers on later reads', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const readErrors: string[] = [];
  const broken = { type: 'image/png', name: 'broken.png' } as File;
  const good = { type: 'image/png', name: 'good.png' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    onReadError: (message) => readErrors.push(message),
    readImageFile: async (file) => {
      if (file.name === 'broken.png') throw new Error('read failed');
      return {
        data: file.name,
        mimeType: file.type,
        url: `data:${file.type};base64,${file.name}`,
      };
    },
  });

  const failedUploadEvent = { target: { files: [broken], value: 'selected' } };
  await controller.handleImageUpload(failedUploadEvent);

  const successfulUploadEvent = { target: { files: [good], value: 'selected' } };
  await controller.handleImageUpload(successfulUploadEvent);

  assert.equal(failedUploadEvent.target.value, '');
  assert.equal(successfulUploadEvent.target.value, '');
  assert.deepEqual(readErrors, ['read failed']);
  assert.equal(patches.some(({ patch }) => 'error' in (patch as Record<string, unknown>)), false);
  assert.deepEqual(patches, [{
    nodeId: 'prompt-1',
    patch: {
      referenceImages: [{ data: 'good.png', mimeType: 'image/png', url: 'data:image/png;base64,good.png' }],
      referenceImageIds: undefined,
      referenceImage: undefined,
    },
  }]);
});

test('asset-backed reference add preserves referenceImageIds precedence and stores new inline image', () => {
  assert.deepEqual(
    buildAddReferenceImagePatch({
      usesReferenceImageIds: true,
      referenceImageIds: ['asset-1'],
      referenceImages: [],
      nextImage: image,
    }),
    {
      referenceImageIds: ['asset-1'],
      referenceImages: [image],
      referenceImage: undefined,
    }
  );
});

test('inline reference add appends and caps at five', () => {
  const existing = [image, image, image, image, image];
  assert.deepEqual(
    buildAddReferenceImagePatch({
      usesReferenceImageIds: false,
      referenceImageIds: [],
      referenceImages: existing,
      nextImage: image,
    }),
    {
      referenceImages: existing,
      referenceImageIds: undefined,
      referenceImage: undefined,
    }
  );
});

test('remove reference image handles asset-backed and inline references', () => {
  assert.deepEqual(
    buildRemoveReferenceImagePatch({
      usesReferenceImageIds: true,
      referenceImageIds: ['a', 'b'],
      referenceImages: [],
      index: 0,
    }),
    {
      referenceImageIds: ['b'],
      referenceImages: undefined,
      referenceImage: undefined,
    }
  );

  assert.deepEqual(
    buildRemoveReferenceImagePatch({
      usesReferenceImageIds: false,
      referenceImageIds: [],
      referenceImages: [image, { ...image, data: 'second' }],
      index: 1,
    }),
    {
      referenceImages: [image],
      referenceImageIds: undefined,
      referenceImage: undefined,
    }
  );
});

test('add and remove patches are blocked by pending hydration through canAddReferenceImage', () => {
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: true, referenceCount: 1 }), false);
});
