import assert from 'node:assert/strict';
import test from 'node:test';

import {
  importReferenceImageFromUrl,
  isPublicReferenceImageAddress,
  validateReferenceImageUrl,
} from './referenceImageRoutes';

const publicLookup = async () => [{ address: '93.184.216.34' }];

test('reference image URL validation blocks local and private network targets', async () => {
  assert.equal(isPublicReferenceImageAddress('127.0.0.1'), false);
  assert.equal(isPublicReferenceImageAddress('192.168.1.20'), false);
  assert.equal(isPublicReferenceImageAddress('10.0.0.8'), false);
  assert.equal(isPublicReferenceImageAddress('93.184.216.34'), true);
  assert.equal(isPublicReferenceImageAddress('::1'), false);

  await assert.rejects(
    validateReferenceImageUrl('http://localhost/image.png', publicLookup),
    /不能读取本机或局域网地址/
  );
  await assert.rejects(
    validateReferenceImageUrl('http://example.test/image.png', async () => [{ address: '10.0.0.5' }]),
    /不允许访问的地址/
  );
});

test('reference image URL validation accepts public HTTP and HTTPS URLs', async () => {
  assert.equal(
    (await validateReferenceImageUrl('https://images.example.test/photo.webp', publicLookup)).toString(),
    'https://images.example.test/photo.webp'
  );
  await assert.rejects(
    validateReferenceImageUrl('file:///tmp/photo.png', publicLookup),
    /仅支持 HTTP 或 HTTPS/
  );
});

test('external reference image import follows validated redirects and returns local image data', async () => {
  const requestedUrls: string[] = [];
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
  ]);
  const fetchExternal = async (url: string) => {
    requestedUrls.push(url);
    if (requestedUrls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: '/final.png' },
      });
    }
    return new Response(pngBytes, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(pngBytes.byteLength),
      },
    });
  };

  const result = await importReferenceImageFromUrl('https://images.example.test/start', {
    lookupHost: publicLookup,
    fetchExternal,
  });

  assert.deepEqual(requestedUrls, [
    'https://images.example.test/start',
    'https://images.example.test/final.png',
  ]);
  assert.deepEqual(result, {
    sourceUrl: 'https://images.example.test/final.png',
    image: {
      mimeType: 'image/png',
      data: Buffer.from(pngBytes).toString('base64'),
      url: `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`,
    },
  });
});

test('external reference image import rejects unsupported content and oversized bodies', async () => {
  await assert.rejects(
    importReferenceImageFromUrl('https://images.example.test/not-image', {
      lookupHost: publicLookup,
      fetchExternal: async () => new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    }),
    /必须返回 PNG、JPEG、WebP、GIF、SVG、HEIC\/HEIF/
  );

  await assert.rejects(
    importReferenceImageFromUrl('https://images.example.test/large.png', {
      lookupHost: publicLookup,
      maxBytes: 2,
      fetchExternal: async () => new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    }),
    /不能超过 12 MB/
  );

  await assert.rejects(
    importReferenceImageFromUrl('https://images.example.test/spoofed.png', {
      lookupHost: publicLookup,
      fetchExternal: async () => new Response(
        new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
        {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }
      ),
    }),
    /图片内容与声明格式不一致/
  );
});

test('external reference image import accepts GIF, SVG, HEIC, and HEIF content', async () => {
  const cases = [
    {
      mimeType: 'image/gif',
      bytes: new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    },
    {
      mimeType: 'image/svg+xml',
      bytes: new TextEncoder().encode('<svg viewBox="0 0 1 1"></svg>'),
    },
    {
      mimeType: 'image/heic',
      bytes: new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
        0x68, 0x65, 0x69, 0x63,
      ]),
    },
    {
      mimeType: 'image/heif',
      bytes: new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
        0x6d, 0x69, 0x66, 0x31,
      ]),
    },
  ];

  for (const { mimeType, bytes } of cases) {
    const result = await importReferenceImageFromUrl(
      `https://images.example.test/reference.${mimeType.split('/')[1]}`,
      {
        lookupHost: publicLookup,
        fetchExternal: async () => new Response(bytes, {
          status: 200,
          headers: { 'content-type': mimeType },
        }),
      }
    );

    assert.equal(result.image.mimeType, mimeType);
    assert.equal(result.image.data, Buffer.from(bytes).toString('base64'));
  }
});
