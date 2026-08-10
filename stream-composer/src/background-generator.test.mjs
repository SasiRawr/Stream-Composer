// ============================================================================
// Tests for background-generator.js's pure logic. Runs in plain Node.
// drawBackground() itself needs a real Canvas 2D context and isn't tested
// here — every decision it makes comes from resolveBackgroundPlan(), which
// is fully covered below.
//
// Run with: node src/background-generator.test.mjs
// ============================================================================

import { defaultBackgroundProps, coverFitRect, hexToRgba, resolveBackgroundPlan } from './background-generator.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

// ---- defaultBackgroundProps ----
const defaults = defaultBackgroundProps();
assert(defaults.fillType === 'solid', 'defaults to solid fill');
assert(defaults.canvasWidth === 1920 && defaults.canvasHeight === 1080, 'defaults to 1080p canvas size');
const defaults2 = defaultBackgroundProps();
assert(defaults !== defaults2, 'defaultBackgroundProps() returns a fresh object each call, not a shared reference');

// ---- coverFitRect ----
const wideImageInSquareBox = coverFitRect(1600, 400, 1000, 1000); // 4:1 image into a 1:1 box
assert(wideImageInSquareBox.height === 1000, `a wider-than-box image is scaled to fill box height exactly (got ${wideImageInSquareBox.height})`);
assert(wideImageInSquareBox.width === 4000, `and overflows box width proportionally, to be cropped (got ${wideImageInSquareBox.width})`);
assert(wideImageInSquareBox.x === -1500, `overflow is centered — equal crop on both sides (got x=${wideImageInSquareBox.x})`);

const tallImageInWideBox = coverFitRect(400, 1600, 1000, 500); // 1:4 image into a 2:1 box
assert(tallImageInWideBox.width === 1000, `a taller-than-box image is scaled to fill box width exactly (got ${tallImageInWideBox.width})`);
assert(tallImageInWideBox.height === 4000, `and overflows box height proportionally (got ${tallImageInWideBox.height})`);
assert(tallImageInWideBox.y === -1750, `vertical overflow is centered (got y=${tallImageInWideBox.y})`);

const exactMatch = coverFitRect(1920, 1080, 1920, 1080);
assert(exactMatch.x === 0 && exactMatch.y === 0 && exactMatch.width === 1920 && exactMatch.height === 1080, "an image already matching the box's aspect ratio needs no crop");

// ---- hexToRgba ----
assert(hexToRgba('#7c5cff', 1) === 'rgba(124, 92, 255, 1)', `full-opacity hex converts correctly (got ${hexToRgba('#7c5cff', 1)})`);
assert(hexToRgba('#000000', 0.5) === 'rgba(0, 0, 0, 0.5)', `half-opacity black converts correctly (got ${hexToRgba('#000000', 0.5)})`);
assert(hexToRgba('7c5cff', 1) === 'rgba(124, 92, 255, 1)', 'works without a leading # too');
assert(hexToRgba('#ffffff', 1.5) === 'rgba(255, 255, 255, 1)', 'alpha above 1 is clamped to 1');
assert(hexToRgba('#ffffff', -0.5) === 'rgba(255, 255, 255, 0)', 'alpha below 0 is clamped to 0');

// ---- resolveBackgroundPlan ----
const solidPlan = resolveBackgroundPlan({ ...defaultBackgroundProps(), fillType: 'solid', solidColor: '#123456' }, 1920, 1080, null);
assert(solidPlan.fillType === 'solid' && solidPlan.solidColor === '#123456', 'solid fill plan carries the configured color exactly');
assert(solidPlan.gradientStyle === undefined, 'a solid-fill plan has no gradient fields at all');

const linearPlan = resolveBackgroundPlan({ ...defaultBackgroundProps(), fillType: 'gradient', gradientStyle: 'linear', gradientAngle: 90 }, 1000, 1000, null);
assert(linearPlan.linear && typeof linearPlan.linear.x1 === 'number', 'a linear gradient plan resolves real pixel coordinates');
assert(linearPlan.fromColor === defaultBackgroundProps().gradientFrom, 'a standalone gradient (not overlaying an image) uses the plain hex color, no alpha applied');

const radialPlan = resolveBackgroundPlan({ ...defaultBackgroundProps(), fillType: 'gradient', gradientStyle: 'radial' }, 1920, 1080, null);
assert(radialPlan.radial && radialPlan.radial.cx === 960 && radialPlan.radial.cy === 540, `a radial gradient centers on the canvas (got cx=${radialPlan.radial && radialPlan.radial.cx}, cy=${radialPlan.radial && radialPlan.radial.cy})`);
assert(radialPlan.radial.r === 960, `radial radius covers the larger dimension (got ${radialPlan.radial.r})`);

const ghostPlan = resolveBackgroundPlan({ ...defaultBackgroundProps(), fillType: 'image-gradient', gradientFrom: '#000000', overlayOpacity: 0.4 }, 1920, 1080, { width: 800, height: 600 });
assert(ghostPlan.imageRect !== undefined, 'an image-gradient plan includes a resolved image rect');
assert(ghostPlan.fromColor === 'rgba(0, 0, 0, 0.4)', `an image-gradient plan's gradient stops carry alpha, not a plain hex color (got ${ghostPlan.fromColor})`);

const noImagePlan = resolveBackgroundPlan({ ...defaultBackgroundProps(), fillType: 'image-gradient' }, 1920, 1080, null);
assert(noImagePlan.imageRect === undefined, 'image-gradient mode with no image loaded yet does not throw, just resolves without an image rect');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
