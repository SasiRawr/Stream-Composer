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

const script = buildPngtuberScript('pngtuber-item1-0', 'assets/pngtuber-item1-0-idle.png', 'assets/pngtuber-item1-0-talking.png', {
  micThreshold: 15,
  holdMs: 200,
});

assert(script.includes("document.getElementById('pngtuber-item1-0-img')"), 'references the correct image element id for this instance');
assert(script.includes("document.getElementById('pngtuber-item1-0-status')"), 'references the correct status/permission-hint element id for this instance');
assert(script.includes('IDLE_SRC = "assets/pngtuber-item1-0-idle.png"'), 'the idle image asset path is baked into the output');
assert(script.includes('TALKING_SRC = "assets/pngtuber-item1-0-talking.png"'), 'the talking image asset path is baked into the output');
assert(script.includes('THRESHOLD = 0.15'), 'a 15% sensitivity setting converts to a 0-1 threshold correctly');
assert(script.includes('HOLD_MS = 200'), 'the configured hold time is baked into the output');
assert(script.includes('getUserMedia'), 'requests microphone access via getUserMedia');
assert(script.includes('createAnalyser'), 'uses the Web Audio API AnalyserNode for volume detection');
assert(script.includes('requestAnimationFrame'), 'uses requestAnimationFrame for the analysis loop, not a fixed setInterval');
assert(script.includes('right-click this source in OBS'), 'gives a real, actionable hint if mic access is denied/unavailable, not a silent failure');

let syntaxError = null;
try { new Function(script); } catch (err) { syntaxError = err; }
assert(syntaxError === null, `generated script is syntactically valid JS (got: ${syntaxError && syntaxError.message})`);

// ---- threshold clamping: a bad/out-of-range value never produces an invalid THRESHOLD ----
const highScript = buildPngtuberScript('pngtuber-item2-1', 'a.png', 'b.png', { micThreshold: 500, holdMs: 200 });
assert(highScript.includes('THRESHOLD = 1'), 'micThreshold above 100 clamps to a THRESHOLD of 1 (never exceeds the valid 0-1 range)');

const negativeScript = buildPngtuberScript('pngtuber-item3-2', 'a.png', 'b.png', { micThreshold: -50, holdMs: 200 });
assert(negativeScript.includes('THRESHOLD = 0'), 'a negative micThreshold clamps to a THRESHOLD of 0, not a negative value');

// ---- defaults: no props at all still produces a valid, sensible script ----
const defaultScript = buildPngtuberScript('pngtuber-item4-3', 'a.png', 'b.png', {});
assert(defaultScript.includes('THRESHOLD = 0.15'), 'an unset micThreshold defaults to a reasonable 15% sensitivity');
assert(defaultScript.includes('HOLD_MS = 200'), 'an unset holdMs defaults to 200ms');
let defaultSyntaxError = null;
try { new Function(defaultScript); } catch (err) { defaultSyntaxError = err; }
assert(defaultSyntaxError === null, `script with no configured props is still syntactically valid JS (got: ${defaultSyntaxError && defaultSyntaxError.message})`);

// ---- distinct instances don't leak each other's ids ----
const scriptA = buildPngtuberScript('pngtuber-A', 'a.png', 'b.png', {});
const scriptB = buildPngtuberScript('pngtuber-B', 'c.png', 'd.png', {});
assert(!scriptA.includes('pngtuber-B') && !scriptB.includes('pngtuber-A'), "two different instances' scripts don't reference each other's element ids");

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
