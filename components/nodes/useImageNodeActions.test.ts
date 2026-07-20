import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDownloadFileName,
  buildReferenceNodeData,
  canRerunImageNode,
  getRerunReferenceImages,
} from './useImageNodeActions';
import type { CanvasImageAsset } from '../../lib/canvasState';

test('canRerunImageNode disables rerun for mask edit results', () => {
  assert.equal(canRerunImageNode({ prompt: 'draw', generationMode: 'mask-edit' }), false);
  assert.equal(canRerunImageNode({ prompt: 'draw', generationMode: 'imported' }), false);
  assert.equal(canRerunImageNode({ prompt: 'draw' }), true);
  assert.equal(canRerunImageNode({ prompt: '' }), false);
});

test('getRerunReferenceImages resolves saved reference assets', () => {
  const assets: Record<string, CanvasImageAsset> = {
    'ref-1': { id: 'ref-1', data: 'base64-ref', mimeType: 'image/png' },
  };

  assert.deepEqual(
    getRerunReferenceImages({ referenceImageIds: ['ref-1'] }, assets),
    [{ data: 'base64-ref', mimeType: 'image/png' }]
  );
});

test('buildReferenceNodeData creates a fixed Image2 prompt node', () => {
  assert.deepEqual(
    buildReferenceNodeData({
      referencePayload: { referenceImageIds: ['asset-1'] },
    }),
    {
      prompt: '',
      imageModel: 'image2',
      bananaOptions: undefined,
      referenceImageIds: ['asset-1'],
    }
  );
});

test('buildDownloadFileName uses banana-art prefix and png suffix by default', () => {
  assert.equal(buildDownloadFileName(1234), 'banana-art-1234.png');
});

test('buildDownloadFileName preserves known image URL extensions', () => {
  assert.equal(buildDownloadFileName(1234, 'https://example.com/generated.webp?token=1'), 'banana-art-1234.webp');
  assert.equal(buildDownloadFileName(1234, 'https://example.com/generated.jpeg'), 'banana-art-1234.jpg');
});
