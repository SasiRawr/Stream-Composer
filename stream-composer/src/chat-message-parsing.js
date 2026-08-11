// ============================================================================
// CHAT MESSAGE PARSING — turns a raw Twitch IRC line or Kick Pusher WebSocket
// message into a plain { username, message } object (or null if the input
// isn't a real chat message — a PING, a Pusher system event, etc.).
//
// Pure string/JSON-in, object-out functions, no DOM/Tauri/network — the one
// part of the chat-connection logic that's genuinely unit-testable without a
// live connection. chat-tts-engine.js's baked runtime script re-implements
// this same logic inline (baked scene.html has no module imports available),
// so these are the source of truth to keep both copies in sync against.
// ============================================================================

// Twitch IRC PRIVMSG line, per Twitch's documented IRC tag format:
//   @badge-info=;color=#0000FF;display-name=SomeUser;... :someuser!someuser@someuser.tmi.twitch.tv PRIVMSG #channel :Hello world!
// Tag values aren't unescaped here (IRCv3 backslash-escaping) — the two tags
// actually used (display-name, color) never contain characters that need it
// in practice.
export function parseTwitchIrcMessage(rawLine) {
  if (!rawLine || typeof rawLine !== 'string') return null;
  const match = rawLine.match(/^(?:@(\S+) )?:(\S+)!\S+@\S+\.tmi\.twitch\.tv PRIVMSG #\S+ :(.*)$/);
  if (!match) return null;
  const [, tagsRaw, nick, message] = match;

  const tags = {};
  if (tagsRaw) {
    for (const pair of tagsRaw.split(';')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      tags[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
    }
  }

  return {
    username: tags['display-name'] || nick,
    message,
    color: tags.color || null,
    emotes: tags.emotes || '',
  };
}

// Twitch's `emotes` IRC tag lists where emotes appear in the message as
// "<emote-id>:<start>-<end>,<start>-<end>/<emote-id>:<start>-<end>...", where
// start/end are inclusive UTF-16 code-unit indices into `message`. A message
// is "emote-only" if every non-whitespace character falls inside one of
// those ranges — used to exempt pure-emote messages from TTS/the visible
// feed, the same way "!command" messages already are. Kick has no known
// equivalent metadata, so this only ever applies to Twitch messages.
export function isEmoteOnlyMessage(message, emotesTag) {
  if (!message || !message.trim() || !emotesTag) return false;

  const covered = new Array(message.length).fill(false);
  for (const emoteEntry of emotesTag.split('/')) {
    const colonIdx = emoteEntry.indexOf(':');
    if (colonIdx === -1) continue;
    for (const range of emoteEntry.slice(colonIdx + 1).split(',')) {
      const [startStr, endStr] = range.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      for (let i = Math.max(start, 0); i <= end && i < covered.length; i++) covered[i] = true;
    }
  }

  for (let i = 0; i < message.length; i++) {
    if (/\s/.test(message[i])) continue;
    if (!covered[i]) return false;
  }
  return true;
}

// Kick's chat feed runs over Pusher, whose messages are a JSON envelope with
// the real event payload double-JSON-encoded inside a "data" string field:
//   { "event": "App\\Events\\ChatMessageEvent",
//     "data": "{\"content\":\"Hello!\",\"type\":\"message\",\"sender\":{\"username\":\"someuser\"}}",
//     "channel": "chatrooms.123.v2" }
// This shape is community-documented (not an official Kick spec — see
// chat-tts-engine.js's header comment for the caveats that come with that),
// so treat any assumption here as best-effort until verified against a real
// live connection.
export function parseKickChatEvent(rawPusherMessage) {
  if (!rawPusherMessage || typeof rawPusherMessage !== 'string') return null;

  let outer;
  try {
    outer = JSON.parse(rawPusherMessage);
  } catch {
    return null;
  }
  if (!outer || outer.event !== 'App\\Events\\ChatMessageEvent' || typeof outer.data !== 'string') return null;

  let inner;
  try {
    inner = JSON.parse(outer.data);
  } catch {
    return null;
  }
  if (!inner || inner.type !== 'message' || !inner.sender || typeof inner.content !== 'string') return null;

  return {
    username: inner.sender.username || 'unknown',
    message: inner.content,
  };
}

// TikTok Live events arrive over a WebSocket relay (Euler Stream —
// wss://ws.eulerstream.com, connected to directly with a bring-your-own
// API key as a query param, no signing/relay of our own needed — see
// chat-tts-engine.js's header). This is the LEAST-verified parser in this
// file. Confirmed from Euler's own published SDK type definitions
// (tiktok-live-connector@2.1.0's tiktok-schema.d.ts): a real chat message
// has a `comment` string field; a join/member event has an `action` field
// instead (no documented "left the stream" action value was found — TikTok's
// event stream may simply not expose a leave event at all, which is why
// there's no leave-side function here). What's NOT confirmed: whether
// Euler's WebSocket sends these objects directly, or wraps them in an outer
// envelope (`{ event, data }`-style, the way Kick's Pusher feed does) — no
// real example message could be found without a live API key. Handles both
// shapes defensively; needs verification against an actual connection
// before trusting it the way the Twitch/Kick parsers can be trusted.
function unwrapPossibleEnvelope(parsed) {
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.comment === 'string' || parsed.action !== undefined) return parsed;
    if (parsed.data && typeof parsed.data === 'object') return parsed.data;
    if (parsed.payload && typeof parsed.payload === 'object') return parsed.payload;
  }
  return parsed;
}

export function parseTikTokChatEvent(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return null;
  }
  const event = unwrapPossibleEnvelope(parsed);
  if (!event || typeof event.comment !== 'string' || !event.comment.trim()) return null;

  const username = (event.user && (event.user.nickname || event.user.uniqueId)) || 'unknown';
  return { username, message: event.comment };
}

// Returns true for a join/member event (per the confirmed `action` field),
// so the engine can route it to a join-tone instead of the feed/TTS queue.
export function isTikTokMemberEvent(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return false;
  let parsed;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return false;
  }
  const event = unwrapPossibleEnvelope(parsed);
  return !!(event && event.action !== undefined && typeof event.comment !== 'string');
}
