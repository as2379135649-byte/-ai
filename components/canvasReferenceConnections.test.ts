import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppNode } from '../store';
import {
  connectCanvasNodes,
  disconnectCanvasEdge,
} from './canvasReferenceConnections';

const imageNode: AppNode = {
  id: 'image-1',
  type: 'imageNode',
  position: { x: 0, y: 0 },
  data: { imageAssetId: 'asset-1', imageModel: 'image2' },
};

const promptNode: AppNode = {
  id: 'prompt-1',
  type: 'promptNode',
  position: { x: 400, y: 0 },
  data: { prompt: '', imageModel: 'image2' },
};

test('linking an image to a prompt adds it as a visible reference image', () => {
  const result = connectCanvasNodes({
    nodes: [imageNode, promptNode],
    edges: [],
    assets: {
      'asset-1': { id: 'asset-1', data: 'image', mimeType: 'image/png' },
    },
    connection: {
      source: 'image-1',
      target: 'prompt-1',
      sourceHandle: null,
      targetHandle: null,
    },
    edgeId: 'reference-edge-1',
  });

  assert.equal(result.status, 'connected');
  assert.deepEqual(
    result.nodes.find((node) => node.id === 'prompt-1')?.data.referenceImageIds,
    ['asset-1']
  );
  assert.equal(result.edges[0].data?.referenceLink, true);
  assert.equal(result.edges[0].data?.connectionConfirmed, true);
});

test('five linked references are allowed and a sixth new reference is rejected', () => {
  const fullPrompt: AppNode = {
    ...promptNode,
    data: {
      ...promptNode.data,
      referenceImageIds: ['asset-a', 'asset-b', 'asset-c', 'asset-d', 'asset-e'],
    },
  };
  const result = connectCanvasNodes({
    nodes: [imageNode, fullPrompt],
    edges: [],
    assets: {
      'asset-1': { id: 'asset-1', data: 'image', mimeType: 'image/png' },
    },
    connection: {
      source: 'image-1',
      target: 'prompt-1',
      sourceHandle: null,
      targetHandle: null,
    },
    edgeId: 'reference-edge-1',
  });

  assert.equal(result.status, 'reference-limit');
  assert.equal(result.edges.length, 0);
  assert.equal(
    result.nodes.find((node) => node.id === 'prompt-1')?.data.referenceImageIds?.length,
    5
  );
});

test('cutting a reference edge removes the linked image from the prompt', () => {
  const connected = connectCanvasNodes({
    nodes: [imageNode, promptNode],
    edges: [],
    assets: {
      'asset-1': { id: 'asset-1', data: 'image', mimeType: 'image/png' },
    },
    connection: {
      source: 'image-1',
      target: 'prompt-1',
      sourceHandle: null,
      targetHandle: null,
    },
    edgeId: 'reference-edge-1',
  });
  const disconnected = disconnectCanvasEdge({
    nodes: connected.nodes,
    edges: connected.edges,
    edgeId: 'reference-edge-1',
  });

  assert.equal(disconnected.edges.length, 0);
  assert.deepEqual(
    disconnected.nodes.find((node) => node.id === 'prompt-1')?.data.referenceImageIds,
    []
  );
});
