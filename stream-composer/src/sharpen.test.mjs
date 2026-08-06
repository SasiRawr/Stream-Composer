// ============================================================================
// Tests for sharpen.js. Runs in plain Node — see chromakey.test.mjs for why
// that property matters.
//
// Run with: node src/sharpen.test.mjs
// ============================================================================

import { applySharpen } from './sharpen.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
}

// ---- amount:0 is a true no-op ----
const anyImage = { width: 1, height: 1, data: new Uint8ClampedArray([100, 150, 200, 128]) };
const unsharpened = applySharpen(anyImage, { amount: 0 });
assert(px(unsharpened, 0, 0).r === 100 && px(unsharpened, 0, 0).a === 128, `amount:0 is a true no-op (got r=${px(unsharpened, 0, 0).r} a=${px(unsharpened, 0, 0).a})`);

// ---- a flat uniform-color region is unaffected (original == blurred there) ----
const SIZE = 9;
const flatData = new Uint8ClampedArray(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) {
  flatData[i * 4] = 120; flatData[i * 4 + 1] = 60; flatData[i * 4 + 2] = 200; flatData[i * 4 + 3] = 255;
}
const sharpenedFlat = applySharpen({ width: SIZE, height: SIZE, data: flatData }, { amount: 2, radius: 2 });
const center = px(sharpenedFlat, 4, 4);
assert(center.r === 120 && center.g === 60 && center.b === 200, `a flat region is unaffected by sharpening (original == local blur there) (got r=${center.r} g=${center.g} b=${center.b})`);

// ---- a sharp edge gets MORE pronounced (overshoot), not softened ----
const edgeData = new Uint8ClampedArray(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const isLeft = x < SIZE / 2;
    edgeData[i] = isLeft ? 50 : 200;
    edgeData[i + 1] = isLeft ? 50 : 200;
    edgeData[i + 2] = isLeft ? 50 : 200;
    edgeData[i + 3] = 255;
  }
}
const sharpenedEdge = applySharpen({ width: SIZE, height: SIZE, data: edgeData }, { amount: 1, radius: 2 });
// Just past the edge on the bright side, sharpening should push the value
// ABOVE the original 200 (overshoot) - the signature of unsharp masking,
// the opposite of what blur would do.
const brightSideNearEdge = px(sharpenedEdge, 5, 4);
assert(brightSideNearEdge.r > 200, `sharpening overshoots brighter past an edge, rather than softening it (got r=${brightSideNearEdge.r}, original was 200)`);

// ---- alpha is always preserved exactly, even with strong sharpening ----
const withAlpha = { width: 3, height: 3, data: new Uint8ClampedArray([
  10,10,10,50,   200,200,200,120,  10,10,10,50,
  200,200,200,90, 10,10,10,255,    200,200,200,90,
  10,10,10,50,   200,200,200,120,  10,10,10,50,
])};
const sharpenedAlpha = applySharpen(withAlpha, { amount: 3, radius: 1 });
assert(px(sharpenedAlpha, 1, 1).a === 255, `alpha is preserved exactly regardless of sharpening strength (got a=${px(sharpenedAlpha, 1, 1).a})`);
assert(px(sharpenedAlpha, 0, 1).a === 90, `alpha preserved at another pixel too (got a=${px(sharpenedAlpha, 0, 1).a})`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
