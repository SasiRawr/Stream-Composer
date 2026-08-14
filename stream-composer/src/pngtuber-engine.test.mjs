// ============================================================================
// Tests for pngtuber-engine.js. Same discipline as chat-tts-engine.test.mjs:
// checks the generated STRING output only (it's a string builder, not a
// browser/mic API) - actual live mic behavior needs a real browser and a
// real microphone, see the WHAT_TO_TEST checklist for that.
//
// Run with: node src/pngtuber-engine.test.mjs
// ============================================================================

import { buildPngtuberScript, computeCalibratedThreshold, evaluateTalking, clampObsLevel01 } from './pngtuber-engine.js';

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

// ---- computeCalibratedThreshold: the editor-side Auto-calibrate button's ----
// midpoint-formula, extracted so it's testable without a real mic/browser.
assert(computeCalibratedThreshold(0.02, 0.30) === 12, 'a clear silence/speaking gap (0.02 -> 0.30) calibrates to silence + 35% of the gap, rounded to a whole percent');
assert(computeCalibratedThreshold(0, 0.20) === 7, 'calibrates correctly even with a near-zero silence floor');

const closeLevels = computeCalibratedThreshold(0.05, 0.055);
assert(closeLevels === null, 'silence and speaking levels too close together (e.g. user never talked, or a noisy room) returns null instead of a useless threshold');

const speakingQuieterThanSilence = computeCalibratedThreshold(0.10, 0.08);
assert(speakingQuieterThanSilence === null, 'a negative gap (speaking measured quieter than silence) also returns null rather than a nonsensical threshold');

const lowEnd = computeCalibratedThreshold(0, 0.01);
assert(lowEnd === null, 'a tiny overall gap right at the noise floor still returns null rather than a threshold of 0-1%');

const highEnd = computeCalibratedThreshold(0.5, 1.5);
assert(highEnd === 80, 'a calibrated result above the slider max (80%) clamps to 80, matching the properties panel slider range');

// ---- evaluateTalking: the shared trigger state machine, extracted from ----
// frame() so both the mic mode and the OBS-source mode call the exact same
// function (see pngtuber-engine.js's header comment on buildPngtuberScript).
assert(
  evaluateTalking(0.5, 0.15, 200, 1000, 0, false).talking === true,
  'a level above threshold becomes talking'
);
assert(
  evaluateTalking(0.5, 0.15, 200, 1000, 0, false).lastLoudAt === 1000,
  'a level above threshold refreshes lastLoudAt to "now"'
);
assert(
  evaluateTalking(0.05, 0.15, 200, 1000, 900, true).talking === true,
  'a quiet level still within the hold window stays talking'
);
assert(
  evaluateTalking(0.05, 0.15, 200, 1000, 900, true).lastLoudAt === 900,
  'a quiet level within the hold window does not touch lastLoudAt'
);
assert(
  evaluateTalking(0.05, 0.15, 200, 1500, 900, true).talking === false,
  'a quiet level past the hold window falls back to idle'
);
assert(
  evaluateTalking(0.05, 0.15, 200, 100, 0, false).talking === false,
  'a quiet level while already idle stays idle (no false-positive at boot, e.g. now=100ms < holdMs)'
);
assert(
  evaluateTalking(0.15, 0.15, 200, 1000, 0, false).talking === false,
  'a level exactly AT threshold (not above) does not trigger talking'
);

// ---- clampObsLevel01: OBS's InputVolumeMeters level is already linear ----
// (obws's "Mul" value, not dBFS) - this only needs to clamp, never convert.
assert(clampObsLevel01(0) === 0, 'silence (linear level 0) stays 0');
assert(clampObsLevel01(0.3) === 0.3, 'a normal in-range linear level passes through unchanged');
assert(clampObsLevel01(1.4) === 1, 'a clipping linear level (>1) clamps to 1, never exceeds the range evaluateTalking() expects');
assert(clampObsLevel01(-0.2) === 0, 'a negative level (should not happen, but defensively) clamps to 0');

// ---- OBS-source mode: buildPngtuberScript branches on props.audioSource ----
// itemId ('item-a1b2c3d4') is deliberately a REALISTIC raw main.js uid() —
// distinct in shape from the sanitized/index-suffixed DOM instanceId
// ('pngtuber-obs1-0') passed as this function's first argument, so this
// test would have caught the original bug (bake.js baking the sanitized
// DOM instanceId as the value the Rust relay matched project.json's raw
// item.id against, which could never match anything, ever - see Bug 1 in
// the regression-test section below for the full round-trip version of
// this check).
const obsScript = buildPngtuberScript('pngtuber-obs1-0', { idle: 'a.png' }, {
  style: 'bounce', micThreshold: 20, holdMs: 300, audioSource: 'obs', obsInputName: 'Mic/Aux',
}, 'item-a1b2c3d4');

assert(!obsScript.includes('getUserMedia'), "'obs' mode: does NOT request microphone access — that's the whole point of this mode");
assert(!obsScript.includes('createAnalyser'), "'obs' mode: does NOT use the Web Audio API at all");
assert(obsScript.includes('fetch(OBS_POLL_URL'), "'obs' mode: polls the local relay via fetch()");
assert(obsScript.includes('http://127.0.0.1:5760/?'), "'obs' mode: polling URL points at the documented relay port");
assert(!obsScript.includes('projectFilePath='), "'obs' mode: never sends a projectFilePath - the relay tracks the current project itself (set_current_project_path), never trusting a client-supplied path (Bug 3 fix)");
assert(obsScript.includes('itemId=' + encodeURIComponent('item-a1b2c3d4')), "'obs' mode: the item's RAW id (not the sanitized DOM instanceId) is URL-encoded into the polling URL as itemId, distinctly from instanceId");
assert(!obsScript.includes('instanceId=item-a1b2c3d4'), "'obs' mode: the raw itemId is never confused with/baked as instanceId");
assert(obsScript.includes('micThreshold=20'), "'obs' mode: micThreshold (bake-time fallback) is passed as a query param");
assert(obsScript.includes('holdMs=300'), "'obs' mode: holdMs (bake-time fallback) is passed as a query param");
assert(obsScript.includes('obsInputName=' + encodeURIComponent('Mic/Aux')), "'obs' mode: obsInputName (bake-time fallback) is URL-encoded into the polling URL");
assert(obsScript.includes('function clampObsLevel01'), "'obs' mode: inlines the shared clamp function, so mic and OBS modes can never drift in how they cap the 0-1 range");
assert(obsScript.includes('applyLevel(0, performance.now(), THRESHOLD, HOLD_MS)'), "'obs' mode: an unreachable relay feeds silence (0) through the SAME evaluateTalking() call (falling back to the baked THRESHOLD/HOLD_MS), not a special-cased path");
assert(obsScript.includes('setInterval(pollObsInput, OBS_POLL_INTERVAL_MS)'), "'obs' mode: polls on a fixed interval, not requestAnimationFrame");
assert(obsScript.includes('data?.micThreshold') || obsScript.includes('data.micThreshold'), "'obs' mode: reads a LIVE micThreshold from each poll response, not just the baked constant (Bug 2 fix)");
assert(obsScript.includes('data?.holdMs') || obsScript.includes('data.holdMs'), "'obs' mode: reads a LIVE holdMs from each poll response, not just the baked constant (Bug 2 fix)");
checkSyntax(obsScript, 'obs-source');

// itemId omitted entirely (unsaved project, or an item.id somehow not
// passed through) - degrades gracefully, bakes an empty itemId rather than
// erroring; the relay's live lookup then simply can't match anything and
// falls back to the query-param values, same as any other lookup failure.
const obsScriptNoPath = buildPngtuberScript('pngtuber-obs2-1', {}, { style: 'swap', audioSource: 'obs', obsInputName: 'Mic' });
assert(obsScriptNoPath.includes('http://127.0.0.1:5760/?itemId='), 'obs mode with no itemId given still bakes a valid polling URL starting from itemId');
checkSyntax(obsScriptNoPath, 'obs-source, no itemId');

// ---- default ('mic') mode is unaffected by the audioSource branch ----
// Same markers the original pre-refactor script had - still true after
// extracting evaluateTalking() and adding the 'obs' branch alongside it.
const micModeScript = buildPngtuberScript('pngtuber-mic1-0', { idle: 'a.png', talking: 'b.png' }, { style: 'swap', micThreshold: 15, holdMs: 200 });
assert(micModeScript.includes('getUserMedia'), "unset audioSource (default): still requests microphone access");
assert(micModeScript.includes('createAnalyser'), "unset audioSource (default): still uses the Web Audio API AnalyserNode");
assert(micModeScript.includes('requestAnimationFrame'), "unset audioSource (default): still driven by requestAnimationFrame, not the OBS poll interval");
assert(!micModeScript.includes('OBS_POLL_URL'), "unset audioSource (default): never emits the OBS polling machinery at all");
assert(!micModeScript.includes('fetch('), "unset audioSource (default): makes no network requests, same 'zero desktop-app dependency' guarantee as before");
const micModeScriptExplicit = buildPngtuberScript('pngtuber-mic1-0', { idle: 'a.png', talking: 'b.png' }, { style: 'swap', micThreshold: 15, holdMs: 200, audioSource: 'mic' });
assert(micModeScript === micModeScriptExplicit, 'an unset audioSource and an explicit audioSource: "mic" produce byte-for-byte identical output');
checkSyntax(micModeScript, 'mic mode (default)');

// ---- REGRESSION (Bug 1): the baked itemId must be the RAW item.id, never ----
// the sanitized/index-suffixed DOM instanceId — this is the exact class of
// bug that slipped through before: every prior test asserted on the URL's
// string contents alone, never round-tripped a REALISTIC raw project item
// id through the same sanitization formula bake.js actually applies before
// checking what ends up in the URL. bake.js computes the DOM instanceId as
// `pngtuber-${item.id.replace(/[^a-zA-Z0-9]/g, '')}-${index}` — reproduced
// verbatim here (it's a private, unexported detail of bake.js) so this test
// independently proves the two ids this function is given can never be
// mistaken for each other, and that the RAW id — the one
// src-tauri/src/lib.rs's find_obs_item_settings matches project.json's own
// `id` field against — is what actually reaches the polling URL as itemId.
const rawItemId = 'item-a1b2c3d4'; // main.js's uid(): 'item-' + 8 random base36 chars
const sanitizedInstanceId = `pngtuber-${rawItemId.replace(/[^a-zA-Z0-9]/g, '')}-0`; // bake.js's exact formula
assert(
  sanitizedInstanceId !== rawItemId,
  'sanity check: for a realistic id, the sanitized DOM instanceId and the raw item.id are never equal — this mismatch is exactly why Bug 1 happened'
);

const regressionScript = buildPngtuberScript(sanitizedInstanceId, { idle: 'a.png' }, {
  style: 'swap', audioSource: 'obs', obsInputName: 'Mic', micThreshold: 15, holdMs: 200,
}, rawItemId);
assert(
  regressionScript.includes('itemId=' + encodeURIComponent(rawItemId)),
  'REGRESSION (Bug 1): the polling URL carries the RAW item.id as itemId — the value the Rust relay can actually match against project.json'
);
assert(
  !regressionScript.includes('itemId=' + encodeURIComponent(sanitizedInstanceId)),
  'REGRESSION (Bug 1): the sanitized DOM instanceId is never baked in as the itemId value — that was the bug (a lookup that could never match, ever)'
);
checkSyntax(regressionScript, 'Bug 1 regression');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
