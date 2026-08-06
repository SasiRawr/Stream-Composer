// ============================================================================
// Tests for chat-platforms.js. Runs in plain Node.
//
// Run with: node src/chat-platforms.test.mjs
// ============================================================================

import { CHAT_PLATFORMS, visibleChatPlatforms } from './chat-platforms.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

assert(CHAT_PLATFORMS.length === 2, `there are exactly 2 chat platforms shipped so far (got ${CHAT_PLATFORMS.length})`);
assert(CHAT_PLATFORMS.some((p) => p.key === 'twitch'), 'Twitch is a registered platform');
assert(CHAT_PLATFORMS.some((p) => p.key === 'kick'), 'Kick is a registered platform');
assert(CHAT_PLATFORMS.every((p) => p.adult === false), 'neither shipped platform is marked adult');

assert(visibleChatPlatforms(false).length === 2, 'with the toggle off, both non-adult platforms are visible');
assert(visibleChatPlatforms(true).length === 2, 'with the toggle on, the same platforms are still visible (no adult ones exist yet to add)');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
