// ============================================================================
// Tests for twitch-alerts-engine.js's script generation. Runs in plain Node.
// The live WebSocket/EventSub/OAuth-refresh behavior is NOT covered here —
// see the module's own header comment for why that needs Harvey and a real
// Twitch Client ID.
//
// Run with: node src/twitch-alerts-engine.test.mjs
// ============================================================================

import vm from 'node:vm';
import { buildTwitchAlertsScript } from './twitch-alerts-engine.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const baseProps = {
  clientId: 'test-client-id',
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  tokenExpiresAt: 9999999999999,
  broadcasterUserId: 'U1',
};

const rules = [
  { eventType: 'follow', mediaPath: 'assets/item1-rule0-media.png', mediaKind: 'image', soundPath: 'assets/item1-rule0-sound.mp3', durationMs: 5000 },
  { eventType: 'raid', mediaPath: 'assets/item1-rule1-media.mp4', mediaKind: 'video', soundPath: '', durationMs: 8000 },
];

// ---- syntactic validity ----
const script1 = buildTwitchAlertsScript('twitch-alerts-item1-0', baseProps, rules);
assert(typeof script1 === 'string' && script1.length > 0, 'buildTwitchAlertsScript returns a non-empty string');
let syntaxOk = true;
try { new vm.Script(script1); } catch (e) { syntaxOk = false; console.error('  syntax error:', e.message); }
assert(syntaxOk, 'generated script is syntactically valid JS');

const emptyScript = buildTwitchAlertsScript('twitch-alerts-item2-1', baseProps, []);
let emptySyntaxOk = true;
try { new vm.Script(emptyScript); } catch (e) { emptySyntaxOk = false; console.error('  syntax error:', e.message); }
assert(emptySyntaxOk, 'a script with zero configured rules is still syntactically valid JS (got: null)');

// ---- instance scoping ----
const scriptA = buildTwitchAlertsScript('twitch-alerts-itemA-0', baseProps, rules);
const scriptB = buildTwitchAlertsScript('twitch-alerts-itemB-1', baseProps, rules);
assert(scriptA.includes('twitch-alerts-itemA-0-box'), 'a script references its own instance element ids');
assert(!scriptA.includes('twitch-alerts-itemB-1'), "two different instances' scripts don't reference each other's element ids");

// ---- rule data actually reaches the generated script ----
assert(script1.includes('assets/item1-rule0-media.png'), 'a rule\'s baked media path reaches the generated script');
assert(script1.includes('assets/item1-rule0-sound.mp3'), 'a rule\'s baked sound path reaches the generated script');
assert(script1.includes('"eventType":"follow"') || script1.includes('"eventType": "follow"'), 'the rule event type reaches the generated script');

// ---- connection only starts when actually configured ----
const noTokenScript = buildTwitchAlertsScript('twitch-alerts-item3-0', { ...baseProps, accessToken: '' }, rules);
assert(noTokenScript.includes('if (RULES.length > 0 && CLIENT_ID && accessToken && BROADCASTER_USER_ID)'), 'connection is gated on having a real access token, client id, and broadcaster id, not just any rules');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
