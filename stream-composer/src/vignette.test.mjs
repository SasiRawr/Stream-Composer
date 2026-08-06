// ============================================================================
// Tests for vignette.js. Runs in plain Node — see chromakey.test.mjs for why
// that property matters.
//
// Run with: node src/vignette.test.mjs
// ============================================================================

import { applyVignette } from './vignette.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
}

const SIZE = 21;
function flatImage() {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * 4] = 200; data[i * 4 + 1] = 200; data[i * 4 + 2] = 200; data[i * 4 + 3] = 220;
  }
  return { width: SIZE, height: SIZE, data };
}

// ---- strength:0 is a true no-op ----
const unvignetted = applyVignette(flatImage(), { strength: 0 });
assert(px(unvignetted, 0, 0).r === 200, `strength:0 is a true no-op (got r=${px(unvignetted, 0, 0).r})`);

// ---- the exact center pixel is unaffected when radius leaves room ----
const center = px(applyVignette(flatImage(), { strength: 1, radius: 0.5, softness: 0.5 }), 10, 10);
assert(center.r === 200, `center pixel is unaffected when inside the radius (got r=${center.r})`);

// ---- a far corner, with radius:0 and enough softness, mixes strongly toward black ----
const corner = px(applyVignette(flatImage(), { strength: 1, radius: 0, softness: 2 }), 0, 0);
assert(corner.r < 200, `a corner pixel darkens toward the vignette color (got r=${corner.r}, original was 200)`);

// ---- past the full falloff distance, the pixel reaches the tint color exactly (at strength:1) ----
const farCorner = px(applyVignette(flatImage(), { strength: 1, radius: 0, softness: 0.001, color: { r: 10, g: 20, b: 30 } }), 0, 0);
assert(farCorner.r === 10 && farCorner.g === 20 && farCorner.b === 30, `fully past the falloff band, the pixel reaches the tint color exactly (got r=${farCorner.r} g=${farCorner.g} b=${farCorner.b})`);

// ---- alpha is always preserved exactly, regardless of vignette strength ----
const alphaCheck = applyVignette(flatImage(), { strength: 1, radius: 0, softness: 2 });
assert(px(alphaCheck, 0, 0).a === 220, `alpha is preserved exactly even at full vignette strength (got a=${px(alphaCheck, 0, 0).a})`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
