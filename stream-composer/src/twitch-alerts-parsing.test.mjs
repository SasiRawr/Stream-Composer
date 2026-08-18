// ============================================================================
// Tests for twitch-alerts-parsing.js. Runs in plain Node.
// Run with: node src/twitch-alerts-parsing.test.mjs
// ============================================================================

import {
  mapAlertRuleToSubscription,
  parseEventSubEnvelope,
  subscriptionTypeToAlertType,
  extractAlertEventSummary,
} from './twitch-alerts-parsing.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

// ---- mapAlertRuleToSubscription ----
const followSub = mapAlertRuleToSubscription('follow', 'U1');
assert(followSub.type === 'channel.follow' && followSub.version === '2', 'follow maps to channel.follow v2');
assert(followSub.condition.moderator_user_id === 'U1', 'follow condition names the broadcaster as their own moderator');

const subSub = mapAlertRuleToSubscription('subscribe', 'U1');
assert(subSub.type === 'channel.subscribe' && subSub.condition.broadcaster_user_id === 'U1', 'subscribe maps to channel.subscribe with the broadcaster id');

const cheerSub = mapAlertRuleToSubscription('cheer', 'U1');
assert(cheerSub.type === 'channel.cheer', 'cheer maps to channel.cheer');

const raidSub = mapAlertRuleToSubscription('raid', 'U1');
assert(raidSub.type === 'channel.raid' && raidSub.condition.to_broadcaster_user_id === 'U1', 'raid maps to channel.raid, condition keyed on to_broadcaster_user_id (raids TO this channel)');

assert(mapAlertRuleToSubscription('nonsense', 'U1') === null, 'an unrecognized event type maps to null rather than a guessed subscription');

// ---- parseEventSubEnvelope ----
const welcome = parseEventSubEnvelope(JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'sess-1' } } }));
assert(welcome.messageType === 'session_welcome' && welcome.sessionId === 'sess-1', 'session_welcome extracts the session id');

const welcomeMissingId = parseEventSubEnvelope(JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: {} } }));
assert(welcomeMissingId === null, 'a session_welcome with no session id is treated as malformed, not silently accepted');

const keepalive = parseEventSubEnvelope(JSON.stringify({ metadata: { message_type: 'session_keepalive' }, payload: {} }));
assert(keepalive.messageType === 'session_keepalive', 'session_keepalive parses with no further fields needed');

const reconnect = parseEventSubEnvelope(JSON.stringify({ metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://example/reconnect' } } }));
assert(reconnect.reconnectUrl === 'wss://example/reconnect', 'session_reconnect extracts the reconnect url');

const notification = parseEventSubEnvelope(JSON.stringify({
  metadata: { message_type: 'notification' },
  payload: { subscription: { type: 'channel.follow' }, event: { user_name: 'Tester' } },
}));
assert(notification.subscriptionType === 'channel.follow' && notification.event.user_name === 'Tester', 'notification extracts both the subscription type and the event payload');

const notificationMissingEvent = parseEventSubEnvelope(JSON.stringify({ metadata: { message_type: 'notification' }, payload: { subscription: { type: 'channel.follow' } } }));
assert(notificationMissingEvent === null, 'a notification with no event payload is treated as malformed');

assert(parseEventSubEnvelope('not json at all') === null, 'unparseable JSON never throws — returns null instead');
assert(parseEventSubEnvelope(JSON.stringify({ metadata: {} })) === null, 'a message with no message_type is rejected');

const unknownType = parseEventSubEnvelope(JSON.stringify({ metadata: { message_type: 'something_new_twitch_added' }, payload: {} }));
assert(unknownType.messageType === 'something_new_twitch_added', 'an unrecognized but well-formed message type is passed through, not treated as an error');

// ---- subscriptionTypeToAlertType ----
assert(subscriptionTypeToAlertType('channel.follow') === 'follow', 'channel.follow maps back to the "follow" rule key');
assert(subscriptionTypeToAlertType('channel.raid') === 'raid', 'channel.raid maps back to the "raid" rule key');
assert(subscriptionTypeToAlertType('channel.unknown_thing') === null, 'an unrecognized subscription type maps to null');

// ---- extractAlertEventSummary ----
assert(extractAlertEventSummary('follow', { user_name: 'Ada' }) === 'Ada just followed!', 'follow summary uses the display name');
assert(extractAlertEventSummary('follow', { user_login: 'ada_l' }) === 'ada_l just followed!', 'follow summary falls back to login if display name is missing');
assert(extractAlertEventSummary('cheer', { user_name: 'Ada', bits: 500 }) === 'Ada cheered 500 bits!', 'cheer summary includes the bit count');
assert(extractAlertEventSummary('cheer', { is_anonymous: true, bits: 100 }) === 'Someone cheered 100 bits!', 'an anonymous cheer never reveals a username, even if Twitch happened to include one');
assert(extractAlertEventSummary('raid', { from_broadcaster_user_name: 'Ada', viewers: 42 }) === 'Ada raided with 42 viewers!', 'raid summary includes the raider and viewer count');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
