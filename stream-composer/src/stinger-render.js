// ============================================================================
// STINGER RENDER — draws one stinger-templates.js frame (a plain list of
// layer instructions) onto a real 2D canvas context. Used identically by
// the live preview loop and the real video export loop, so what you see
// while editing and what actually gets exported can never visually diverge
// — same principle as the popup-slide engine's one-atomic-entry-point rule.
//
// Not a pure function (it touches a real CanvasRenderingContext2D), so this
// isn't Node-unit-testable — the templates that decide WHAT to draw are
// already fully covered by stinger-templates.test.mjs; this file is
// deliberately kept mechanical (just "take numbers, draw them") to keep the
// real correctness risk concentrated in the tested, pure layer.
//
// `background`:
//   - null/undefined -> cleared to fully transparent (used for the
//     alpha-export preview and the real alpha-mode export).
//   - a CSS color string -> the canvas is filled with that color before any
//     layer is drawn, so "transparent" areas of the frame become a solid,
//     chroma-keyable color instead (used for chromakey-mode preview/export).
// ============================================================================

export function renderStingerFrame(ctx, frameData, assets, background) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  for (const layer of frameData.layers) {
    if (layer.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity;

    if (layer.kind === 'wipe') {
      ctx.fillStyle = layer.color;
      ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
    } else if (layer.kind === 'logo' && assets.logo && layer.width > 0 && layer.height > 0) {
      ctx.drawImage(assets.logo, layer.x, layer.y, layer.width, layer.height);
    }

    ctx.restore();
  }
}
