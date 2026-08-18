// ============================================================================
// TWITCH OAUTH — DEVICE CODE FLOW
// ============================================================================
// Twitch alerts (follow/subscribe/cheer/raid) need a real USER access token
// from the broadcaster - not the anonymous connection Chat + TTS Overlay
// uses for reading chat. This app has no backend/server (a hard project
// rule - see ROADMAP.md's "never store user data on TheNerdyBox
// infrastructure"), which rules out the usual server-side Authorization
// Code flow. Two flows are actually viable for a pure desktop app with no
// backend: Implicit Grant, or Device Code. This app uses DEVICE CODE:
//
// - No redirect URI at all, so no local HTTP listener or custom URI scheme
//   needs to be stood up just to catch a callback.
// - The user authorizes in their OWN regular browser (twitch.tv/activate,
//   or whatever verification_uri Twitch returns) by typing a short code -
//   nothing ever opens an embedded/owned webview pointed at Twitch's login
//   page, which is both simpler and avoids "no login inside someone else's
//   webview" concerns some providers have.
// - Twitch does NOT support PKCE on its Authorization Code flow (confirmed
//   directly by a Twitch moderator on their dev forum, Dec 2024) - Device
//   Code is the flow Twitch itself points people toward instead.
//
// Confirmed against Twitch's own docs (dev.twitch.tv/docs/authentication):
// POST https://id.twitch.tv/oauth2/device to start, then poll
// POST https://id.twitch.tv/oauth2/token until the user finishes.
//
// TWITCH_ALERTS_CLIENT_ID below is a REAL GAP, not a rounding error: every
// Twitch API call needs a Client ID from a registered Twitch application,
// and registering one needs a human with a real Twitch account at
// dev.twitch.tv/console - something only Harvey can do. The Client ID
// itself is meant to be public/embedded (no client secret is involved in
// either Device Code or its refresh step), so baking it into the app once
// registered is the normal, expected pattern - this is exactly how
// basically every desktop Twitch tool works. Until Harvey provides a real
// one, this whole feature is wired up and testable end-to-end EXCEPT the
// final "does Twitch actually accept it" step.
export const TWITCH_ALERTS_CLIENT_ID = ''; // <-- Harvey: paste your Client ID from dev.twitch.tv/console here

// One scope per alert type this app supports. `channel.raid` needs no
// scope at all (a public event) - not listed here on purpose.
export const TWITCH_ALERTS_SCOPES = [
  'moderator:read:followers', // channel.follow
  'channel:read:subscriptions', // channel.subscribe
  'bits:read', // channel.cheer
];

const DEVICE_CODE_URL = 'https://id.twitch.tv/oauth2/device';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';

// ---- Pure request-body builders — Node-testable without a live network call ----
export function buildDeviceCodeRequestBody(clientId, scopes) {
  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('scopes', (scopes || []).join(' '));
  return params;
}

export function buildTokenPollRequestBody(clientId, deviceCode) {
  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('device_code', deviceCode);
  params.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  return params;
}

export function buildRefreshRequestBody(clientId, refreshToken) {
  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('refresh_token', refreshToken);
  params.set('grant_type', 'refresh_token');
  return params;
}

// Twitch returns HTTP 400 with message "authorization_pending" while the
// user hasn't finished typing the code into their browser yet - that's the
// expected/normal state while polling, not a real error.
export function isTokenPollPending(responseBody) {
  const reason = (responseBody && (responseBody.message || responseBody.error)) || '';
  return reason === 'authorization_pending';
}

// A token is treated as due for refresh a couple minutes early, so a
// long-running baked alert scene never gets caught mid-stream with an
// already-expired token.
export function isTokenDueForRefresh(tokenExpiresAt, nowMs) {
  return !tokenExpiresAt || nowMs >= tokenExpiresAt - 120000;
}

// ---- Live calls (need a real Client ID + network - not unit-testable) ----
export async function startTwitchDeviceAuth(clientId) {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildDeviceCodeRequestBody(clientId, TWITCH_ALERTS_SCOPES),
  });
  if (!res.ok) throw new Error('Twitch device-code request failed (HTTP ' + res.status + ')');
  return res.json(); // { device_code, user_code, verification_uri, expires_in, interval }
}

// Resolves to { done: false } while still waiting on the user, or
// { done: true, tokens: {...} } once they've authorized. Throws on a real
// failure (expired code, denied, etc.) - the caller stops polling then.
export async function pollTwitchDeviceToken(clientId, deviceCode) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildTokenPollRequestBody(clientId, deviceCode),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { done: true, tokens: body }; // { access_token, refresh_token, expires_in, scope, token_type }
  if (isTokenPollPending(body)) return { done: false };
  throw new Error('Twitch authorization failed: ' + (body.message || body.error || res.status));
}

export async function refreshTwitchToken(clientId, refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildRefreshRequestBody(clientId, refreshToken),
  });
  if (!res.ok) throw new Error('Twitch token refresh failed (HTTP ' + res.status + ')');
  return res.json();
}

// No `login` param at all — Twitch's Users API returns the TOKEN OWNER's
// own account when called this way, which is exactly what's needed right
// after a device-code authorization completes (no separate "type your
// username" step for the user).
export async function resolveOwnTwitchUser(clientId, accessToken) {
  const res = await fetch(USERS_URL, {
    headers: { 'Client-Id': clientId, Authorization: 'Bearer ' + accessToken },
  });
  if (!res.ok) throw new Error('Could not read your Twitch account back (HTTP ' + res.status + ')');
  const body = await res.json();
  return body.data && body.data[0] ? body.data[0] : null; // { id, login, display_name, ... }
}
