// ============================================================================
// Tests for coloradjust.js. Runs in plain Node — see chromakey.test.mjs for
// why that property matters.
//
// Run with: node src/coloradjust.test.mjs
// ============================================================================

import { applyColorAdjustments } from './coloradjust.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function onePixel(r, g, b, a = 255) {
  return { width: 1, height: 1, data: new Uint8ClampedArray([r, g, b, a]) };
}
function px(img) {
  return { r: img.data[0], g: img.data[1], b: img.data[2], a: img.data[3] };
}

// ---- Identity: all-zero options change nothing ----
const flat = applyColorAdjustments(onePixel(120, 80, 200, 200), { brightness: 0, contrast: 0, saturation: 0 });
assert(px(flat).r === 120 && px(flat).g === 80 && px(flat).b === 200, 'no-op options leave RGB unchanged');
assert(px(flat).a === 200, 'alpha is always untouched');

// ---- Brightness ----
const brighter = applyColorAdjustments(onePixel(100, 100, 100), { brightness: 0.2 });
assert(px(brighter).r > 100, `positive brightness raises channel values (got ${px(brighter).r})`);
const brightClamped = applyColorAdjustments(onePixel(250, 250, 250), { brightness: 0.5 });
assert(px(brightClamped).r === 255, `brightness clamps at 255 instead of wrapping (got ${px(brightClamped).r})`);
const darker = applyColorAdjustments(onePixel(100, 100, 100), { brightness: -0.2 });
assert(px(darker).r < 100, `negative brightness lowers channel values (got ${px(darker).r})`);

// ---- Contrast ----
const darkPixelMoreContrast = applyColorAdjustments(onePixel(60, 60, 60), { contrast: 0.5 });
assert(px(darkPixelMoreContrast).r < 60, `positive contrast pushes a below-midpoint pixel darker (got ${px(darkPixelMoreContrast).r})`);
const lightPixelMoreContrast = applyColorAdjustments(onePixel(200, 200, 200), { contrast: 0.5 });
assert(px(lightPixelMoreContrast).r > 200, `positive contrast pushes an above-midpoint pixel lighter (got ${px(lightPixelMoreContrast).r})`);
const midGrayUnaffected = applyColorAdjustments(onePixel(128, 128, 128), { contrast: 0.9 });
assert(px(midGrayUnaffected).r === 128, `mid-gray (128) is the contrast pivot and stays put (got ${px(midGrayUnaffected).r})`);

// ---- Saturation ----
const colorful = onePixel(200, 50, 50); // a saturated red
const desaturated = applyColorAdjustments(colorful, { saturation: -1 });
const p = px(desaturated);
assert(p.r === p.g && p.g === p.b, `saturation:-1 fully desaturates to gray (got r=${p.r} g=${p.g} b=${p.b})`);

const untouchedSat = applyColorAdjustments(colorful, { saturation: 0 });
assert(px(untouchedSat).r === 200 && px(untouchedSat).g === 50, 'saturation:0 leaves a colorful pixel unchanged');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
