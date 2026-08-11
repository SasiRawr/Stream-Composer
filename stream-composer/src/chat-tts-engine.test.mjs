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
  ttsVoiceName: 'Microsoft Zira Desktop',
  filterCommands: true,
  filterEmoteOnly: true,
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
assert(script.includes('TTS_VOICE_NAME = "Microsoft Zira Desktop"'), 'the configured TTS voice name is baked into the output');
assert(script.includes('FILTER_EMOTE_ONLY = true'), 'the filter-emote-only setting is baked into the output');
assert(script.includes('isEmoteOnlyMessage'), 'the emote-only detector is inlined');

// ---- generated script must actually be valid JS (parse-only, never executed —
// executing it would try to open real WebSockets) ----
let syntaxError = null;
try { new Function(script); } catch (err) { syntaxError = err; }
assert(syntaxError === null, `generated script is syntactically valid JS (got: ${syntaxError && syntaxError.message})`);

// ---- ttsVoiceName defaulting: empty/missing means "system default", not a broken reference ----
const noVoiceScript = buildChatOverlayScript('chat-item5-4', { ...baseProps, ttsVoiceName: '' });
assert(noVoiceScript.includes('TTS_VOICE_NAME = ""'), 'an unset voice name bakes to an empty string, not undefined/null');
let noVoiceSyntaxError = null;
try { new Function(noVoiceScript); } catch (err) { noVoiceSyntaxError = err; }
assert(noVoiceSyntaxError === null, `script with no configured voice is still syntactically valid JS (got: ${noVoiceSyntaxError && noVoiceSyntaxError.message})`);

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

// ---- Polly provider: opt-in bring-your-own-AWS-key TTS path ----
const pollyScript = buildChatOverlayScript('chat-item6-5', {
  ...baseProps,
  ttsProvider: 'polly',
  pollyAccessKeyId: 'AKIDEXAMPLE',
  pollySecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  pollyRegion: 'us-east-1',
  pollyVoiceId: 'Matthew',
  pollyEngine: 'neural',
});
assert(pollyScript.includes('TTS_PROVIDER = "polly"'), 'the configured TTS provider is baked into the output');
assert(pollyScript.includes('POLLY_ACCESS_KEY_ID = "AKIDEXAMPLE"'), 'the Polly access key id is baked into the output');
assert(pollyScript.includes('POLLY_VOICE_ID = "Matthew"'), 'the Polly voice id is baked into the output');
assert(pollyScript.includes('speakNextPolly'), 'the Polly speak path is present when Polly is the configured provider');
assert(pollyScript.includes('AWS4-HMAC-SHA256'), 'the SigV4 signing algorithm identifier is present');
assert(pollyScript.includes('POLLY_REGION = "us-east-1"'), 'the configured Polly region is baked into the output (host is built from it at runtime)');
assert(pollyScript.includes("'polly.' + region + '.amazonaws.com'"), 'the Polly endpoint host is assembled from the region at runtime, not hardcoded to one region');
let pollySyntaxError = null;
try { new Function(pollyScript); } catch (err) { pollySyntaxError = err; }
assert(pollySyntaxError === null, `Polly-provider script is syntactically valid JS (got: ${pollySyntaxError && pollySyntaxError.message})`);

// ---- Default (no ttsProvider set) falls back to the free browser voice, not Polly ----
const defaultProviderScript = buildChatOverlayScript('chat-item7-6', baseProps);
assert(defaultProviderScript.includes('TTS_PROVIDER = "browser"'), 'an unset ttsProvider defaults to the free browser voice, not Polly');

// ---- Distinct instances don't leak each other's ids ----
const scriptA = buildChatOverlayScript('chat-A', baseProps);
const scriptB = buildChatOverlayScript('chat-B', baseProps);
assert(!scriptA.includes('chat-B') && !scriptB.includes('chat-A'), "two different instances' scripts don't reference each other's element ids");

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
