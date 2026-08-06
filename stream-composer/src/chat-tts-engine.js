// ============================================================================
// CHAT + TTS OVERLAY ENGINE — the actual runtime behavior baked into
// scene.html's <script> block for a chat-overlay item: connect to whichever
// platforms are enabled, show a small live feed of recent messages, and
// read new messages aloud via the browser's built-in speechSynthesis (free,
// fully offline on Windows/WebView2 — no API key, no per-call cost).
//
// This is the FIRST networked feature in this app. Everything here runs
// inside OBS's Browser Source — a separate Chromium context with no Tauri
// bridge at runtime — so it's plain WebSocket/fetch/speechSynthesis calls,
// not Tauri invoke() calls. Same "one instance per item, scoped by
// instanceId" discipline as popup-slide-engine.js.
//
// Only Twitch and Kick are wired up (see ROADMAP.md/the v1.2.0 plan for why
// YouTube/TikTok/Trovo/X aren't here yet — YouTube specifically needs a
// bring-your-own-API-key flow, not a shared embedded key, per Harvey's
// explicit call to avoid a shared-quota-abuse risk).
//
// IMPORTANT VERIFICATION CAVEAT, read before trusting this blindly:
// - Twitch's anonymous IRC connection (`justinfan<N>`, no password) is a
//   long-standing, widely-used community convention, not an officially
//   documented Twitch feature — it currently works, but Twitch could
//   restrict it without notice.
// - Kick has NO officially-sanctioned zero-setup path at all. The
//   connection below replicates what Kick's own web client does
//   (Pusher WebSocket), the same technique several community libraries
//   use — but Kick's Pusher APP KEY is not something I could verify from
//   here (it's embedded in Kick's live frontend, not documented anywhere
//   I could confirm against). KICK_PUSHER_APP_KEY below is a PLACEHOLDER,
//   not a verified value — see its own comment for how to fill in the
//   real one. Kick chat will not work until that's done.
// - Neither connector has been tested against a real live channel — that
//   needs Harvey, same as every visual/live-behavior feature in this app.
// ============================================================================

import { platformIconSvg } from './popup-slide-icons.js';

export function buildChatOverlayScript(instanceId, props) {
  const enabledPlatforms = (props.platforms || []).filter((p) => p.enabled && p.channelName && p.channelName.trim());
  const iconSvgByPlatform = {
    twitch: platformIconSvg('twitch'),
    kick: platformIconSvg('kick'),
  };

  return `
(function () {
  const TTS_ENABLED = ${JSON.stringify(!!props.ttsEnabled)};
  const TTS_RATE = ${JSON.stringify(props.ttsRate ?? 1)};
  const TTS_VOLUME = ${JSON.stringify(props.ttsVolume ?? 1)};
  const FILTER_COMMANDS = ${JSON.stringify(!!props.filterCommands)};
  const MAX_VISIBLE = ${JSON.stringify(props.maxVisibleMessages ?? 3)};
  const DISPLAY_MS = ${JSON.stringify(props.messageDisplayMs ?? 6000)};
  const ICON_SVG = ${JSON.stringify(iconSvgByPlatform)};

  const feedEl = document.getElementById('${instanceId}-feed');

  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Parsers (same logic as chat-message-parsing.js, re-implemented
  // inline since the baked page has no module imports available) ----
  function parseTwitchIrcMessage(rawLine) {
    if (!rawLine) return null;
    const match = rawLine.match(/^(?:@(\\S+) )?:(\\S+)!\\S+@\\S+\\.tmi\\.twitch\\.tv PRIVMSG #\\S+ :(.*)$/);
    if (!match) return null;
    const tagsRaw = match[1], nick = match[2], message = match[3];
    const tags = {};
    if (tagsRaw) {
      tagsRaw.split(';').forEach((pair) => {
        const eqIdx = pair.indexOf('=');
        if (eqIdx !== -1) tags[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      });
    }
    return { username: tags['display-name'] || nick, message: message };
  }

  function parseKickChatEvent(rawPusherMessage) {
    if (!rawPusherMessage) return null;
    let outer;
    try { outer = JSON.parse(rawPusherMessage); } catch (e) { return null; }
    if (!outer || outer.event !== 'App\\\\Events\\\\ChatMessageEvent' || typeof outer.data !== 'string') return null;
    let inner;
    try { inner = JSON.parse(outer.data); } catch (e) { return null; }
    if (!inner || inner.type !== 'message' || !inner.sender || typeof inner.content !== 'string') return null;
    return { username: inner.sender.username || 'unknown', message: inner.content };
  }

  // ---- TTS ----
  const ttsQueue = [];
  let speaking = false;

  function speakNext() {
    if (speaking || ttsQueue.length === 0 || !window.speechSynthesis) return;
    speaking = true;
    const text = ttsQueue.shift();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = TTS_RATE;
    utter.volume = TTS_VOLUME;
    utter.onend = function () { speaking = false; speakNext(); };
    utter.onerror = function () { speaking = false; speakNext(); };
    window.speechSynthesis.speak(utter);
  }

  // speechSynthesis.getVoices() is empty until the voiceschanged event
  // fires the first time in most Chromium contexts - just needs to be
  // listened for once, no action required beyond that.
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); };
  }

  // ---- Feed display ----
  function addMessageToFeed(platformKey, username, message) {
    const row = document.createElement('div');
    row.className = 'chat-message';
    const icon = ICON_SVG[platformKey] ? '<svg class="chat-badge" viewBox="0 0 24 24">' + ICON_SVG[platformKey] + '</svg>' : '';
    row.innerHTML = icon + '<span class="chat-username">' + escapeHtml(username) + '</span><span class="chat-text">' + escapeHtml(message) + '</span>';
    feedEl.appendChild(row);
    while (feedEl.children.length > MAX_VISIBLE) {
      feedEl.removeChild(feedEl.firstChild);
    }
    setTimeout(function () {
      if (row.parentNode) row.parentNode.removeChild(row);
    }, DISPLAY_MS);
  }

  // One atomic entry point for "a new chat message arrived" - the feed
  // update and the TTS enqueue always happen together here, never as
  // separate steps that could desync (same discipline
  // popup-slide-engine.js's setMessage() already established).
  function handleIncomingMessage(platformKey, username, message) {
    if (!message) return;
    if (FILTER_COMMANDS && message.trim().indexOf('!') === 0) return;
    addMessageToFeed(platformKey, username, message);
    if (TTS_ENABLED) {
      ttsQueue.push(username + ' says ' + message);
      speakNext();
    }
  }

  // ---- Twitch: anonymous IRC over WebSocket ----
  function connectTwitch(channel) {
    let ws;
    try {
      ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch (e) {
      return;
    }
    ws.onopen = function () {
      const anonNick = 'justinfan' + Math.floor(Math.random() * 100000);
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send('NICK ' + anonNick);
      ws.send('JOIN #' + channel.toLowerCase());
    };
    ws.onmessage = function (event) {
      const lines = String(event.data).split('\\r\\n').filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.indexOf('PING') === 0) { ws.send('PONG :tmi.twitch.tv'); continue; }
        const parsed = parseTwitchIrcMessage(line);
        if (parsed) handleIncomingMessage('twitch', parsed.username, parsed.message);
      }
    };
    ws.onclose = function () { setTimeout(function () { connectTwitch(channel); }, 5000); };
    ws.onerror = function () {};
  }

  // ---- Kick: the same Pusher WebSocket feed Kick's own web client uses ----
  // KICK_PUSHER_APP_KEY is a PLACEHOLDER - see this file's header comment.
  // To find the real current value: open kick.com in a browser, open
  // DevTools' Network tab, filter for "pusher", start watching any live
  // channel's chat, and read the app key out of the WebSocket URL
  // (wss://ws-us2.pusher.com/app/<KEY>?...). Kick chat will not connect
  // until this is filled in with a real, current value.
  const KICK_PUSHER_APP_KEY = 'REPLACE_WITH_REAL_KICK_PUSHER_APP_KEY';

  async function connectKick(channelSlug) {
    try {
      const res = await fetch('https://kick.com/api/v2/channels/' + channelSlug);
      const data = await res.json();
      const chatroomId = data && data.chatroom && data.chatroom.id;
      if (!chatroomId) return;

      const ws = new WebSocket('wss://ws-us2.pusher.com/app/' + KICK_PUSHER_APP_KEY + '?protocol=7&client=js&version=7.6.0&flash=false');
      ws.onopen = function () {
        ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: 'chatrooms.' + chatroomId + '.v2' } }));
      };
      ws.onmessage = function (event) {
        const parsed = parseKickChatEvent(event.data);
        if (parsed) handleIncomingMessage('kick', parsed.username, parsed.message);
      };
      ws.onclose = function () { setTimeout(function () { connectKick(channelSlug); }, 5000); };
      ws.onerror = function () {};
    } catch (err) {
      setTimeout(function () { connectKick(channelSlug); }, 10000);
    }
  }

  ${enabledPlatforms.map((p) => {
    if (p.key === 'twitch') return `connectTwitch(${JSON.stringify(p.channelName.trim())});`;
    if (p.key === 'kick') return `connectKick(${JSON.stringify(p.channelName.trim())});`;
    return '';
  }).filter(Boolean).join('\n  ')}
})();`;
}
