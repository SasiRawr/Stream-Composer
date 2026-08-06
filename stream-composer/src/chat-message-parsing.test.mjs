// ============================================================================
// Tests for chat-message-parsing.js. Runs in plain Node — these are the one
// part of the chat-connection logic that's genuinely checkable without a
// live connection to real Twitch/Kick chat.
//
// Run with: node src/chat-message-parsing.test.mjs
// ============================================================================

import { parseTwitchIrcMessage, parseKickChatEvent } from './chat-message-parsing.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

// ---- parseTwitchIrcMessage ----

const realLine = '@badge-info=;badges=;color=#0000FF;display-name=SomeUser;emotes=;flags=;id=abc-123;mod=0;room-id=12345;subscriber=0;tmi-sent-ts=1234567890;turbo=0;user-id=67890;user-type= :someuser!someuser@someuser.tmi.twitch.tv PRIVMSG #channelname :Hello world!';
const parsed = parseTwitchIrcMessage(realLine);
assert(parsed !== null, 'a real PRIVMSG line with tags parses successfully');
assert(parsed.username === 'SomeUser', `display-name tag is used as the username (got ${parsed.username})`);
assert(parsed.message === 'Hello world!', `the trailing message text is extracted exactly (got "${parsed.message}")`);
assert(parsed.color === '#0000FF', `the color tag is extracted (got ${parsed.color})`);

const noTagsLine = ':someuser!someuser@someuser.tmi.twitch.tv PRIVMSG #channelname :No tags here';
const noTagsParsed = parseTwitchIrcMessage(noTagsLine);
assert(noTagsParsed !== null, 'a PRIVMSG line with no tags at all still parses');
assert(noTagsParsed.username === 'someuser', `falls back to the IRC nick when display-name is absent (got ${noTagsParsed.username})`);
assert(noTagsParsed.color === null, 'color is null when no color tag is present');

const messageWithColon = '@display-name=Foo :foo!foo@foo.tmi.twitch.tv PRIVMSG #chan :Time is 12:30, see you then!';
const colonParsed = parseTwitchIrcMessage(messageWithColon);
assert(colonParsed !== null && colonParsed.message === 'Time is 12:30, see you then!', `a message containing its own colons is captured in full (got "${colonParsed && colonParsed.message}")`);

const pingLine = 'PING :tmi.twitch.tv';
assert(parseTwitchIrcMessage(pingLine) === null, 'a PING line (not a chat message) returns null, not a false match');

assert(parseTwitchIrcMessage('') === null, 'an empty string returns null');
assert(parseTwitchIrcMessage(null) === null, 'null input returns null, does not throw');
assert(parseTwitchIrcMessage(undefined) === null, 'undefined input returns null, does not throw');
assert(parseTwitchIrcMessage('garbage not irc at all') === null, 'a non-IRC-shaped string returns null');

// ---- parseKickChatEvent ----

const kickEnvelope = JSON.stringify({
  event: 'App\\Events\\ChatMessageEvent',
  data: JSON.stringify({
    id: 'abc-123',
    chatroom_id: 456,
    content: 'gg well played',
    type: 'message',
    sender: { id: 789, username: 'kickuser', identity: { color: '#FF0000', badges: [] } },
  }),
  channel: 'chatrooms.456.v2',
});
const kickParsed = parseKickChatEvent(kickEnvelope);
assert(kickParsed !== null, 'a well-formed Kick chat event envelope parses successfully');
assert(kickParsed.username === 'kickuser', `the sender's username is extracted (got ${kickParsed.username})`);
assert(kickParsed.message === 'gg well played', `the message content is extracted exactly (got "${kickParsed.message}")`);

const kickSystemEvent = JSON.stringify({ event: 'pusher:connection_established', data: '{"socket_id":"123.456"}' });
assert(parseKickChatEvent(kickSystemEvent) === null, 'a Pusher system event (not a chat message) returns null');

const kickWrongType = JSON.stringify({
  event: 'App\\Events\\ChatMessageEvent',
  data: JSON.stringify({ type: 'reply', content: 'not a real message', sender: { username: 'x' } }),
});
assert(parseKickChatEvent(kickWrongType) === null, 'a non-"message"-type event (e.g. a reply/system event) returns null');

const kickMissingSender = JSON.stringify({
  event: 'App\\Events\\ChatMessageEvent',
  data: JSON.stringify({ type: 'message', content: 'hi' }),
});
assert(parseKickChatEvent(kickMissingSender) === null, 'an event missing sender info returns null instead of throwing');

assert(parseKickChatEvent('not even json') === null, 'malformed outer JSON returns null, does not throw');
assert(parseKickChatEvent(JSON.stringify({ event: 'App\\Events\\ChatMessageEvent', data: 'not json' })) === null, 'malformed inner JSON returns null, does not throw');
assert(parseKickChatEvent('') === null, 'an empty string returns null');
assert(parseKickChatEvent(null) === null, 'null input returns null, does not throw');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
