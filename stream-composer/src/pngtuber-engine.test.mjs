// ============================================================================
// Tests for pngtuber-engine.js. Same discipline as chat-tts-engine.test.mjs:
// checks the generated STRING output only (it's a string builder, not a
// browser/mic API) - actual live mic behavior needs a real browser and a
// real microphone, see the WHAT_TO_TEST checklist for that.
//
// Run with: node src/pngtuber-engine.test.mjs
// ============================================================================

import { buildPngtuberScript } from './pngtuber-engine.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function checkSyntax(script, label) {
  let err = null;
  try { new Function(script); } catch (e) { err = e; }
  assert(err === null, `${label}: generated script is syntactically valid JS (got: ${err && err.message})`);
}

// ---- 'swap' style (the original v1.10.0 behavior) ----
const swapScript = buildPngtuberScript('pngtuber-item1-0', {
  idle: 'assets/pngtuber-item1-0-idle.png',
  talking: 'assets/pngtuber-item1-0-talking.png',
}, { style: 'swap', micThreshold: 15, holdMs: 200 });

assert(swapScript.includes("document.getElementById('pngtuber-item1-0-img')"), 'swap: references the correct image element id for this instance');
assert(swapScript.includes("document.getElementById('pngtuber-item1-0-status')"), 'swap: references the correct status/permission-hint element id for this instance');
assert(swapScript.includes('IDLE_SRC = "assets/pngtuber-item1-0-idle.png"'), 'swap: the idle image asset path is baked into the output');
assert(swapScript.includes('TALKING_SRC = "assets/pngtuber-item1-0-talking.png"'), 'swap: the talking image asset path is baked into the output');
assert(swapScript.includes('THRESHOLD = 0.15'), 'swap: a 15% sensitivity setting converts to a 0-1 threshold correctly');
assert(swapScript.includes('HOLD_MS = 200'), 'swap: the configured hold time is baked into the output');
assert(swapScript.includes('getUserMedia'), 'swap: requests microphone access via getUserMedia');
assert(swapScript.includes('createAnalyser'), 'swap: uses the Web Audio API AnalyserNode for volume detection');
assert(swapScript.includes('requestAnimationFrame'), 'swap: uses requestAnimationFrame for the analysis loop, not a fixed setInterval');
assert(swapScript.includes('right-click this source in OBS'), 'swap: gives a real, actionable hint if mic access is denied/unavailable, not a silent failure');
assert(swapScript.includes("imgEl.src = talking ? TALKING_SRC : IDLE_SRC"), 'swap: setTalking swaps the image src, not a class toggle');
checkSyntax(swapScript, 'swap');

// ---- 'bounce' style ----
const bounceScript = buildPngtuberScript('pngtuber-item2-1', { idle: 'a.png' }, { style: 'bounce', micThreshold: 15, holdMs: 200 });
assert(bounceScript.includes("classList.toggle('is-talking', talking)"), 'bounce: talking state toggles a CSS class, not a src swap');
checkSyntax(bounceScript, 'bounce');

// ---- 'brightness' style ----
const brightnessScript = buildPngtuberScript('pngtuber-item3-2', { idle: 'a.png' }, { style: 'brightness', micThreshold: 15, holdMs: 200 });
assert(brightnessScript.includes("classList.toggle('is-talking', talking)"), 'brightness: talking state toggles a CSS class, not a src swap');
checkSyntax(brightnessScript, 'brightness');

// ---- 'mouthFlap' style ----
const mouthFlapScript = buildPngtuberScript('pngtuber-item4-3', {
  mouthOpen: 'assets/pngtuber-item4-3-mouth-open.png',
  mouthClosed: 'assets/pngtuber-item4-3-mouth-closed.png',
}, { style: 'mouthFlap', micThreshold: 15, holdMs: 200, flapIntervalMs: 90 });

assert(mouthFlapScript.includes("document.getElementById('pngtuber-item4-3-mouth')"), 'mouthFlap: references the correct mouth element id for this instance');
assert(mouthFlapScript.includes('MOUTH_OPEN_SRC = "assets/pngtuber-item4-3-mouth-open.png"'), 'mouthFlap: the mouth-open asset path is baked into the output');
assert(mouthFlapScript.includes('MOUTH_CLOSED_SRC = "assets/pngtuber-item4-3-mouth-closed.png"'), 'mouthFlap: the mouth-closed asset path is baked into the output');
assert(mouthFlapScript.includes('FLAP_INTERVAL_MS = 90'), 'mouthFlap: the configured flap interval is baked into the output');
assert(mouthFlapScript.includes('setInterval'), 'mouthFlap: uses a real interval timer to alternate the mouth src while talking');
assert(mouthFlapScript.includes('clearInterval'), 'mouthFlap: stops the flap interval when talking ends (does not leak a running timer)');
assert(mouthFlapScript.includes('startFlap()') && mouthFlapScript.includes('stopFlap()'), 'mouthFlap: setTalking calls startFlap/stopFlap rather than swapping imgEl.src');
checkSyntax(mouthFlapScript, 'mouthFlap');

// ---- threshold clamping: a bad/out-of-range value never produces an invalid THRESHOLD ----
const highScript = buildPngtuberScript('pngtuber-item5-4', {}, { style: 'swap', micThreshold: 500, holdMs: 200 });
assert(highScript.includes('THRESHOLD = 1'), 'micThreshold above 100 clamps to a THRESHOLD of 1 (never exceeds the valid 0-1 range)');

const negativeScript = buildPngtuberScript('pngtuber-item6-5', {}, { style: 'swap', micThreshold: -50, holdMs: 200 });
assert(negativeScript.includes('THRESHOLD = 0'), 'a negative micThreshold clamps to a THRESHOLD of 0, not a negative value');

// ---- defaults: no props at all still produces a valid, sensible script ----
const defaultScript = buildPngtuberScript('pngtuber-item7-6', {}, {});
assert(defaultScript.includes('THRESHOLD = 0.15'), 'an unset micThreshold defaults to a reasonable 15% sensitivity');
assert(defaultScript.includes('HOLD_MS = 200'), 'an unset holdMs defaults to 200ms');
assert(defaultScript.includes("STYLE = \"swap\""), 'an unset style defaults to the original swap behavior');
assert(defaultScript.includes('FLAP_INTERVAL_MS = 120'), 'an unset flapIntervalMs defaults to 120ms');
checkSyntax(defaultScript, 'default');

// ---- distinct instances don't leak each other's ids ----
const scriptA = buildPngtuberScript('pngtuber-A', { idle: 'a.png' }, {});
const scriptB = buildPngtuberScript('pngtuber-B', { idle: 'c.png' }, {});
assert(!scriptA.includes('pngtuber-B') && !scriptB.includes('pngtuber-A'), "two different instances' scripts don't reference each other's element ids");

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
