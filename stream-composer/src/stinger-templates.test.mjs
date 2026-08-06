// ============================================================================
// Tests for stinger-templates.js. Runs in plain Node — every template is a
// pure function of time, so this is genuinely checkable without any visual
// tooling, same as the image-editing modules.
//
// Run with: node src/stinger-templates.test.mjs
// ============================================================================

import { STINGER_TEMPLATES, defaultStingerProps } from './stinger-templates.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function close(a, b, eps = 1e-9) { return Math.abs(a - b) < eps; }

function template(key) {
  const t = STINGER_TEMPLATES.find((t) => t.key === key);
  if (!t) throw new Error(`no such template: ${key}`);
  return t;
}

assert(STINGER_TEMPLATES.length === 4, `there are exactly 4 built-in templates (got ${STINGER_TEMPLATES.length})`);
for (const t of STINGER_TEMPLATES) {
  assert(!!t.key && !!t.label && !!t.description && typeof t.renderFrame === 'function', `template '${t.key}' has key/label/description/renderFrame`);
}

const props = defaultStingerProps();
const D = props.durationMs;

// ---- Fade ----
const fade = template('fade');
assert(close(fade.renderFrame(0, D, props).layers[0].opacity, 0), 'fade: opacity is exactly 0 at t=0');
assert(close(fade.renderFrame(D, D, props).layers[0].opacity, 0), 'fade: opacity is exactly 0 at t=durationMs');
assert(close(fade.renderFrame(D / 2, D, props).layers[0].opacity, 1), 'fade: opacity is exactly 1 during the hold (t=durationMs/2)');

// ---- Slide Through ----
const slide = template('slide');
const slideAt0 = slide.renderFrame(0, D, props).layers[0];
const slideAtEnd = slide.renderFrame(D, D, props).layers[0];
const slideAtHold = slide.renderFrame(D / 2, D, props).layers[0];
assert(close(slideAt0.x, -props.logoWidth), `slide: starts fully off-screen-left at t=0 (got x=${slideAt0.x})`);
assert(close(slideAtEnd.x, props.canvasWidth), `slide: ends fully off-screen-right at t=durationMs (got x=${slideAtEnd.x})`);
assert(close(slideAtHold.x, (props.canvasWidth - props.logoWidth) / 2), `slide: centered during the hold (got x=${slideAtHold.x})`);
assert(slideAtHold.opacity === 1, 'slide: always fully opaque (no fade in this template)');

// ---- Zoom Burst ----
const zoom = template('zoom-burst');
const zoomAt0 = zoom.renderFrame(0, D, props).layers[0];
const zoomAtEnd = zoom.renderFrame(D, D, props).layers[0];
const zoomAtHold = zoom.renderFrame(D / 2, D, props).layers[0];
assert(close(zoomAt0.width, 0) && close(zoomAt0.opacity, 0), `zoom-burst: starts at zero size/opacity at t=0 (got width=${zoomAt0.width} opacity=${zoomAt0.opacity})`);
assert(close(zoomAtEnd.width, 0) && close(zoomAtEnd.opacity, 0), `zoom-burst: ends at zero size/opacity at t=durationMs (got width=${zoomAtEnd.width} opacity=${zoomAtEnd.opacity})`);
assert(close(zoomAtHold.width, props.logoWidth) && close(zoomAtHold.opacity, 1), `zoom-burst: full size/opacity during the hold (got width=${zoomAtHold.width} opacity=${zoomAtHold.opacity})`);

// ---- Wipe ----
const wipe = template('wipe');
const wipeAt0 = wipe.renderFrame(0, D, props);
const wipeAtEnd = wipe.renderFrame(D, D, props);
const wipeAtHold = wipe.renderFrame(D / 2, D, props);
assert(close(wipeAt0.layers[0].width, 0), `wipe: the wipe panel starts at zero width at t=0 (got ${wipeAt0.layers[0].width})`);
assert(close(wipeAt0.layers[1].opacity, 0), 'wipe: the logo is invisible at t=0');
assert(close(wipeAtEnd.layers[0].width, 0), `wipe: the wipe panel ends back at zero width at t=durationMs (got ${wipeAtEnd.layers[0].width})`);
assert(close(wipeAtEnd.layers[1].opacity, 0), 'wipe: the logo is invisible again at t=durationMs');
assert(close(wipeAtHold.layers[0].width, props.canvasWidth), `wipe: the panel fully covers the canvas during the hold (got ${wipeAtHold.layers[0].width})`);
assert(close(wipeAtHold.layers[1].opacity, 1), 'wipe: the logo is fully visible during the hold');
assert(wipeAtHold.layers[0].color === props.primaryColor, 'wipe: the panel uses the configured primary color');

// ---- All templates: opacity/size never go negative or NaN across a full sweep ----
for (const t of STINGER_TEMPLATES) {
  let bad = null;
  for (let i = 0; i <= 20; i++) {
    const time = (i / 20) * D;
    const frame = t.renderFrame(time, D, props);
    for (const layer of frame.layers) {
      if (!(layer.opacity >= 0 && layer.opacity <= 1) || Number.isNaN(layer.opacity)) bad = `opacity=${layer.opacity} at t=${time}`;
      if (layer.width !== undefined && (layer.width < 0 || Number.isNaN(layer.width))) bad = `width=${layer.width} at t=${time}`;
    }
  }
  assert(bad === null, `'${t.key}': opacity/width stay in valid ranges across a full time sweep${bad ? ' (got ' + bad + ')' : ''}`);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
