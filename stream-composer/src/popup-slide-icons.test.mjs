// ============================================================================
// Tests for popup-slide-icons.js. Runs in plain Node.
//
// Run with: node src/popup-slide-icons.test.mjs
// ============================================================================

import { PLATFORM_ICONS, platformIconSvg, findPlatformByIcon } from './popup-slide-icons.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const keys = Object.keys(PLATFORM_ICONS);
assert(keys.length === 10, `there are exactly 10 platform icons (got ${keys.length})`);

for (const key of keys) {
  const svg = platformIconSvg(key);
  assert(svg.length > 0, `platformIconSvg('${key}') produces non-empty markup`);
  assert(findPlatformByIcon(svg) === key, `round-trip: findPlatformByIcon(platformIconSvg('${key}')) === '${key}'`);
}

assert(platformIconSvg('not-a-real-key') === '', "platformIconSvg on an unknown key returns ''");
assert(findPlatformByIcon('<circle fill="garbage"/>') === null, 'findPlatformByIcon on unrecognized markup returns null');
assert(findPlatformByIcon('') === null, 'findPlatformByIcon on empty string returns null');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
