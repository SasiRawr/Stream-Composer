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
  };
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
