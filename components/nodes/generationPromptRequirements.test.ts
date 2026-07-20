import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPromptWithGenerationRequirements } from './generationPromptRequirements';

test('generation selections are appended to the prompt sent to AI', () => {
  assert.equal(
    buildPromptWithGenerationRequirements({
      prompt: '  雨夜中的未来城市  ',
      aspectRatio: '16:9',
      imageSize: '2K',
      batchCount: 4,
    }),
    [
      '雨夜中的未来城市',
      '',
      '【输出要求】',
      '- 画面比例：16:9（宽屏）',
      '- 分辨率：2K（高清）',
      '- 生成数量：共 4 张',
      '- 由系统逐张独立生成；本次请求仅输出一张完整画面，不要拼图、分镜或多宫格。',
    ].join('\n')
  );
});

test('generation count in the AI prompt stays within the interface range', () => {
  const prompt = buildPromptWithGenerationRequirements({
    prompt: '测试',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 99,
  });

  assert.match(prompt, /生成数量：共 8 张/);
});
