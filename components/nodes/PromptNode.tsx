import { Handle, Position, NodeProps } from '@xyflow/react';
import { useStore } from '../../store';
import type { AppNode } from '../../store';
import { useEffect, useState } from 'react';
import { Edit3, Image as ImageIcon, Loader2, Plus, Sparkles, Wand2, X, Trash2 } from 'lucide-react';
import { type InlineImageData } from '../../lib/canvasState';
import { cn } from '../../lib/utils';
import { optimizePrompt } from '../../services/gemini';
import { PromptTextarea } from './PromptTextarea';
import {
  BANANA_IMAGE_SIZE_VALUES,
  DEFAULT_PROMPT_IMAGE_MODEL,
  normalizeBananaImageSize,
  type BananaAspectRatio,
  type BananaImageSize,
} from '../../lib/imageModels';
import { MaskEditorModal, type MaskGeneratePayload } from '../mask/MaskEditorModal';
import { useReferenceImages } from './useReferenceImages';
import { buildPromptMaskGenerationPayload, useMaskGeneration } from './useMaskGeneration';
import { usePromptGeneration } from './usePromptGeneration';
import {
  getEffectivePromptAspectRatio,
  getImage2MaskEditAspectRatio,
  getPromptAspectRatioOptions,
} from './promptAspectRatios';
import { MAX_REFERENCE_IMAGES } from '../../lib/referenceImageFormats';
import { edgeLinksReferenceAsset } from '../canvasReferenceConnections';

const aspectRatioLabels: Record<BananaAspectRatio, string> = {
  '1:1': '1:1 (正方形)',
  '1:4': '1:4 (超高)',
  '1:8': '1:8 (极高)',
  '2:3': '2:3 (竖版)',
  '3:2': '3:2 (横版)',
  '3:4': '3:4 (竖版)',
  '4:1': '4:1 (超宽)',
  '4:3': '4:3 (标准)',
  '4:5': '4:5 (社媒竖版)',
  '5:4': '5:4 (社媒横版)',
  '8:1': '8:1 (极宽)',
  '9:16': '9:16 (手机)',
  '16:9': '16:9 (宽屏)',
  '21:9': '21:9 (电影宽屏)',
};

const imageSizeLabels: Record<BananaImageSize, string> = {
  '512': '512 (0.5K 快速)',
  '1K': '1K (标准)',
  '2K': '2K (高清)',
  '4K': '4K (超清)',
};

export function PromptNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addNode = useStore((state) => state.addNode);
  const assets = useStore((state) => state.assets);
  const assetsHydrated = useStore((state) => state.assetsHydrated);
  const deleteNode = useStore((state) => state.deleteNode);
  const nodePosition = useStore((state) => {
    const node = state.nodes.find((n) => n.id === id);
    return node?.position;
  });

  const [prompt, setPrompt] = useState(data.prompt || '');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [maskEditorSource, setMaskEditorSource] = useState<{ image: InlineImageData; index: number } | null>(null);
  const [referenceReadError, setReferenceReadError] = useState<string | null>(null);
  const {
    fileInputRef,
    isReadingFile,
    referenceImages,
    referenceImageIds,
    hasPendingReferenceHydration,
    removeReferenceImage,
    handleImageUpload,
    handlePaste,
  } = useReferenceImages({
    nodeId: id,
    data,
    assets,
    assetsHydrated,
    updateNodeData,
    onReadError: setReferenceReadError,
  });
  const { generateMaskImage } = useMaskGeneration();
  const imageSize = normalizeBananaImageSize(data.imageSize) ?? '1K';
  const batchCount = Math.min(8, Math.max(1, Math.floor(data.batchCount || 1)));
  const imageModel = DEFAULT_PROMPT_IMAGE_MODEL;
  const aspectRatio = getEffectivePromptAspectRatio(imageModel, data.aspectRatio);
  const aspectRatioOptions = getPromptAspectRatioOptions(imageModel);
  const imageModelLabel = 'Image2';

  useEffect(() => {
    setPrompt(data.prompt || '');
  }, [data.prompt]);

  const commitPrompt = (nextPrompt: string) => {
    if (nextPrompt !== (data.prompt || '')) {
      updateNodeData(id, { prompt: nextPrompt });
    }
  };

  const { generatedCount, runGeneration, abortGeneration } = usePromptGeneration({
    nodeId: id,
    nodePosition,
    updateNodeData,
    addNode,
    deleteNode,
    setEdges: (edges) => {
      useStore.setState((state) => ({
        edges: [...state.edges, ...edges],
      }));
    },
    commitPrompt,
  });

  const handleDelete = () => {
    deleteNode(id);
  };

  const handleRemoveImage = (index: number) => {
    const referenceAssetId = referenceImageIds[index];
    removeReferenceImage(index);
    if (!referenceAssetId) return;
    useStore.setState((state) => ({
      edges: state.edges.filter((edge) => !edgeLinksReferenceAsset({
        edge,
        nodes: state.nodes,
        targetNodeId: id,
        referenceAssetId,
      })),
    }));
  };

  const handleMaskGenerate = async ({ prompt: maskPrompt, maskImage, sourceImage }: MaskGeneratePayload) => {
    if (!maskEditorSource) return;

    const baseX = nodePosition ? nodePosition.x + 400 : 0;
    const baseY = nodePosition ? nodePosition.y : 0;
    const createdAt = new Date().toISOString();
    const maskEditAspectRatio = getImage2MaskEditAspectRatio(data.aspectRatio);
    const placeholderNodeId = addNode(
      'imageNode',
      { x: baseX, y: baseY },
      {
        prompt: maskPrompt,
        imageModel: 'image2',
        aspectRatio: maskEditAspectRatio,
        imageSize,
        isLoading: true,
        error: undefined,
        createdAt,
        generationTitle: `Image2 局部编辑 | ${maskPrompt.slice(0, 28) || '生成任务'}`,
        sourceImage,
        sourcePrompt: maskPrompt,
        generationMode: 'mask-edit',
      }
    );

    useStore.setState((state) => ({
      edges: [
        ...state.edges,
        { id: `e-${id}-${placeholderNodeId}`, source: id, target: placeholderNodeId },
      ],
    }));

    try {
      let generationMetrics: AppNode['data']['generationMetrics'];
      const payload = buildPromptMaskGenerationPayload({
        maskPrompt,
        maskImage,
        sourceImage,
        sourceIndex: maskEditorSource.index,
        referenceImages,
        aspectRatio: maskEditAspectRatio,
        imageSize,
      });
      payload.onMetrics = (metrics) => {
        generationMetrics = metrics;
      };
      const url = await generateMaskImage(payload);

      updateNodeData(placeholderNodeId, {
        imageUrl: url,
        prompt: maskPrompt,
        imageModel: 'image2',
        aspectRatio: maskEditAspectRatio,
        imageSize,
        sourceImage,
        sourcePrompt: maskPrompt,
        generationMode: 'mask-edit',
        generationMetrics,
        isLoading: false,
        error: undefined,
      });
      setMaskEditorSource(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '局部编辑生成失败';
      updateNodeData(placeholderNodeId, {
        isLoading: false,
        error: errorMessage,
      });
      throw error;
    }
  };

  const handleOptimizePrompt = async () => {
    if (!prompt.trim()) return;
    setIsOptimizing(true);
    try {
      const optimized = await optimizePrompt(prompt);
      setPrompt(optimized);
      commitPrompt(optimized);
    } catch (error) {
      console.error("Failed to optimize prompt:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async (promptToUse = prompt) => {
    await runGeneration({
      prompt: promptToUse,
      imageModel,
      imageModelLabel,
      aspectRatio,
      imageSize,
      batchCount,
      referenceImageIds,
      referenceImages,
      hasPendingReferenceHydration,
    });
  };

  return (
    <div
      className="canvas-task-card w-80 rounded-2xl overflow-hidden transition-all"
      style={{
        background: '#1D1A14',
        border: `1px solid ${data.color || 'rgba(242,193,78,0.2)'}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 0 rgba(242,193,78,0)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(242,193,78,0.35)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.5), 0 0 0 0 rgba(242,193,78,0)';
      }}
      onPaste={handlePaste}
    >
      <Handle type="target" position={Position.Left} className="canvas-connection-handle w-5 h-5 border-2" style={{background: '#9B70D0', borderColor: '#1D1A14'}} />

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-bold">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-yellow-500 to-orange-500 flex items-center justify-center text-white shadow-sm">
              <Sparkles size={16} />
            </div>
            <span style={{color: '#EEE4CE'}}>AI画伴</span>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl shadow-sm" style={{background: 'rgba(22,19,15,0.8)', border: '1px solid rgba(242,193,78,0.15)'}}>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg transition-colors hover:text-red-400 hover:bg-[rgba(239,68,68,0.15)]"
              style={{color: '#96836F'}}
              title="删除节点"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <PromptTextarea
              value={prompt}
              isLoading={Boolean(data.isLoading)}
              onDraftChange={setPrompt}
              onCommit={commitPrompt}
              onSubmit={handleGenerate}
            />
            <button
              onClick={handleOptimizePrompt}
              disabled={isOptimizing || !prompt.trim()}
              className="absolute bottom-2 right-2 p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[rgba(242,193,78,0.2)]"
              style={{background: 'rgba(242,193,78,0.12)', color: '#F2C14E', border: '1px solid rgba(242,193,78,0.2)'}}
              title="使用 Gemini 3.1 Pro 优化提示词"
            >
              {isOptimizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              优化
            </button>
          </div>

          {/* Reference Images Section */}
          <div className="space-y-2">
            <div
              className="rounded-xl px-3 py-3 text-center transition-all"
              style={{
                border: '1px dashed rgba(242,193,78,0.22)',
                background: 'rgba(20,18,16,0.45)',
              }}
            >
              {referenceImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {referenceImages.map((img, index) => (
                    <div key={index} className="relative w-full aspect-square rounded-lg overflow-hidden" style={{background: '#141210', border: '1px solid rgba(242,193,78,0.15)'}}>
                      <img src={img.url} alt={`参考图 ${index + 1}`} className="w-full h-full object-cover opacity-80" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMaskEditorSource({ image: img, index });
                        }}
                        className="absolute top-1 left-1 z-20 rounded-full p-1 text-[#16130F] shadow transition-colors hover:bg-[#FFD36B]"
                        style={{ background: '#F2C14E' }}
                        title="使用 Image2 蒙版编辑"
                      >
                        <Edit3 size={10} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveImage(index);
                        }}
                        className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full shadow hover:bg-red-600 transition-colors z-20"
                        title="移除此参考图"
                      >
                        <X size={10} />
                      </button>
                      <div className="absolute bottom-1 left-1 px-1 py-0.5 rounded" style={{background: 'rgba(22,19,15,0.8)', color: '#F2C14E', fontSize: '10px', fontWeight: 500}}>
                        {index + 1}/{referenceImages.length}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-xs font-medium" style={{color: '#96836F'}}>
                    上传参考图
                  </p>
                  <p className="mt-1 text-[10px]" style={{color: '#5C4E3E'}}>
                    拖入画布创建图片元素，可在图片工具栏中“用作参考图”
                  </p>
                  <p className="mt-0.5 text-[10px]" style={{color: '#5C4E3E'}}>
                    Ctrl+V / ⌘V 可直接添加为参考图
                  </p>
                  <p className="mt-0.5 text-[10px]" style={{color: '#5C4E3E'}}>
                    支持 PNG、JPEG、WebP、GIF、SVG、HEIC/HEIF
                  </p>
                </div>
              )}

              {referenceImages.length < MAX_REFERENCE_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isReadingFile}
                  className="mx-auto mt-3 flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: 'rgba(242,193,78,0.12)',
                    border: '1px solid rgba(242,193,78,0.28)',
                    color: '#F2C14E',
                  }}
                  aria-label="添加参考图"
                  title="添加参考图"
                >
                  {isReadingFile
                    ? <Loader2 size={15} className="animate-spin" />
                    : <Plus size={16} />}
                </button>
              )}
            </div>

            {referenceReadError && (
              <p className="rounded-lg px-2.5 py-2 text-[10px] leading-relaxed" style={{background: 'rgba(239,68,68,0.08)', color: '#F87171'}}>
                {referenceReadError}
              </p>
            )}

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/heic,image/heif,.heic,.heif"
              onChange={handleImageUpload}
            />
          </div>

          <div className="p-4 rounded-xl space-y-4" style={{background: '#141210', border: '1px solid rgba(242,193,78,0.1)'}}>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#96836F'}}>画面比例</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => {
                    updateNodeData(id, { aspectRatio: e.target.value as typeof aspectRatio });
                  }}
                  className="nowheel w-full p-2 rounded-lg text-sm outline-none"
                  style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE'}}
                  onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.45)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.2)'}
                >
                  {aspectRatioOptions.map((ratio) => (
                    <option key={ratio} value={ratio}>{aspectRatioLabels[ratio]}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#96836F'}}>分辨率</label>
                <select
                  value={imageSize}
                  onChange={(e) => {
                    updateNodeData(id, { imageSize: e.target.value as typeof imageSize });
                  }}
                  className="nowheel w-full p-2 rounded-lg text-sm outline-none"
                  style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE'}}
                  onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.45)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.2)'}
                >
                  {BANANA_IMAGE_SIZE_VALUES.map((size) => (
                    <option key={size} value={size}>{imageSizeLabels[size]}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={`batch-count-${id}`} className="text-xs font-medium uppercase tracking-wider" style={{color: '#96836F'}}>
                    生成数量
                  </label>
                  <span className="text-xs tabular-nums" style={{color: '#EEE4CE'}}>{batchCount} 张</span>
                </div>
                <input
                  id={`batch-count-${id}`}
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={batchCount}
                  onChange={(event) => {
                    updateNodeData(id, { batchCount: Number(event.target.value) });
                  }}
                  className="nodrag nowheel w-full accent-[#F2C14E]"
                  aria-label="生成数量"
                />
                <div className="flex justify-between text-[10px]" style={{color: '#5C4E3E'}}>
                  <span>1 张</span>
                  <span>8 张</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#96836F'}}>节点颜色</label>
                <div className="flex gap-2 flex-wrap">
                  {['', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'].map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        updateNodeData(id, { color });
                      }}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all",
                        (data.color || '') === color ? "scale-110" : "border-transparent"
                      )}
                      style={{
                        backgroundColor: color || '#2A2620',
                        borderColor: (data.color || '') === color ? '#F2C14E' : 'transparent'
                      }}
                      title={color ? color : '默认'}
                    />
                  ))}
                </div>
              </div>
          </div>

          {data.error && (
            <div className="p-3 text-xs rounded-lg" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171'}}>
              {data.error}
            </div>
          )}

          <button
            onClick={() => handleGenerate()}
            disabled={data.isLoading || !prompt.trim() || hasPendingReferenceHydration}
            className="w-full py-3 px-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: data.isLoading || !prompt.trim()
                ? 'rgba(242,193,78,0.15)'
                : 'linear-gradient(135deg, #F2C14E 0%, #D97B3A 100%)',
              color: data.isLoading || !prompt.trim() ? '#5C4E3E' : '#16130F',
              boxShadow: data.isLoading || !prompt.trim()
                ? 'none'
                : '0 4px 20px rgba(242,193,78,0.3)',
            }}
          >
            {data.isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>{batchCount > 1 ? `生成中 ${generatedCount}/${batchCount}` : '生成中...'}</span>
              </>
            ) : (
              <>
                <ImageIcon size={18} />
                <span>生成图像 · {imageModelLabel}</span>
              </>
            )}
          </button>

          {data.isLoading && (
            <button
              onClick={() => {
                abortGeneration();
                updateNodeData(id, { isLoading: false });
              }}
              className="w-full py-1 text-[10px] transition-colors hover:text-[#96836F]"
              style={{color: '#5C4E3E'}}
            >
              如果长时间无响应，点击此处重置状态
            </button>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="canvas-connection-handle w-5 h-5 border-2" style={{background: '#5B9BD5', borderColor: '#1D1A14'}} />
      {maskEditorSource && (
        <MaskEditorModal
          title="局部编辑参考图"
          sourceImage={maskEditorSource.image}
          onClose={() => setMaskEditorSource(null)}
          onGenerate={handleMaskGenerate}
        />
      )}
    </div>
  );
}
