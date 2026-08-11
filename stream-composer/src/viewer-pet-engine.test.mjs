// ============================================================================
// Tests for viewer-pet-engine.js. Same discipline as every other engine
// module test - checks the generated STRING output only, live WebSocket
// behavior needs a real browser and a real channel.
//
// Run with: node src/viewer-pet-engine.test.mjs
// ============================================================================

import { buildViewerPetScript } from './viewer-pet-engine.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const twitchScript = buildViewerPetScript('pet-item1-0', 'assets/pet-item1-0.png', { platformKey: 'twitch', channelName: 'somestreamer' });
assert(twitchScript.includes("document.getElementById('pet-item1-0-img')"), 'references the correct image element id for this instance');
assert(twitchScript.includes('PET_SRC = "assets/pet-item1-0.png"'), 'the pet image asset path is baked into the output');
assert(twitchScript.includes('connectTwitch("somestreamer")'), 'a Twitch platform gets its connect call invoked with the real channel name');
assert(!twitchScript.includes('connectKick("somestreamer")'), 'Kick does not get invoked when Twitch is the configured platform');
assert(twitchScript.includes('irc-ws.chat.twitch.tv'), 'the Twitch IRC WebSocket endpoint is present');
assert(twitchScript.includes('justinfan'), 'the anonymous Twitch login convention is present');
assert(twitchScript.includes("classList.add('is-reacting')"), 'a real chat message triggers the reaction CSS class');
assert(twitchScript.includes('offsetWidth'), 'forces a reflow so the reaction re-triggers even on rapid consecutive messages');

let twitchSyntaxError = null;
try { new Function(twitchScript); } catch (err) { twitchSyntaxError = err; }
assert(twitchSyntaxError === null, `Twitch-configured script is syntactically valid JS (got: ${twitchSyntaxError && twitchSyntaxError.message})`);

const kickScript = buildViewerPetScript('pet-item2-1', 'assets/pet-item2-1.png', { platformKey: 'kick', channelName: 'someKickChannel' });
assert(kickScript.includes('connectKick("someKickChannel")'), 'a Kick platform gets its connect call invoked with the real channel name');
assert(!kickScript.includes('connectTwitch("someKickChannel")'), 'Twitch does not get invoked when Kick is the configured platform');
assert(kickScript.includes('KICK_PUSHER_APP_KEY'), 'the Kick Pusher app key placeholder is present, same caveat as chat-tts-engine.js');
let kickSyntaxError = null;
try { new Function(kickScript); } catch (err) { kickSyntaxError = err; }
assert(kickSyntaxError === null, `Kick-configured script is syntactically valid JS (got: ${kickSyntaxError && kickSyntaxError.message})`);

const noChannelScript = buildViewerPetScript('pet-item3-2', 'assets/pet-item3-2.png', { platformKey: 'twitch', channelName: '' });
assert(!noChannelScript.includes('connectTwitch(CHANNEL)') && !noChannelScript.includes('connectKick(CHANNEL)'), 'no connect call happens at all when no channel name is set, regardless of platform');
assert(noChannelScript.includes('No channel name set'), 'a real, visible status message explains why nothing is connecting');

const defaultPlatformScript = buildViewerPetScript('pet-item4-3', 'a.png', { channelName: 'x' });
assert(defaultPlatformScript.includes('PLATFORM = "twitch"'), 'an unset platformKey defaults to Twitch');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
