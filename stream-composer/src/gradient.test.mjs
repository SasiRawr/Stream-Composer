// ============================================================================
// Tests for gradient.js. Runs in plain Node.
//
// Run with: node src/gradient.test.mjs
// ============================================================================

import { gradientCoordsForAngle } from './gradient.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function close(a, b, eps = 1e-9) { return Math.abs(a - b) < eps; }

// 0deg = "to top": gradient starts at the bottom (y=1), ends at the top (y=0).
const toTop = gradientCoordsForAngle(0);
assert(close(toTop.x1, 0.5) && close(toTop.y1, 1) && close(toTop.x2, 0.5) && close(toTop.y2, 0), `0deg points from bottom to top (got ${JSON.stringify(toTop)})`);

// 90deg = "to right": starts at the left (x=0), ends at the right (x=1).
const toRight = gradientCoordsForAngle(90);
assert(close(toRight.x1, 0) && close(toRight.y1, 0.5) && close(toRight.x2, 1) && close(toRight.y2, 0.5), `90deg points from left to right (got ${JSON.stringify(toRight)})`);

// 180deg = "to bottom": starts at the top, ends at the bottom.
const toBottom = gradientCoordsForAngle(180);
assert(close(toBottom.x1, 0.5) && close(toBottom.y1, 0) && close(toBottom.x2, 0.5) && close(toBottom.y2, 1), `180deg points from top to bottom (got ${JSON.stringify(toBottom)})`);

// 270deg = "to left": starts at the right, ends at the left.
const toLeft = gradientCoordsForAngle(270);
assert(close(toLeft.x1, 1) && close(toLeft.y1, 0.5) && close(toLeft.x2, 0) && close(toLeft.y2, 0.5), `270deg points from right to left (got ${JSON.stringify(toLeft)})`);

// Every angle's line is centered on the box (midpoint of start/end is always 0.5,0.5).
for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
  const c = gradientCoordsForAngle(angle);
  const midX = (c.x1 + c.x2) / 2;
  const midY = (c.y1 + c.y2) / 2;
  assert(close(midX, 0.5) && close(midY, 0.5), `angle ${angle}deg's gradient line is centered on the box (got mid=${midX},${midY})`);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
