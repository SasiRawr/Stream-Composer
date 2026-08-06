// ============================================================================
// Tests for transform.js. Runs in plain Node — see chromakey.test.mjs for
// why that property matters.
//
// Run with: node src/transform.test.mjs
// ============================================================================

import { applyFlip, applyRotate } from './transform.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

// A 2x3 test image, one distinct "color" (just the R channel, for
// readability) per pixel, labeled A-F left-to-right, top-to-bottom:
//   A B
//   C D
//   E F
function makeLabeled() {
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  const data = new Uint8ClampedArray(2 * 3 * 4);
  labels.forEach((label, i) => {
    data[i * 4] = label.charCodeAt(0); // store the letter's char code in R
    data[i * 4 + 3] = 255;
  });
  return { width: 2, height: 3, data };
}
function labelAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return String.fromCharCode(img.data[i]);
}
function grid(img) {
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let row = '';
    for (let x = 0; x < img.width; x++) row += labelAt(img, x, y);
    rows.push(row);
  }
  return rows.join('/');
}

// ---- FLIP ----
const flippedH = applyFlip(makeLabeled(), { horizontal: true });
assert(grid(flippedH) === 'BA/DC/FE', `horizontal flip mirrors each row left-right (got "${grid(flippedH)}", expected "BA/DC/FE")`);

const flippedV = applyFlip(makeLabeled(), { vertical: true });
assert(grid(flippedV) === 'EF/CD/AB', `vertical flip mirrors top-to-bottom (got "${grid(flippedV)}", expected "EF/CD/AB")`);

const flippedBoth = applyFlip(makeLabeled(), { horizontal: true, vertical: true });
assert(grid(flippedBoth) === 'FE/DC/BA', `flipping both axes at once composes correctly (got "${grid(flippedBoth)}", expected "FE/DC/BA")`);

// ---- ROTATE ----
const rotated180 = applyRotate(makeLabeled(), 180);
assert(rotated180.width === 2 && rotated180.height === 3, `180 rotation keeps the same width/height (got ${rotated180.width}x${rotated180.height})`);
assert(grid(rotated180) === 'FE/DC/BA', `180 rotation is equivalent to flipping both axes (got "${grid(rotated180)}", expected "FE/DC/BA")`);

const rotated90 = applyRotate(makeLabeled(), 90);
assert(rotated90.width === 3 && rotated90.height === 2, `90 rotation swaps width and height (got ${rotated90.width}x${rotated90.height}, expected 3x2)`);
assert(grid(rotated90) === 'ECA/FDB', `90 clockwise rotation matches hand-computed expectation (got "${grid(rotated90)}", expected "ECA/FDB")`);

const rotated270 = applyRotate(makeLabeled(), 270);
assert(rotated270.width === 3 && rotated270.height === 2, `270 rotation also swaps width and height (got ${rotated270.width}x${rotated270.height}, expected 3x2)`);
assert(grid(rotated270) === 'BDF/ACE', `270 clockwise (= 90 counter-clockwise) matches hand-computed expectation (got "${grid(rotated270)}", expected "BDF/ACE")`);

// Rotating 90 four times should return to the original arrangement.
let roundTrip = makeLabeled();
for (let i = 0; i < 4; i++) roundTrip = applyRotate(roundTrip, 90);
assert(grid(roundTrip) === grid(makeLabeled()), `four consecutive 90 rotations return to the original layout (got "${grid(roundTrip)}")`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
