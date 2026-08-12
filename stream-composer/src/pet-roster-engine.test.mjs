// ============================================================================
// Tests for pet-roster-engine.js. Same discipline as viewer-pet-engine.js's
// tests: checks the generated STRING output only (it's a string builder,
// not a browser/WebSocket API) - actual live chat/wander behavior needs a
// real browser and a real chat connection, see the WHAT_TO_TEST checklist
// for that.
//
// Run with: node src/pet-roster-engine.test.mjs
// ============================================================================

import { buildPetRosterScript } from './pet-roster-engine.js';

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

// ---- Twitch, a real channel configured ----
const twitchScript = buildPetRosterScript('roster-item1-0', 'assets/roster-item1-0.png', {
  platformKey: 'twitch', channelName: 'somestreamer', maxPets: 6,
});
assert(twitchScript.includes("document.getElementById('roster-item1-0-stage')"), 'references the correct stage element id for this instance');
assert(twitchScript.includes("document.getElementById('roster-item1-0-status')"), 'references the correct status element id for this instance');
assert(twitchScript.includes('PET_SRC = "assets/roster-item1-0.png"'), 'the pet image asset path is baked into the output');
assert(twitchScript.includes('MAX_PETS = 6'), 'the configured max-pets cap is baked into the output');
assert(twitchScript.includes('connectTwitch("somestreamer")'), 'dispatches to the real connectTwitch call with the configured channel name');
assert(!twitchScript.includes('connectKick("somestreamer")'), 'does NOT also call connectKick when Twitch is the configured platform');
assert(twitchScript.includes('new WebSocket(\'wss://irc-ws.chat.twitch.tv:443\')'), 'connects to Twitch IRC over WebSocket');
assert(twitchScript.includes('justinfan'), 'uses anonymous justinfan IRC login, no credentials needed');
checkSyntax(twitchScript, 'twitch');

// ---- Kick, a real channel configured ----
const kickScript = buildPetRosterScript('roster-item2-1', 'a.png', { platformKey: 'kick', channelName: 'someKickChannel', maxPets: 4 });
assert(kickScript.includes('connectKick("someKickChannel")'), 'dispatches to the real connectKick call with the configured channel name');
assert(!kickScript.includes('connectTwitch("someKickChannel")'), 'does NOT also call connectTwitch when Kick is the configured platform');
assert(kickScript.includes('ws-us2.pusher.com'), 'connects to Kick over the Pusher WebSocket');
checkSyntax(kickScript, 'kick');

// ---- no channel name configured yet ----
const noChannelScript = buildPetRosterScript('roster-item3-2', 'a.png', { platformKey: 'twitch', channelName: '' });
assert(noChannelScript.includes("No channel name set for this Chat Pet Roster yet."), 'shows a real status message instead of connecting when no channel is configured');
assert(!/connectTwitch\("/.test(noChannelScript), 'no channel configured: connectTwitch is never actually CALLED with a literal argument (the function definition existing is fine, only the call site matters)');
checkSyntax(noChannelScript, 'no-channel');

// ---- roster/eviction logic present in the generated script ----
const rosterScript = buildPetRosterScript('roster-item4-3', 'a.png', { platformKey: 'twitch', channelName: 'x', maxPets: 3 });
assert(rosterScript.includes('const pets = new Map()'), 'maintains a per-username Map of active pets, not a single shared pet');
assert(rosterScript.includes('function spawnPet(username)'), 'spawns a new pet element per new chatter');
assert(rosterScript.includes('function evictLeastRecentlyActive()'), 'evicts the least-recently-active pet when the roster is full');
assert(rosterScript.includes('pets.size >= MAX_PETS'), 'only evicts once the configured cap is actually reached');
assert(rosterScript.includes('lastActiveAt'), 'tracks per-pet last-active time for the eviction ordering');
assert(rosterScript.includes('function react(username)'), 'the one atomic reaction entry point is keyed by username, not global');
assert(rosterScript.includes("wrapperEl.style.transform") && rosterScript.includes("imgEl.classList.add('is-reacting')"), 'position (wrapper) and the bounce reaction (inner img) are driven on separate elements, so they never fight over the same transform');

// ---- free-roam wander logic present ----
assert(rosterScript.includes('function tick()'), 'has a shared per-frame movement tick, not one timer per pet');
assert(rosterScript.includes('requestAnimationFrame(tick)'), 'drives the wander loop via requestAnimationFrame, not a fixed setInterval');
assert(rosterScript.includes('entry.vx *= -1') && rosterScript.includes('entry.vy *= -1'), 'bounces pets off the stage edges by inverting velocity, real movement physics not just a CSS idle loop');
checkSyntax(rosterScript, 'roster/wander');

// ---- maxPets clamping: a bad/out-of-range value never produces an invalid MAX_PETS ----
const highCapScript = buildPetRosterScript('roster-item5-4', 'a.png', { platformKey: 'twitch', channelName: 'x', maxPets: 9999 });
assert(highCapScript.includes('MAX_PETS = 30'), 'an absurdly high maxPets clamps to a sane ceiling (30)');

const lowCapScript = buildPetRosterScript('roster-item6-5', 'a.png', { platformKey: 'twitch', channelName: 'x', maxPets: 0 });
assert(lowCapScript.includes('MAX_PETS = 1'), 'a maxPets of 0 (or below) clamps up to a minimum of 1, never zero pets allowed');

// ---- defaults: no props at all still produces a valid, sensible script ----
const defaultScript = buildPetRosterScript('roster-item7-6', 'a.png', {});
assert(defaultScript.includes('MAX_PETS = 6'), 'an unset maxPets defaults to a reasonable 6');
assert(defaultScript.includes("No channel name set"), 'an unset channelName falls back to the status-message branch, same as an explicitly empty one');
checkSyntax(defaultScript, 'default');

// ---- distinct instances don't leak each other's ids ----
const scriptA = buildPetRosterScript('roster-A', 'a.png', {});
const scriptB = buildPetRosterScript('roster-B', 'c.png', {});
assert(!scriptA.includes('roster-B') && !scriptB.includes('roster-A'), "two different instances' scripts don't reference each other's element ids");

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
