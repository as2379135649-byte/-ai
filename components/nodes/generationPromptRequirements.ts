import type { BananaAspectRatio, BananaImageSize } from '../../lib/imageModels';

const aspectRatioRequirementLabels: Record<BananaAspectRatio, string> = {
  '1:1': '1:1（正方形）',
  '1:4': '1:4（超高）',
  '1:8': '1:8（极高）',
  '2:3': '2:3（竖版）',
  '3:2': '3:2（横版）',
  '3:4': '3:4（竖版）',
  '4:1': '4:1（超宽）',
  '4:3': '4:3（标准）',
  '4:5': '4:5（社媒竖版）',
  '5:4': '5:4（社媒横版）',
  '8:1': '8:1（极宽）',
  '9:16': '9:16（手机竖屏）',
  '16:9': '16:9（宽屏）',
  '21:9': '21:9（电影宽屏）',
};

const imageSizeRequirementLabels: Record<BananaImageSize, string> = {
  '512': '512（0.5K）',
  '1K': '1K（标准）',
  '2K': '2K（高清）',
  '4K': '4K（超清）',
};

export function buildPromptWithGenerationRequirements({
  prompt,
  aspectRatio,
  imageSize,
  batchCount,
}: {
  prompt: string;
  aspectRatio: BananaAspectRatio;
  imageSize: BananaImageSize;
  batchCount: number;
}) {
  const normalizedCount = Math.min(8, Math.max(1, Math.floor(batchCount || 1)));

  return [
    prompt.trim(),
    '',
    '【输出要求】',
    `- 画面比例：${aspectRatioRequirementLabels[aspectRatio]}`,
    `- 分辨率：${imageSizeRequirementLabels[imageSize]}`,
    `- 生成数量：共 ${normalizedCount} 张`,
    '- 由系统逐张独立生成；本次请求仅输出一张完整画面，不要拼图、分镜或多宫格。',
  ].join('\n');
}
