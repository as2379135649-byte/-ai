# Design QA

- Source visual truth: `/var/folders/c7/5vfn_l316rqfw_s10lnpgv2c0000gn/T/codex-clipboard-badbed8a-c3ad-4ef9-8af3-3b38b96ce0d6.png`
- Implementation full-view screenshot: `/Users/cc/Downloads/banana-canvas-main/design-qa-canvas-full.png`
- Implementation focused screenshot: `/Users/cc/Downloads/banana-canvas-main/design-qa-image2-output-settings.png`
- Viewport: 1280 × 720
- State: project “再测一遍”, Image2 selected, output settings visible, PNG + b64_json + 1 partial preview

## Full-view comparison evidence

The updated output settings remain inside the existing prompt-node settings card and preserve the product's dark brown/gold visual system. Removing the quality row shortens the panel without leaving an empty grid cell or disrupting the controls below it.

## Focused comparison evidence

The source image identifies the former “质量 / low 基础” selector that must be removed. The focused implementation capture shows no quality label or selector. Output format and return format now share the first row; partial previews use a separate explanatory row, followed by compression. The live DOM confirms three selects and no label whose text is “质量”.

## Required fidelity surfaces

- Fonts and typography: existing system font, weights, uppercase tracking, sizes, and hierarchy are preserved; the new subtitle uses the established muted secondary text color.
- Spacing and layout rhythm: the former quality slot is removed; the two-column output row and full-width partial-preview row have balanced spacing with no dead area.
- Colors and visual tokens: existing `#F2C14E`, `#96836F`, dark panel background, borders, radii, and focus-compatible select styling are retained.
- Image quality and asset fidelity: no raster, illustration, logo, or non-standard icon assets were added or replaced; the existing Info icon remains from the current icon library.
- Copy and content: “Image2 输出设置”, “画质由接口默认处理”, and “过程预览 / 流式生成时返回的中间图” explain the new behavior without presenting a misleading quality choice.

## Findings

No actionable P0, P1, or P2 findings.

## Interaction and runtime checks

- Quality selector absent from the rendered DOM.
- Output format, return format, and partial-preview selectors remain present.
- Compression remains disabled for PNG as designed.
- Browser console errors: 0.
- Full automated suite: 254 passed.

## Comparison history

- Pass 1: source control was removed, remaining controls were reflowed, and explanatory copy was added. Focused and full-view evidence showed no empty slot or hierarchy regression. No P0/P1/P2 fixes were required after this pass.

## Follow-up polish

No remaining P3 items required for this scoped change.

final result: passed
