// ============================================================================
// Tests for croppad.js. Runs in plain Node — see chromakey.test.mjs for why
// that property matters (verifiable by known input/output, no browser/GPU).
//
// Run with: node src/croppad.test.mjs
// ============================================================================

import { cropImageData, padImageData } from './croppad.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function makeImage(pixelsRowByRow) {
  const height = pixelsRowByRow.length;
  const width = pixelsRowByRow[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  let i = 0;
  for (const row of pixelsRowByRow) {
    for (const [r, g, b, a] of row) {
      data[i++] = r; data[i++] = g; data[i++] = b; data[i++] = a ?? 255;
    }
  }
  return { width, height, data };
}

function pixel(img, x, y) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
}

// ---- CROP ----
const source = makeImage([
  [[255, 0, 0], [0, 255, 0], [0, 0, 255]],
  [[10, 10, 10], [20, 20, 20], [30, 30, 30]],
  [[40, 40, 40], [50, 50, 50], [60, 60, 60]],
]);

const cropped = cropImageData(source, { x: 1, y: 1, width: 2, height: 2 });
assert(cropped.width === 2 && cropped.height === 2, `crop produces the requested 2x2 size (got ${cropped.width}x${cropped.height})`);
assert(pixel(cropped, 0, 0).r === 20, `crop's top-left pixel is the source's (1,1) pixel (got r=${pixel(cropped, 0, 0).r})`);
assert(pixel(cropped, 1, 1).r === 60, `crop's bottom-right pixel is the source's (2,2) pixel (got r=${pixel(cropped, 1, 1).r})`);

// Out-of-bounds crop box gets clamped, not thrown.
const clamped = cropImageData(source, { x: 2, y: 2, width: 10, height: 10 });
assert(clamped.width === 1 && clamped.height === 1, `an out-of-bounds crop box clamps to what actually exists (got ${clamped.width}x${clamped.height})`);

// ---- PAD ----
const small = makeImage([[[100, 150, 200]]]); // 1x1 image
const padded = padImageData(small, { top: 1, right: 2, bottom: 1, left: 2 });
assert(padded.width === 5 && padded.height === 3, `pad grows the canvas by the requested margins (got ${padded.width}x${padded.height}, expected 5x3 for a 1x1 source with left=2,right=2,top=1,bottom=1)`);
assert(pixel(padded, 2, 1).r === 100 && pixel(padded, 2, 1).g === 150, `the original pixel lands at the correct offset position after padding`);
assert(pixel(padded, 0, 0).a === 0, `padding defaults to fully transparent border (got alpha=${pixel(padded, 0, 0).a})`);

const paddedWithFill = padImageData(small, { top: 1, right: 1, bottom: 1, left: 1, fillColor: { r: 10, g: 20, b: 30, a: 255 } });
assert(pixel(paddedWithFill, 0, 0).r === 10 && pixel(paddedWithFill, 0, 0).a === 255, `a solid fill color is respected instead of transparency when provided`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
