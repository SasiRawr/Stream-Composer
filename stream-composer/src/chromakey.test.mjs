// ============================================================================
// Tests for chromakey.js's applyChromaKey. Runs in plain Node (no browser,
// no GPU) — that's a deliberate property of applyChromaKey (see its own
// comments), so these tests can actually catch a broken algorithm rather
// than just "does it compile."
//
// Run with: node src/chromakey.test.mjs
// ============================================================================

import { applyChromaKey } from './chromakey.js';

function pixel(data, w, x, y) {
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function makeImage(pixelsRowByRow) {
  const height = pixelsRowByRow.length;
  const width = pixelsRowByRow[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  let i = 0;
  for (const row of pixelsRowByRow) {
    for (const [r, g, b] of row) {
      data[i++] = r; data[i++] = g; data[i++] = b; data[i++] = 255;
    }
  }
  return { width, height, data };
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const img = makeImage([
  [
    [0, 255, 0],     // pure key green -> should fully key out
    [80, 200, 60],   // near-green, inside the feather band -> partial alpha
    [80, 60, 200],   // clearly different "subject" color -> fully opaque
    [255, 255, 255], // white -> fully opaque
  ],
]);

const KEY = { r: 0, g: 255, b: 0 };
const result = applyChromaKey(img, { keyColor: KEY, similarity: 0.12, feather: 0.08, spillSuppression: 0.5 });

const pPureGreen = pixel(result.data, 4, 0, 0);
const pNearGreen = pixel(result.data, 4, 1, 0);
const pSubject   = pixel(result.data, 4, 2, 0);
const pWhite     = pixel(result.data, 4, 3, 0);

assert(pPureGreen.a === 0, `pure key green fully transparent (got alpha=${pPureGreen.a})`);
assert(pSubject.a === 255, `clearly-different subject color stays fully opaque (got alpha=${pSubject.a})`);
assert(pWhite.a === 255, `white stays fully opaque (got alpha=${pWhite.a})`);
assert(pNearGreen.a > 0 && pNearGreen.a < 255, `near-green pixel gets a partial/feathered alpha, not a hard cut (got alpha=${pNearGreen.a})`);
assert(pNearGreen.g < 200, `spill suppression reduces the green channel on a near-key pixel (was 200, got ${pNearGreen.g})`);

// Different key color: verify the "which channel is dominant" logic isn't
// hardcoded to green.
const blueImg = makeImage([[[0, 0, 255], [200, 50, 40]]]);
const blueResult = applyChromaKey(blueImg, { keyColor: { r: 0, g: 0, b: 255 }, similarity: 0.12, feather: 0.08 });
const pBlueKeyed = pixel(blueResult.data, 2, 0, 0);
const pRedSubject = pixel(blueResult.data, 2, 1, 0);
assert(pBlueKeyed.a === 0, `blue key color also keys out correctly (got alpha=${pBlueKeyed.a})`);
assert(pRedSubject.a === 255, `non-blue subject survives a blue key (got alpha=${pRedSubject.a})`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
