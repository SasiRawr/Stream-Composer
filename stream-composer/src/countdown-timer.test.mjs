// ============================================================================
// Tests for countdown-timer.js. Runs in plain Node.
//
// Run with: node src/countdown-timer.test.mjs
// ============================================================================

import { computeRemaining, pad2, hoursIncludingDays } from './countdown-timer.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

// ---- computeRemaining ----
const now = 1_000_000_000_000; // arbitrary fixed epoch ms, for deterministic tests

const twoDaysOut = computeRemaining(now + (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000, now);
assert(twoDaysOut.days === 2, `days component is correct (got ${twoDaysOut.days})`);
assert(twoDaysOut.hours === 3, `hours component is correct (got ${twoDaysOut.hours})`);
assert(twoDaysOut.minutes === 4, `minutes component is correct (got ${twoDaysOut.minutes})`);
assert(twoDaysOut.seconds === 5, `seconds component is correct (got ${twoDaysOut.seconds})`);
assert(twoDaysOut.isComplete === false, 'a future target is not complete');

const exactlyNow = computeRemaining(now, now);
assert(exactlyNow.totalMs === 0 && exactlyNow.isComplete === true, 'a target exactly at the current time is complete, with zero remaining');

const pastTarget = computeRemaining(now - 5000, now);
assert(pastTarget.totalMs === 0, 'a target in the past clamps to zero remaining, not a negative number');
assert(pastTarget.isComplete === true, 'a past target is complete');
assert(pastTarget.days === 0 && pastTarget.hours === 0 && pastTarget.minutes === 0 && pastTarget.seconds === 0, 'a past target has all-zero components, not negative ones');

const almostAnHour = computeRemaining(now + 3599 * 1000, now);
assert(almostAnHour.minutes === 59 && almostAnHour.seconds === 59, `59:59 remaining does not round up to the next hour (got ${almostAnHour.minutes}:${almostAnHour.seconds})`);

// ---- pad2 ----
assert(pad2(5) === '05', `single digits are zero-padded (got "${pad2(5)}")`);
assert(pad2(42) === '42', `two-digit numbers pass through unchanged (got "${pad2(42)}")`);
assert(pad2(0) === '00', `zero pads correctly (got "${pad2(0)}")`);

// ---- hoursIncludingDays ----
const remaining = computeRemaining(now + (2 * 86400 + 5 * 3600) * 1000, now); // 2 days, 5 hours out
assert(hoursIncludingDays(remaining, true) === 5, `with showDays on, hours is just the hours component (got ${hoursIncludingDays(remaining, true)})`);
assert(hoursIncludingDays(remaining, false) === 53, `with showDays off, days fold into hours instead of being dropped (got ${hoursIncludingDays(remaining, false)})`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
