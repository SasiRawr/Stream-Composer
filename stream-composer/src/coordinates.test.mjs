// ============================================================================
// Tests for coordinates.js. Runs in plain Node - see chromakey.test.mjs for
// why that property matters.
//
// Run with: node src/coordinates.test.mjs
// ============================================================================

import {
  COORDINATE_ORIGIN, itemCenterForFabric, itemTopLeftFromFabric, migrateProjectCoordinates,
  markCoordinatesCurrent, centerPlacement, centerHorizontalPlacement, centerVerticalPlacement,
  stretchPlacement, fitPlacement, reorderZIndexes,
} from './coordinates.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}
function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`); }

// ---- Fabric <-> item conversion ----
eq(itemCenterForFabric({ x: 0, y: 0, width: 640, height: 220 }, 1), { left: 320, top: 110 }, 'a full-canvas item at x=0,y=0 has its center at half its size');
eq(itemCenterForFabric({ x: 100, y: 50, width: 200, height: 100 }, 0.5), { left: 100, top: 50 }, 'center is scaled to display pixels');
const item = { x: 137, y: 61, width: 321, height: 99 };
const c = itemCenterForFabric(item, 0.4);
eq(itemTopLeftFromFabric(c.left, c.top, item.width * 0.4, item.height * 0.4, 0.4), { x: 137, y: 61 }, 'center -> top-left round-trips');
eq(itemTopLeftFromFabric(200, 100, 100, 50, 1), { x: 150, y: 75 }, 'top-left is center minus half the on-screen size');
eq(itemTopLeftFromFabric(200, 100, 100 * 2, 50 * 2, 1), { x: 100, y: 50 }, 'a drag-resized (scaled) object uses its scaled size');

// ---- migration ----
{
  const p = { canvasWidth: 1920, canvasHeight: 1080, items: [{ id: 'a', x: 320, y: 110, width: 640, height: 220 }] };
  migrateProjectCoordinates(p);
  eq([p.items[0].x, p.items[0].y], [0, 0], 'legacy centered x/y becomes top-left (the 640x220 popup-slide case)');
  eq(p.coordinateOrigin, COORDINATE_ORIGIN, 'migration stamps the marker');
  migrateProjectCoordinates(p);
  eq([p.items[0].x, p.items[0].y], [0, 0], 'migrating twice is a no-op');
}
{
  const p = { items: [{ x: 5, y: 7, width: 11, height: 3 }] };
  migrateProjectCoordinates(p);
  eq([p.items[0].x, p.items[0].y], [0, 6], 'odd sizes are rounded to whole pixels');
}
{
  const p = markCoordinatesCurrent({ items: [{ x: 10, y: 20, width: 100, height: 100 }] });
  migrateProjectCoordinates(p);
  eq([p.items[0].x, p.items[0].y], [10, 20], 'marked projects are left alone');
}
{
  const p = { canvasWidth: 1920, canvasHeight: 1080, items: [{ x: 0, y: 0, width: 1920, height: 1080 }] };
  migrateProjectCoordinates(p);
  eq([p.items[0].x, p.items[0].y], [0, 0], 'an untouched full-canvas item at 0,0 is not pushed off the canvas');
}
{
  // Harvey's real "Full size test" PNGTuber: the saved box runs off the bottom, the shifted one fits
  const p = { canvasWidth: 1920, canvasHeight: 1080, items: [{ x: 1004, y: 584, width: 728, height: 728 }] };
  migrateProjectCoordinates(p);
  eq([p.items[0].x, p.items[0].y], [640, 220], 'an item hanging off the canvas is shifted to where the editor showed it');
}
{
  const p = { canvasWidth: 1920, canvasHeight: 1080, items: [{ x: 960, y: 540, width: 200, height: 100 }] };
  migrateProjectCoordinates(p);
  eq([p.items[0].x, p.items[0].y], [860, 490], 'when both boxes fit, the editor view wins');
}
assert(migrateProjectCoordinates(null) === null, 'null project passes through');
{
  const p = { items: [] };
  migrateProjectCoordinates(p);
  assert(p.coordinateOrigin === COORDINATE_ORIGIN, 'empty legacy project still gets the marker');
}

// ---- layout actions ----
const it = { x: 3, y: 4, width: 300, height: 100 };
eq(centerPlacement(it, 1920, 1080), { x: 810, y: 490 }, 'center on canvas');
eq(centerHorizontalPlacement(it, 1920), { x: 810 }, 'center horizontally only changes x');
eq(centerVerticalPlacement(it, 1080), { y: 490 }, 'center vertically only changes y');
eq(stretchPlacement(1920, 1080), { x: 0, y: 0, width: 1920, height: 1080, rotation: 0 }, 'stretch fills the canvas and clears rotation');
eq(fitPlacement({ width: 500, height: 500 }, 1920, 1080), { x: 420, y: 0, width: 1080, height: 1080, rotation: 0 }, 'fit keeps aspect and centers (square into 16:9)');
eq(fitPlacement({ width: 100, height: 50 }, 200, 400), { x: 0, y: 150, width: 200, height: 100, rotation: 0 }, 'fit scales up too, limited by width');
eq(centerPlacement({ width: 2000, height: 1200 }, 1920, 1080), { x: -40, y: -60 }, 'oversized item centers with negative offsets');

// ---- z-order ----
const items = [{ id: 'a', zIndex: 1 }, { id: 'b', zIndex: 5 }, { id: 'c', zIndex: 5 }];
const order = (m) => [...m.entries()].sort((x, y) => x[1] - y[1]).map((e) => e[0]).join('');
assert(order(reorderZIndexes(items, 'a', 'front')) === 'bca', 'bring to front');
assert(order(reorderZIndexes(items, 'c', 'back')) === 'cab', 'send to back');
assert(order(reorderZIndexes(items, 'a', 'forward')) === 'bac', 'bring forward one step');
assert(order(reorderZIndexes(items, 'c', 'backward')) === 'acb', 'send backward one step');
assert(order(reorderZIndexes(items, 'a', 'backward')) === 'abc', 'send backward at the bottom is stable');
assert(reorderZIndexes(items, 'zzz', 'front') === null, 'unknown id returns null');

if (failures > 0) { console.error(failures + ' test(s) failed'); process.exit(1); }
console.log('All tests passed.');
