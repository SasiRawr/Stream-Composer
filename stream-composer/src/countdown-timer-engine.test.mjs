// ============================================================================
// Tests for countdown-timer-engine.js. This only checks the generated
// STRING output (it's a string builder) — actual live tick behavior needs
// a real browser, same caveat as popup-slide-engine.js/chat-tts-engine.js.
//
// Run with: node src/countdown-timer-engine.test.mjs
// ============================================================================

import { buildCountdownTimerScript } from './countdown-timer-engine.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const baseProps = {
  targetDateTime: '2026-12-31T18:00',
  label: 'Starting in',
  completedText: "We're live!",
  showDays: true,
};

const script = buildCountdownTimerScript('countdown-item1-0', baseProps);

assert(script.includes("document.getElementById('countdown-item1-0-grid')"), 'references the correct grid element id for this instance');
assert(script.includes("document.getElementById('countdown-item1-0-complete')"), 'references the correct complete-message element id for this instance');
assert(script.includes('SHOW_DAYS = true'), 'the show-days setting is baked into the output');
assert(script.includes("COMPLETED_TEXT = \"We're live!\""), 'the completed-text setting is baked into the output, with its own apostrophe intact');
assert(script.includes('setInterval'), 'ticks on an interval rather than a single one-shot check');
assert(/TARGET_MS = \d+/.test(script), 'the target date/time is baked in as a real millisecond timestamp, not left as a string to re-parse at runtime');

// ---- no target set yet (empty string, e.g. a freshly-added item) ----
const noTargetScript = buildCountdownTimerScript('countdown-item2-1', { ...baseProps, targetDateTime: '' });
assert(noTargetScript.includes('TARGET_MS = null'), 'an unset target date bakes to null rather than NaN or a broken Date');

// ---- generated script must actually be valid JS (parse-only, never executed) ----
let syntaxError = null;
try { new Function(script); } catch (err) { syntaxError = err; }
assert(syntaxError === null, `generated script is syntactically valid JS (got: ${syntaxError && syntaxError.message})`);

let noTargetSyntaxError = null;
try { new Function(noTargetScript); } catch (err) { noTargetSyntaxError = err; }
assert(noTargetSyntaxError === null, `script with no target date set is still syntactically valid JS (got: ${noTargetSyntaxError && noTargetSyntaxError.message})`);

// ---- distinct instances don't leak each other's ids ----
const scriptA = buildCountdownTimerScript('countdown-A', baseProps);
const scriptB = buildCountdownTimerScript('countdown-B', baseProps);
assert(!scriptA.includes('countdown-B') && !scriptB.includes('countdown-A'), "two different instances' scripts don't reference each other's element ids");

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
