// ============================================================================
// BACKGROUND GENERATOR — a standalone tool (same "works with no project
// open" pattern as the Stinger Builder) that generates a static background
// image for a stream: solid color, a gradient, or a photo with a
// semi-transparent gradient overlaid on top (the "ghost effect" Harvey
// asked for). Exports a plain PNG file — not tied to a Stream Composer
// project, usable directly as an OBS Image Source.
//
// Reuses gradient.js's gradientCoordsForAngle() so this tool's gradients
// look identical to a Frame item's gradient fill elsewhere in the app —
// one shared angle formula, not two independent guesses.
//
// Pure, testable helpers live here. The actual canvas drawing
// (drawBackground) needs a real 2D rendering context and isn't
// unit-tested itself — kept thin and built only from the pure helpers
// below, same split this project already uses for the Stinger templates.
// ============================================================================

import { gradientCoordsForAngle } from './gradient.js';

export function defaultBackgroundProps() {
  return {
    canvasWidth: 1920,
    canvasHeight: 1080,
    fillType: 'solid', // 'solid' | 'gradient' | 'image-gradient'
    solidColor: '#0a0a12',
    gradientStyle: 'linear', // 'linear' | 'radial'
    gradientFrom: '#7c5cff',
    gradientTo: '#0a0a12',
    gradientMidEnabled: false,
    gradientMid: '#a594ff', // only used when gradientMidEnabled - fixed at the 0.5 stop
    gradientAngle: 135,
    overlayOpacity: 0.55, // image-gradient mode only: how strong the gradient sits over the photo
  };
}

// TheNerdyBox's real brand tokens (@thenerdybox/ui, the org's actual design
// system - not invented here) as a one-click preset: a radial glow from
// violet-soft (brightest) through violet to void at the edge, matching the
// site's own "ambient wash" gradient language rather than a flat 2-color guess.
export const THENERDYBOX_PRESET = {
  gradientStyle: 'radial',
  gradientFrom: '#a594ff', // --violet-soft
  gradientMid: '#7c5cff',  // --violet
  gradientTo: '#0a0a12',   // --void
  gradientMidEnabled: true,
};

// CSS `background-size: cover`-equivalent: the largest centered rect of the
// image's own aspect ratio that fully covers a box of boxWidth x boxHeight,
// cropping overflow evenly on both sides rather than stretching/distorting.
export function coverFitRect(imageWidth, imageHeight, boxWidth, boxHeight) {
  const imageRatio = imageWidth / imageHeight;
  const boxRatio = boxWidth / boxHeight;
  let drawWidth, drawHeight;
  if (imageRatio > boxRatio) {
    drawHeight = boxHeight;
    drawWidth = boxHeight * imageRatio;
  } else {
    drawWidth = boxWidth;
    drawHeight = boxWidth / imageRatio;
  }
  return {
    x: (boxWidth - drawWidth) / 2,
    y: (boxHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

// A plain hex gradient stop would be fully opaque and hide the image
// underneath completely — the "ghost effect" needs the gradient's own
// color stops carrying their own alpha instead.
export function hexToRgba(hex, alpha) {
  const clean = (hex || '').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Pure description of what to draw — a real <canvas> 2D context turns this
// into actual draw calls (drawBackground below), but the *decision* of
// what gradient/colors/rect to use is computed here where it's testable.
export function resolveBackgroundPlan(props, width, height, imageSize) {
  const plan = { fillType: props.fillType };

  if (props.fillType === 'image-gradient' && imageSize) {
    plan.imageRect = coverFitRect(imageSize.width, imageSize.height, width, height);
  }

  if (props.fillType === 'solid') {
    plan.solidColor = props.solidColor;
    return plan;
  }

  const isOverlay = props.fillType === 'image-gradient';
  plan.gradientStyle = props.gradientStyle;
  plan.fromColor = isOverlay ? hexToRgba(props.gradientFrom, props.overlayOpacity) : props.gradientFrom;
  plan.toColor = isOverlay ? hexToRgba(props.gradientTo, props.overlayOpacity) : props.gradientTo;
  if (props.gradientMidEnabled) {
    plan.midColor = isOverlay ? hexToRgba(props.gradientMid, props.overlayOpacity) : props.gradientMid;
  }

  if (props.gradientStyle === 'radial') {
    plan.radial = { cx: width / 2, cy: height / 2, r: Math.max(width, height) / 2 };
  } else {
    const coords = gradientCoordsForAngle(props.gradientAngle);
    plan.linear = { x1: coords.x1 * width, y1: coords.y1 * height, x2: coords.x2 * width, y2: coords.y2 * height };
  }

  return plan;
}

// Draws a resolved plan onto a real 2D canvas context. Not unit-tested
// itself (needs a real Canvas rendering environment) — every actual
// decision it makes was already computed by resolveBackgroundPlan() above.
export function drawBackground(ctx, width, height, props, image) {
  const imageSize = image ? { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height } : null;
  const plan = resolveBackgroundPlan(props, width, height, imageSize);

  ctx.clearRect(0, 0, width, height);

  if (plan.fillType === 'solid') {
    ctx.fillStyle = plan.solidColor;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (plan.fillType === 'image-gradient' && image && plan.imageRect) {
    ctx.drawImage(image, plan.imageRect.x, plan.imageRect.y, plan.imageRect.width, plan.imageRect.height);
  }

  const gradient = plan.gradientStyle === 'radial'
    ? ctx.createRadialGradient(plan.radial.cx, plan.radial.cy, 0, plan.radial.cx, plan.radial.cy, plan.radial.r)
    : ctx.createLinearGradient(plan.linear.x1, plan.linear.y1, plan.linear.x2, plan.linear.y2);
  gradient.addColorStop(0, plan.fromColor);
  if (plan.midColor) gradient.addColorStop(0.5, plan.midColor);
  gradient.addColorStop(1, plan.toColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
