import assert from 'node:assert/strict';
import test from 'node:test';
import { ReactFlowProvider } from '@xyflow/react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AppNode } from '../../store';
import { PromptNode } from './PromptNode';

test('PromptNode hides model selection, fixes Image2, and exposes local reference input methods', () => {
  const node = {
    id: 'prompt-fixed-image2',
    type: 'promptNode',
    position: { x: 0, y: 0 },
    data: {
      prompt: 'draw',
      imageModel: 'banana',
      bananaOptions: { thinkingLevel: 'HIGH' },
    },
  } satisfies AppNode;

  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <PromptNode
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

  assert.match(html, /class="canvas-task-card /);
  assert.doesNotMatch(html, /生图模型/);
  assert.doesNotMatch(html, /Banana - Gemini/);
  assert.doesNotMatch(html, /Image2 输出设置/);
  assert.doesNotMatch(html, /输出格式/);
  assert.doesNotMatch(html, /返回格式/);
  assert.doesNotMatch(html, /过程预览/);
  assert.match(html, /画面比例/);
  assert.match(html, /分辨率/);
  assert.match(html, /生成数量/);
  assert.match(html, /上传参考图/);
  assert.match(html, /aria-label="添加参考图"/);
  assert.match(html, /拖入画布创建图片元素，可在图片工具栏中“用作参考图”/);
  assert.match(html, /Ctrl\+V/);
  assert.doesNotMatch(html, /lucide-upload/);
  assert.match(html, /支持 PNG、JPEG、WebP、GIF、SVG、HEIC\/HEIF/);
  assert.match(
    html,
    /accept="image\/png,image\/jpeg,image\/webp,image\/gif,image\/svg\+xml,image\/heic,image\/heif,.heic,.heif"/
  );
  assert.doesNotMatch(html, /粘贴图片链接/);
  assert.doesNotMatch(html, /aria-label="图片链接"/);
  assert.match(html, /生成图像 · Image2/);
});

test('PromptNode places references inside the upload frame and hides empty-state text', () => {
  const node = {
    id: 'prompt-with-reference',
    type: 'promptNode',
    position: { x: 0, y: 0 },
    data: {
      prompt: 'draw',
      referenceImages: [{
        data: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        url: 'data:image/png;base64,iVBORw0KGgo=',
      }],
    },
  } satisfies AppNode;

  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <PromptNode
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

  assert.match(html, /alt="参考图 1"/);
  assert.match(html, /aria-label="添加参考图"/);
  assert.doesNotMatch(html, /拖入画布创建图片元素/);
  assert.doesNotMatch(html, /支持 PNG、JPEG、WebP、GIF、SVG、HEIC\/HEIF/);
});
