// ============================================================================
// Tests for chat-message-parsing.js. Runs in plain Node — these are the one
// part of the chat-connection logic that's genuinely checkable without a
// live connection to real Twitch/Kick chat.
//
// Run with: node src/chat-message-parsing.test.mjs
// ============================================================================

import { parseTwitchIrcMessage, parseKickChatEvent, isEmoteOnlyMessage, parseTikTokChatEvent, isTikTokMemberEvent } from './chat-message-parsing.js';

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

const emotesLine = '@display-name=Foo;emotes=25:0-4,6-10 :foo!foo@foo.tmi.twitch.tv PRIVMSG #chan :Kappa Kappa';
const emotesParsed = parseTwitchIrcMessage(emotesLine);
assert(emotesParsed !== null && emotesParsed.emotes === '25:0-4,6-10', `the emotes tag is extracted (got "${emotesParsed && emotesParsed.emotes}")`);
assert(noTagsParsed.emotes === '', 'emotes is an empty string when the tag is absent, not undefined');

// ---- isEmoteOnlyMessage ----
assert(isEmoteOnlyMessage('Kappa Kappa', '25:0-4,6-10') === true, 'a message that is entirely two emotes (with a space between) is emote-only');
assert(isEmoteOnlyMessage('hello Kappa', '25:6-10') === false, 'a message with real text plus an emote is not emote-only');
assert(isEmoteOnlyMessage('Kappa', '') === false, 'no emotes tag at all means not emote-only, even if the text happens to match an emote name');
assert(isEmoteOnlyMessage('', '25:0-4') === false, 'an empty message is not emote-only');
assert(isEmoteOnlyMessage('hello', null) === false, 'a null emotes tag does not throw, returns false');
assert(isEmoteOnlyMessage('Kappa', '25:0-4,99-105') === true, 'an out-of-range emote entry is ignored rather than throwing, and the in-range one still covers the message');
assert(isEmoteOnlyMessage('Kappa', 'not-a-valid-entry') === false, 'a malformed emotes tag does not throw and does not mark the message emote-only');

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

// ---- parseTikTokChatEvent / isTikTokMemberEvent ----
// Field names (comment/user/action) are confirmed from Euler Stream's own
// published SDK types; the outer envelope shape is NOT confirmed (no live
// key to test against) - these fixtures cover both "sent directly" and
// "wrapped in a data/payload envelope" shapes defensively. See
// chat-message-parsing.js's header comment for the full caveat.

const tiktokDirectChat = JSON.stringify({
  common: { method: 'WebcastChatMessage' },
  user: { nickname: 'tiktokuser', uniqueId: 'tiktokuser_id' },
  comment: 'hey everyone',
});
const tiktokDirectParsed = parseTikTokChatEvent(tiktokDirectChat);
assert(tiktokDirectParsed !== null, 'a TikTok chat event sent directly (no envelope) parses successfully');
assert(tiktokDirectParsed.username === 'tiktokuser', `the nickname is used as the username (got ${tiktokDirectParsed && tiktokDirectParsed.username})`);
assert(tiktokDirectParsed.message === 'hey everyone', `the comment text is extracted exactly (got "${tiktokDirectParsed && tiktokDirectParsed.message}")`);

const tiktokWrappedChat = JSON.stringify({
  event: 'chat',
  data: { user: { nickname: 'wrappeduser' }, comment: 'wrapped message' },
});
const tiktokWrappedParsed = parseTikTokChatEvent(tiktokWrappedChat);
assert(tiktokWrappedParsed !== null, 'a TikTok chat event wrapped in a data envelope also parses');
assert(tiktokWrappedParsed.username === 'wrappeduser', `the wrapped event's username is extracted (got ${tiktokWrappedParsed && tiktokWrappedParsed.username})`);

const tiktokNoNickname = JSON.stringify({ user: { uniqueId: 'fallback_id' }, comment: 'no nickname here' });
const tiktokNoNicknameParsed = parseTikTokChatEvent(tiktokNoNickname);
assert(tiktokNoNicknameParsed !== null && tiktokNoNicknameParsed.username === 'fallback_id', `falls back to uniqueId when nickname is absent (got ${tiktokNoNicknameParsed && tiktokNoNicknameParsed.username})`);

const tiktokMemberEvent = JSON.stringify({ user: { nickname: 'joiner' }, action: 1 });
assert(parseTikTokChatEvent(tiktokMemberEvent) === null, 'a member/join event (no comment field) is not parsed as a chat message');
assert(isTikTokMemberEvent(tiktokMemberEvent) === true, 'a member/join event is correctly identified as one');
assert(isTikTokMemberEvent(tiktokDirectChat) === false, 'a real chat message is not misidentified as a member event');

assert(parseTikTokChatEvent('') === null, 'an empty string returns null');
assert(parseTikTokChatEvent(null) === null, 'null input returns null, does not throw');
assert(parseTikTokChatEvent('not json at all') === null, 'malformed JSON returns null, does not throw');
assert(parseTikTokChatEvent(JSON.stringify({ comment: '   ' })) === null, 'a whitespace-only comment is treated as not a real message');
assert(isTikTokMemberEvent('not json') === false, 'malformed JSON for isTikTokMemberEvent returns false, does not throw');
assert(isTikTokMemberEvent(null) === false, 'null input for isTikTokMemberEvent returns false, does not throw');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
