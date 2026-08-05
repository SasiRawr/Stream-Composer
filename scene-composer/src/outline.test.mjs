// ============================================================================
// Tests for outline.js. Runs in plain Node — see chromakey.test.mjs for why
// that property matters.
//
// Run with: node src/outline.test.mjs
// ============================================================================

import { applyOutline } from './outline.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

// 15x15 fully-transparent canvas with one solid red pixel dead center (7,7).
const SIZE = 15;
const CENTER = 7;
function makeCanvas() {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4); // all zero = fully transparent black
  const idx = (CENTER * SIZE + CENTER) * 4;
  data[idx] = 200; data[idx + 1] = 30; data[idx + 2] = 30; data[idx + 3] = 255; // opaque red
  return { width: SIZE, height: SIZE, data };
}
function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
}

const STROKE = 3;
const result = applyOutline(makeCanvas(), { strokeWidth: STROKE, strokeColor: { r: 0, g: 255, b: 255 } });

const centerPixel = px(result, CENTER, CENTER);
assert(centerPixel.r === 200 && centerPixel.g === 30, `the original content pixel is never overwritten (got r=${centerPixel.r} g=${centerPixel.g})`);

const nearby = px(result, CENTER + 2, CENTER); // 2px away, within strokeWidth=3
assert(nearby.a === 255 && nearby.g === 255 && nearby.b === 255, `a transparent pixel within strokeWidth gets painted with the stroke color (got a=${nearby.a} g=${nearby.g} b=${nearby.b})`);

const farAway = px(result, CENTER + STROKE + 3, CENTER); // well outside strokeWidth
assert(farAway.a === 0, `a pixel well outside strokeWidth stays fully transparent (got alpha=${farAway.a})`);

const justOutside = px(result, CENTER + STROKE + 1, CENTER); // 1px past the stroke radius
assert(justOutside.a === 0, `a pixel just past the stroke radius is not painted (got alpha=${justOutside.a})`);

// Corner check: (dx,dy) = (3,3) has distance sqrt(18)=4.24, outside a
// radius-3 circle, so the outline should be rounded, not a square box.
const diagonalCorner = px(result, CENTER + 3, CENTER + 3);
assert(diagonalCorner.a === 0, `the outline is circular, not square - a diagonal corner outside the radius stays transparent (got alpha=${diagonalCorner.a})`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
