// ============================================================================
// Tests for popup-slide-engine.js. This only checks the generated STRING
// output (it's a string builder, not a DOM/browser API) — actual runtime
// animation behavior needs a real browser, see the v1.0.0 merge plan's
// human-testing checklist.
//
// Run with: node src/popup-slide-engine.test.mjs
// ============================================================================

import { buildPopupSlideScript } from './popup-slide-engine.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const slides = [
  { tag: 'WEB', text: 'TheNerdyBox.com', iconType: 'none' },
  { tag: 'TWITCH', text: 'Follow us', iconType: 'svg', iconSvg: '<circle fill="#9146FF"/>' },
  { tag: 'CUSTOM', text: 'Custom icon', iconType: 'image', iconSrc: 'assets/item-1-slide2.png' },
];
const timing = { holdBeforeOpening: 350, textOpenDuration: 450, perMessageHold: 2600, swapFade: 260, holdBeforeSlideOut: 400, slideOutPause: 500 };
const script = buildPopupSlideScript('popup-item1-0', slides, timing, 'fade');

assert(script.includes("document.getElementById('popup-item1-0')"), 'references the correct wrapper element id');
assert(script.includes("document.getElementById('popup-item1-0-icon')"), 'references the correct icon-box element id');
assert(script.includes('TheNerdyBox.com'), 'the SLIDES array is serialized into the output');
assert(script.includes('9146FF'), 'a slide iconSvg is serialized into the output');
assert(script.includes('item-1-slide2.png'), 'a slide iconSrc is serialized into the output');
assert(script.includes('"perMessageHold":2600'), 'TIMING is serialized into the output');
assert(script.includes('"fade"'), 'the transition style is serialized into the output');
assert(script.includes("message.iconType === 'svg'"), 'the icon-swap branch for svg icons is present');
assert(script.includes("message.iconType === 'image'"), 'the icon-swap branch for image icons is present');
assert(script.includes('loopForever'), 'the animation loop entry point is present');

const scriptB = buildPopupSlideScript('popup-item2-1', [{ tag: 'A', text: 'B', iconType: 'none' }], timing, 'random');
assert(scriptB.includes("document.getElementById('popup-item2-1')"), 'a second instance gets its own distinct element ids, not item1\'s');
assert(!scriptB.includes('popup-item1-0'), 'a second instance\'s script has no leftover reference to the first instance\'s ids');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
