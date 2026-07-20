import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';

import { ImageNode, canRerunImageNode, getRerunReferenceImages } from './ImageNode';
import type { AppNode } from '../../store';

test('canRerunImageNode disables rerun for mask edit results', () => {
  assert.equal(
    canRerunImageNode({
      prompt: '改帽子',
      imageModel: 'image2',
      generationMode: 'mask-edit',
    }),
    false
  );
});

test('getRerunReferenceImages resolves saved reference assets for standard reruns', () => {
  assert.deepEqual(
    getRerunReferenceImages(
      {
        prompt: '照着参考图画',
        imageModel: 'image2',
        referenceImageIds: ['ref-1'],
      },
      {
        'ref-1': {
          id: 'ref-1',
          data: 'base64-ref',
          mimeType: 'image/png',
        },
      }
    ),
    [{ data: 'base64-ref', mimeType: 'image/png' }]
  );
});

test('ImageNode does not render rerun control for mask edit results', () => {
  const node = {
    id: 'image-1',
    type: 'imageNode',
    position: { x: 0, y: 0 },
    data: {
      prompt: '改帽子',
      imageModel: 'image2',
      generationMode: 'mask-edit',
      imageUrl: 'https://example.com/image.png',
      sourceImageAssetId: 'missing-source',
    },
  } satisfies AppNode;

  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <ImageNode
        id={node.id}
        type={node.type}
        data={node.data}
        selected={false}
        zIndex={0}
        isConnectable={true}
        deletable={true}
        selectable={true}
        draggable={true}
        dragging={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>
  );

  assert.match(html, /class="canvas-task-card /);
  assert.doesNotMatch(html, /title="重新生成"/);
});

test('imported ImageNode renders as an operable image element without generation metadata', () => {
  const node = {
    id: 'imported-image',
    type: 'imageNode',
    position: { x: 0, y: 0 },
    data: {
      imageModel: 'image2',
      generationMode: 'imported',
      imageUrl: 'data:image/png;base64,aW1wb3J0ZWQ=',
    },
  } satisfies AppNode;

  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <ImageNode
        id={node.id}
        type={node.type}
        data={node.data}
        selected={false}
        zIndex={0}
        isConnectable
        deletable
        selectable
        draggable
        dragging={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>
  );

  assert.match(html, /alt="导入图片素材"/);
  assert.match(html, /title="下载"/);
  assert.match(html, /title="全屏查看"/);
  assert.match(html, /title="用作参考图"/);
  assert.match(html, /title="局部编辑"/);
  assert.match(html, /title="删除"/);
  assert.doesNotMatch(html, /title="重新生成"/);
  assert.doesNotMatch(html, /复制提示词/);
});

test('ImageNode renders recorded Image2 output token metrics', () => {
  const node = {
    id: 'image-metrics',
    type: 'imageNode',
    position: { x: 0, y: 0 },
    data: {
      prompt: '测试质量档位',
      imageModel: 'image2',
      imageUrl: 'https://example.com/image.png',
      generationMetrics: {
        requestId: 'request-token-test',
        quality: 'high',
        imageOutputTokens: 6208,
        inputTokens: 12,
        totalTokens: 6220,
      },
    },
  } satisfies AppNode;

  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <ImageNode
        id={node.id}
        type={node.type}
        data={node.data}
        selected={false}
        zIndex={0}
        isConnectable={true}
        deletable={true}
        selectable={true}
        draggable={true}
        dragging={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>
  );

  assert.match(html, /high · 图片输出 6,208 token/);
  assert.match(html, /请求 request-token-test/);
});

test('ImageNode labels new Image2 results as default quality', () => {
  const node = {
    id: 'image-default-quality',
    type: 'imageNode',
    position: { x: 0, y: 0 },
    data: {
      prompt: '测试默认画质',
      imageModel: 'image2',
      imageUrl: 'https://example.com/image.png',
      generationMetrics: {
        requestId: 'request-default-quality',
        quality: 'auto',
        imageOutputTokens: 765,
        inputTokens: 264,
        totalTokens: 1029,
      },
    },
  } satisfies AppNode;

  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <ImageNode
        id={node.id}
        type={node.type}
        data={node.data}
        selected={false}
        zIndex={0}
        isConnectable={true}
        deletable={true}
        selectable={true}
        draggable={true}
        dragging={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>
  );

  assert.match(html, /默认画质 · 图片输出 765 token/);
});
