// ============================================================================
// STINGER TEMPLATES — built-in transition animations, not a generic keyframe
// timeline editor. Each template is a pure function of time:
//
//   renderFrame(t, durationMs, props) -> { layers: [...] }
//
// t and durationMs are in milliseconds; t=0 is the very start, t=durationMs
// is the very end. Every template is deterministic and side-effect-free —
// same discipline as every image-editing module in this app — so it's
// directly unit-testable with known-input/known-output assertions, and the
// SAME function drives both the live preview and the real video export
// (stinger-render.js just draws whatever a template returns), so they can
// never visually diverge from each other.
//
// `layers` is a flat list of draw instructions, each one of:
//   { kind: 'logo', x, y, width, height, opacity, rotation }
//   { kind: 'wipe', x, y, width, height, color, opacity }
// x/y are the layer's top-left corner in canvas pixels. stinger-render.js
// (not this file) is responsible for actually drawing these onto a canvas.
// ============================================================================

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Standard ease-in-out cubic — used by every template below so motion reads
// consistently across the whole builder rather than each template inventing
// its own feel.
function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function centeredLogoLayer(x, y, width, height, opacity) {
  return { kind: 'logo', x, y, width, height, opacity, rotation: 0 };
}

// ---- FADE -------------------------------------------------------------
// Fade in (0-25%), hold (25-75%), fade out (75-100%). The simplest
// template — a safe default.
function fadeFrame(t, durationMs, props) {
  const progress = clamp01(t / durationMs);
  let opacity;
  if (progress < 0.25) {
    opacity = easeInOutCubic(progress / 0.25);
  } else if (progress < 0.75) {
    opacity = 1;
  } else {
    opacity = 1 - easeInOutCubic((progress - 0.75) / 0.25);
  }
  const x = (props.canvasWidth - props.logoWidth) / 2;
  const y = (props.canvasHeight - props.logoHeight) / 2;
  return { layers: [centeredLogoLayer(x, y, props.logoWidth, props.logoHeight, opacity)] };
}

// ---- SLIDE THROUGH ------------------------------------------------------
// Slides in from off-screen-left (0-35%), holds centered (35-65%), slides
// out off-screen-right (65-100%) — a "pass-through" feel.
function slideFrame(t, durationMs, props) {
  const progress = clamp01(t / durationMs);
  const centerX = (props.canvasWidth - props.logoWidth) / 2;
  const offLeft = -props.logoWidth;
  const offRight = props.canvasWidth;
  let x;
  if (progress < 0.35) {
    x = lerp(offLeft, centerX, easeInOutCubic(progress / 0.35));
  } else if (progress < 0.65) {
    x = centerX;
  } else {
    x = lerp(centerX, offRight, easeInOutCubic((progress - 0.65) / 0.35));
  }
  const y = (props.canvasHeight - props.logoHeight) / 2;
  return { layers: [centeredLogoLayer(x, y, props.logoWidth, props.logoHeight, 1)] };
}

// ---- ZOOM BURST ---------------------------------------------------------
// Scales up with a slight overshoot (0-30%), holds at full size (30-70%),
// scales/fades back down to nothing (70-100%).
function zoomBurstFrame(t, durationMs, props) {
  const progress = clamp01(t / durationMs);
  let scale, opacity;
  if (progress < 0.3) {
    const p = progress / 0.3;
    scale = p < 0.7
      ? lerp(0, 1.15, easeInOutCubic(p / 0.7))
      : lerp(1.15, 1.0, easeInOutCubic((p - 0.7) / 0.3));
    opacity = clamp01(p / 0.4);
  } else if (progress < 0.7) {
    scale = 1;
    opacity = 1;
  } else {
    const p = (progress - 0.7) / 0.3;
    scale = lerp(1, 0, easeInOutCubic(p));
    opacity = lerp(1, 0, easeInOutCubic(p));
  }
  const width = props.logoWidth * scale;
  const height = props.logoHeight * scale;
  const x = (props.canvasWidth - width) / 2;
  const y = (props.canvasHeight - height) / 2;
  return { layers: [centeredLogoLayer(x, y, width, height, opacity)] };
}

// ---- WIPE -----------------------------------------------------------------
// A solid color panel wipes left-to-right to cover the screen (0-40%),
// holds fully covered with the logo centered on top (40-60%), then wipes
// away again (60-100%).
function wipeFrame(t, durationMs, props) {
  const progress = clamp01(t / durationMs);
  let wipeWidth, logoOpacity;
  if (progress < 0.4) {
    wipeWidth = lerp(0, props.canvasWidth, easeInOutCubic(progress / 0.4));
    logoOpacity = clamp01((progress - 0.25) / 0.15);
  } else if (progress < 0.6) {
    wipeWidth = props.canvasWidth;
    logoOpacity = 1;
  } else {
    wipeWidth = lerp(props.canvasWidth, 0, easeInOutCubic((progress - 0.6) / 0.4));
    logoOpacity = clamp01(1 - (progress - 0.75) / 0.15);
  }
  const logoX = (props.canvasWidth - props.logoWidth) / 2;
  const logoY = (props.canvasHeight - props.logoHeight) / 2;
  return {
    layers: [
      { kind: 'wipe', x: 0, y: 0, width: wipeWidth, height: props.canvasHeight, color: props.primaryColor, opacity: 1 },
      centeredLogoLayer(logoX, logoY, props.logoWidth, props.logoHeight, logoOpacity),
    ],
  };
}

export const STINGER_TEMPLATES = [
  { key: 'fade', label: 'Fade', description: 'Simple fade in, hold, fade out.', renderFrame: fadeFrame },
  { key: 'slide', label: 'Slide Through', description: 'Slides in from the left, holds, slides out to the right.', renderFrame: slideFrame },
  { key: 'zoom-burst', label: 'Zoom Burst', description: 'Scales up with a quick overshoot, holds, scales back down.', renderFrame: zoomBurstFrame },
  { key: 'wipe', label: 'Wipe', description: 'A solid color panel wipes across to cover the screen, then wipes away.', renderFrame: wipeFrame },
];

export function defaultStingerProps() {
  return {
    canvasWidth: 1920,
    canvasHeight: 1080,
    durationMs: 1500,
    logoWidth: 400,
    logoHeight: 400,
    logoScalePercent: 35, // logoHeight as a % of canvasHeight — see resizeStingerCanvas()
    primaryColor: '#7c5cff',
    keyColor: '#00ff00',
    exportMode: 'chromakey', // 'chromakey' | 'alpha' — see stinger-export.js
  };
}
