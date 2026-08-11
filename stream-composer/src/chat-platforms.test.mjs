// ============================================================================
// Tests for chat-platforms.js. Runs in plain Node.
//
// Run with: node src/chat-platforms.test.mjs
// ============================================================================

import {
  CHAT_PLATFORMS, visibleChatPlatforms,
  activePlatformKeys, ensurePrimarySelected, selectPrimaryPlatform, selectSecondaryPlatform, setMultiChatEnabled,
} from './chat-platforms.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

assert(CHAT_PLATFORMS.length === 4, `there are exactly 4 chat platforms listed so far (got ${CHAT_PLATFORMS.length})`);
assert(CHAT_PLATFORMS.some((p) => p.key === 'twitch'), 'Twitch is a registered platform');
assert(CHAT_PLATFORMS.some((p) => p.key === 'kick'), 'Kick is a registered platform');
assert(CHAT_PLATFORMS.some((p) => p.key === 'tiktok'), 'TikTok is a registered platform');
assert(CHAT_PLATFORMS.some((p) => p.key === 'trovo'), 'Trovo is listed (even though disabled) rather than silently omitted');
assert(CHAT_PLATFORMS.every((p) => p.adult === false), 'none of the shipped platforms are marked adult');
assert(CHAT_PLATFORMS.find((p) => p.key === 'tiktok').needsApiKey === true, 'TikTok is flagged as needing an API key, unlike Twitch/Kick');
assert(!CHAT_PLATFORMS.find((p) => p.key === 'twitch').needsApiKey, 'Twitch does not need an API key');
assert(!CHAT_PLATFORMS.find((p) => p.key === 'kick').needsApiKey, 'Kick does not need an API key');
assert(CHAT_PLATFORMS.find((p) => p.key === 'trovo').disabled === true, 'Trovo is flagged disabled (its live-streaming platform shut down)');
assert(typeof CHAT_PLATFORMS.find((p) => p.key === 'trovo').disabledReason === 'string' && CHAT_PLATFORMS.find((p) => p.key === 'trovo').disabledReason.length > 0, 'Trovo has a real explanation, not just a disabled flag with no context');
assert(!CHAT_PLATFORMS.find((p) => p.key === 'twitch').disabled && !CHAT_PLATFORMS.find((p) => p.key === 'kick').disabled && !CHAT_PLATFORMS.find((p) => p.key === 'tiktok').disabled, 'the three working platforms are not marked disabled');

assert(visibleChatPlatforms(false).length === 4, 'with the toggle off, all 4 non-adult platforms are visible (Trovo included, just disabled)');
assert(visibleChatPlatforms(true).length === 4, 'with the toggle on, the same platforms are still visible (no adult ones exist yet to add)');

// ---- Platform picker slot logic ----
function freshProps() {
  return { platforms: [], multiChatEnabled: false, showAdultPlatforms: false };
}

{
  const props = freshProps();
  ensurePrimarySelected(props);
  assert(activePlatformKeys(props).length === 1, 'a freshly-created item ends up with exactly one active platform by default');
  assert(activePlatformKeys(props)[0] === 'twitch', 'the default primary platform is the first non-disabled registry entry (Twitch)');
}

{
  const props = freshProps();
  ensurePrimarySelected(props);
  ensurePrimarySelected(props);
  assert(activePlatformKeys(props).length === 1, 'calling ensurePrimarySelected again on an already-selected item is a no-op, not a second activation');
}

{
  const props = freshProps();
  selectPrimaryPlatform(props, 'kick');
  assert(JSON.stringify(activePlatformKeys(props)) === JSON.stringify(['kick']), 'selecting a primary platform directly activates exactly that one');
}

{
  const props = freshProps();
  selectPrimaryPlatform(props, 'twitch');
  selectSecondaryPlatform(props, 'kick');
  assert(JSON.stringify(activePlatformKeys(props)) === JSON.stringify(['twitch', 'kick']), 'primary + secondary can both be active at once, in registry order');
  selectPrimaryPlatform(props, 'tiktok');
  assert(JSON.stringify(activePlatformKeys(props)) === JSON.stringify(['kick', 'tiktok']), 'switching primary preserves a distinct secondary selection');
}

{
  const props = freshProps();
  selectPrimaryPlatform(props, 'twitch');
  selectSecondaryPlatform(props, 'kick');
  selectPrimaryPlatform(props, 'kick'); // choosing the current secondary as the new primary
  assert(JSON.stringify(activePlatformKeys(props)) === JSON.stringify(['kick']), 'choosing the current secondary as the new primary clears the secondary slot instead of leaving one platform in both slots');
}

{
  const props = freshProps();
  selectPrimaryPlatform(props, 'twitch');
  selectSecondaryPlatform(props, 'kick');
  selectSecondaryPlatform(props, ''); // the "Choose a platform…" placeholder
  assert(JSON.stringify(activePlatformKeys(props)) === JSON.stringify(['twitch']), 'selecting the empty placeholder in the secondary dropdown clears the secondary slot without activating anything');
}

{
  const props = freshProps();
  selectPrimaryPlatform(props, 'twitch');
  selectSecondaryPlatform(props, 'kick');
  setMultiChatEnabled(props, false);
  assert(props.multiChatEnabled === false, 'setMultiChatEnabled(false) actually flips the flag');
  assert(JSON.stringify(activePlatformKeys(props)) === JSON.stringify(['twitch']), 'turning multi-chat off disconnects the secondary platform rather than leaving it silently enabled but hidden');
}

{
  const props = freshProps();
  selectPrimaryPlatform(props, 'twitch');
  setMultiChatEnabled(props, true);
  assert(props.multiChatEnabled === true, 'setMultiChatEnabled(true) flips the flag without requiring a secondary to already be chosen');
  assert(JSON.stringify(activePlatformKeys(props)) === JSON.stringify(['twitch']), 'enabling multi-chat alone does not auto-activate a second platform - the user still has to pick one');
}

{
  const props = freshProps();
  props.platforms.push({ key: 'trovo', enabled: true, channelName: 'x', apiKey: '' }); // simulate stale/corrupt data
  assert(activePlatformKeys(props).length === 0, 'a disabled platform (Trovo) never counts as active even if its stored enabled flag is stale-true');
}

{
  const props = freshProps();
  selectPrimaryPlatform(props, 'kick');
  const entry = props.platforms.find((e) => e.key === 'kick');
  entry.channelName = 'someKickChannel';
  selectPrimaryPlatform(props, 'twitch');
  selectPrimaryPlatform(props, 'kick');
  assert(props.platforms.find((e) => e.key === 'kick').channelName === 'someKickChannel', 'switching away from and back to a platform preserves its previously-entered channel name (data is never wiped, just deactivated)');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
