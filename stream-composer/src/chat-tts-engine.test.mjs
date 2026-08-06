// ============================================================================
// Tests for chat-tts-engine.js. This only checks the generated STRING output
// (it's a string builder, not a browser/WebSocket API) — actual live
// connection behavior needs a real browser and real Twitch/Kick channels,
// see the v1.2.0 plan's human-testing checklist.
//
// Run with: node src/chat-tts-engine.test.mjs
// ============================================================================

import { buildChatOverlayScript } from './chat-tts-engine.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const baseProps = {
  platforms: [
    { key: 'twitch', enabled: true, channelName: 'somestreamer' },
    { key: 'kick', enabled: false, channelName: '' },
  ],
  ttsEnabled: true,
  ttsRate: 1.2,
  ttsVolume: 0.8,
  filterCommands: true,
  maxVisibleMessages: 3,
  messageDisplayMs: 6000,
};

const script = buildChatOverlayScript('chat-item1-0', baseProps);

assert(script.includes("document.getElementById('chat-item1-0-feed')"), 'references the correct feed element id for this instance');
assert(script.includes("connectTwitch(\"somestreamer\")"), 'a Twitch platform enabled with a channel name gets connected');
// connectKick( always appears as part of the function DEFINITION
// (`async function connectKick(channelSlug) {`), which exists in every
// generated script regardless of which platforms are enabled - so "not
// called" has to be checked as "no call with a literal string argument",
// not "substring absent entirely".
assert(!script.includes('connectKick("'), 'a Kick platform that is not enabled does NOT get an actual connect call, even though connectKick() is always defined');
assert(script.includes('"ttsRate" ') === false && script.includes('TTS_RATE = 1.2'), `the configured TTS rate is baked into the output (got match: ${script.includes('TTS_RATE = 1.2')})`);
assert(script.includes('TTS_VOLUME = 0.8'), 'the configured TTS volume is baked into the output');
assert(script.includes('FILTER_COMMANDS = true'), 'the filter-commands setting is baked into the output');
assert(script.includes('irc-ws.chat.twitch.tv'), 'the Twitch IRC WebSocket endpoint is present');
assert(script.includes('justinfan'), 'the anonymous Twitch login convention is present');
assert(script.includes('parseTwitchIrcMessage'), 'the Twitch message parser is inlined');
assert(script.includes('parseKickChatEvent'), 'the Kick message parser is inlined even when Kick is disabled (shared code path)');
assert(script.includes('KICK_PUSHER_APP_KEY'), 'the Kick Pusher app key placeholder is present and named clearly');
assert(script.includes('speechSynthesis'), 'uses the browser-native speechSynthesis API');
assert(script.includes('onvoiceschanged'), 'handles the getVoices()-empty-until-voiceschanged timing issue');

// ---- Kick enabled, Twitch disabled ----
const kickOnlyScript = buildChatOverlayScript('chat-item2-1', {
  ...baseProps,
  platforms: [
    { key: 'twitch', enabled: false, channelName: '' },
    { key: 'kick', enabled: true, channelName: 'someKickChannel' },
  ],
});
assert(!kickOnlyScript.includes('connectTwitch("'), 'when only Kick is enabled, Twitch does not get a connect call');
assert(kickOnlyScript.includes('connectKick("someKickChannel")'), 'when Kick is enabled with a channel name, it gets a connect call');

// ---- Neither platform enabled ----
const noneScript = buildChatOverlayScript('chat-item3-2', {
  ...baseProps,
  platforms: [
    { key: 'twitch', enabled: false, channelName: '' },
    { key: 'kick', enabled: false, channelName: '' },
  ],
});
assert(!noneScript.includes('connectTwitch("') && !noneScript.includes('connectKick("'), 'with no platforms enabled, no connect calls are generated at all');

// ---- Enabled but blank channel name is treated as not configured ----
const blankChannelScript = buildChatOverlayScript('chat-item4-3', {
  ...baseProps,
  platforms: [{ key: 'twitch', enabled: true, channelName: '   ' }],
});
assert(!blankChannelScript.includes('connectTwitch("'), 'a platform enabled with only whitespace as the channel name is treated as unconfigured, not connected');

// ---- Distinct instances don't leak each other's ids ----
const scriptA = buildChatOverlayScript('chat-A', baseProps);
const scriptB = buildChatOverlayScript('chat-B', baseProps);
assert(!scriptA.includes('chat-B') && !scriptB.includes('chat-A'), "two different instances' scripts don't reference each other's element ids");

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
