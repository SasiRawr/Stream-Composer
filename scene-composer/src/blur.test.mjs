// ============================================================================
// Tests for blur.js. Runs in plain Node — see chromakey.test.mjs for why
// that property matters.
//
// Run with: node src/blur.test.mjs
// ============================================================================

import { applyBlur } from './blur.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
}

// ---- radius:0 is a true no-op ----
const flat = { width: 3, height: 3, data: new Uint8ClampedArray([
  10,10,10,255,  20,20,20,255,  30,30,30,255,
  40,40,40,255,  50,50,50,255,  60,60,60,255,
  70,70,70,255,  80,80,80,255,  90,90,90,255,
])};
const unblurred = applyBlur(flat, { radius: 0 });
assert(px(unblurred, 1, 1).r === 50, `radius:0 is a true no-op (got ${px(unblurred, 1, 1).r}, expected 50)`);

// ---- a uniform flat-color block is unchanged in its interior ----
const SIZE = 9;
const flatData = new Uint8ClampedArray(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) {
  flatData[i * 4] = 120; flatData[i * 4 + 1] = 60; flatData[i * 4 + 2] = 200; flatData[i * 4 + 3] = 255;
}
const blurredFlat = applyBlur({ width: SIZE, height: SIZE, data: flatData }, { radius: 3 });
const center = px(blurredFlat, 4, 4);
assert(center.r === 120 && center.g === 60 && center.b === 200, `blurring a uniform color leaves its interior unchanged (got r=${center.r} g=${center.g} b=${center.b})`);

// ---- a sharp edge gets softened toward the average of both sides ----
const edgeData = new Uint8ClampedArray(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const isLeft = x < SIZE / 2;
    edgeData[i] = isLeft ? 0 : 255;
    edgeData[i + 1] = isLeft ? 0 : 255;
    edgeData[i + 2] = isLeft ? 0 : 255;
    edgeData[i + 3] = 255;
  }
}
const blurredEdge = applyBlur({ width: SIZE, height: SIZE, data: edgeData }, { radius: 2 });
const atBoundary = px(blurredEdge, 4, 4); // right at the black/white seam
assert(atBoundary.r > 0 && atBoundary.r < 255, `a sharp edge softens to an in-between value, not a hard cut (got r=${atBoundary.r})`);

// ---- the important one: blurring near transparency doesn't darken the
// opaque content (the classic non-premultiplied-alpha blur bug) ----
const T = 11;
const halfTransparent = new Uint8ClampedArray(T * T * 4);
for (let y = 0; y < T; y++) {
  for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4;
    const isOpaqueSide = x < T / 2;
    // Opaque side: bright red. Transparent side: alpha=0 but with a
    // deliberately "wrong" RGB (pure black) to try to trip up a naive
    // (non-premultiplied) implementation into darkening the red.
    halfTransparent[i] = isOpaqueSide ? 255 : 0;
    halfTransparent[i + 1] = 0;
    halfTransparent[i + 2] = 0;
    halfTransparent[i + 3] = isOpaqueSide ? 255 : 0;
  }
}
const blurredTransparency = applyBlur({ width: T, height: T, data: halfTransparent }, { radius: 2 });
// A pixel solidly inside the opaque region (not right at the seam) should
// stay fully red and fully opaque - not darkened by the neighboring
// transparent pixels' black RGB.
const deepInOpaque = px(blurredTransparency, 1, 5);
assert(deepInOpaque.r === 255 && deepInOpaque.a === 255, `premultiplied-alpha blur doesn't darken opaque content near transparency (got r=${deepInOpaque.r} a=${deepInOpaque.a})`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
