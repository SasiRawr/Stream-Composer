// ============================================================================
// Tests for twitch-oauth.js's pure request-building logic. Runs in plain
// Node. The live fetch() calls (startTwitchDeviceAuth, pollTwitchDeviceToken,
// refreshTwitchToken, resolveTwitchUserId) need a real Client ID and a real
// network round-trip against Twitch — not covered here, see the module's
// own header comment.
//
// Run with: node src/twitch-oauth.test.mjs
// ============================================================================

import {
  buildDeviceCodeRequestBody,
  buildTokenPollRequestBody,
  buildRefreshRequestBody,
  isTokenPollPending,
  isTokenDueForRefresh,
  TWITCH_ALERTS_SCOPES,
} from './twitch-oauth.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

// ---- buildDeviceCodeRequestBody ----
const deviceBody = buildDeviceCodeRequestBody('abc123', TWITCH_ALERTS_SCOPES);
assert(deviceBody.get('client_id') === 'abc123', 'device-code request carries the client id');
assert(
  deviceBody.get('scopes') === 'moderator:read:followers channel:read:subscriptions bits:read',
  `device-code request space-joins the three alert scopes (got "${deviceBody.get('scopes')}")`
);

// ---- buildTokenPollRequestBody ----
const pollBody = buildTokenPollRequestBody('abc123', 'device-xyz');
assert(pollBody.get('device_code') === 'device-xyz', 'token-poll request carries the device code');
assert(
  pollBody.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code',
  'token-poll request uses the device-code grant type Twitch expects'
);

// ---- buildRefreshRequestBody ----
const refreshBody = buildRefreshRequestBody('abc123', 'refresh-xyz');
assert(refreshBody.get('refresh_token') === 'refresh-xyz', 'refresh request carries the refresh token');
assert(refreshBody.get('grant_type') === 'refresh_token', 'refresh request uses the refresh_token grant type');

// ---- isTokenPollPending ----
assert(isTokenPollPending({ message: 'authorization_pending' }) === true, 'authorization_pending (message field) is recognized as still-waiting');
assert(isTokenPollPending({ error: 'authorization_pending' }) === true, 'authorization_pending (error field) is recognized as still-waiting');
assert(isTokenPollPending({ message: 'expired_token' }) === false, 'a real failure reason is NOT treated as still-pending');
assert(isTokenPollPending({}) === false, 'an empty body is not mistaken for still-pending');

// ---- isTokenDueForRefresh ----
const now = 1000000000000;
assert(isTokenDueForRefresh(now + 121000, now) === false, 'a token with just over 2 minutes left is not due yet');
assert(isTokenDueForRefresh(now + 60000, now) === true, 'a token with only 1 minute left is due for refresh');
assert(isTokenDueForRefresh(0, now) === true, 'a token that was never fetched is treated as due');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
