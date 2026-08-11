// ============================================================================
// VIEWER PET ENGINE — the actual runtime behavior baked into scene.html's
// <script> block for a viewer-pet item: a character image that reacts
// (a short bounce animation) whenever a real chat message arrives on the
// configured platform. Confirmed buildable via ROADMAP.md's viewer-pets
// research (2026-08-11) — this is the chat-message-triggered version,
// NOT the event-triggered (follow/sub/bits) version, which needs
// Twitch EventSub/OAuth infrastructure this app doesn't have (same gap
// class as YouTube chat — see that research for the full split).
//
// Twitch + Kick only for v1 — the same platform set Chat + TTS Overlay
// shipped with first (v1.2.0), TikTok added as a later pass once its
// Euler Stream key flow was worked out. Same sequencing here rather than
// re-deriving all three connectors again in one pass. The connector code
// below is a deliberate, simplified INLINE copy of chat-tts-engine.js's
// Twitch/Kick connectors — same "self-contained baked script" convention
// every engine module in this app already follows (the baked output has
// no module imports available), just stripped down to "did a real
// message arrive," since a pet doesn't need the username/text content
// chat-tts-engine.js's fuller parsers extract.
// ============================================================================

export function buildViewerPetScript(instanceId, petAssetPath, props) {
  const platform = props.platformKey || 'twitch';
  const channelName = (props.channelName || '').trim();

  // Resolved at GENERATION time, not baked as a runtime if/else - a
  // runtime branch would leave both connectTwitch(CHANNEL)/
  // connectKick(CHANNEL) call-site text in the output regardless of
  // which platform is actually configured, the same "always contains
  // the call, not just the always-present function definition" trap
  // this project's chat-tts-engine.js already had to work around once.
  const dispatchCall = !channelName
    ? "if (statusEl) statusEl.textContent = 'No channel name set for this Viewer Pet yet.';"
    : platform === 'kick'
      ? `connectKick(${JSON.stringify(channelName)});`
      : `connectTwitch(${JSON.stringify(channelName)});`;

  return `
(function () {
  const PLATFORM = ${JSON.stringify(platform)};
  const CHANNEL = ${JSON.stringify(channelName)};
  const PET_SRC = ${JSON.stringify(petAssetPath)};

  const imgEl = document.getElementById('${instanceId}-img');
  const statusEl = document.getElementById('${instanceId}-status');

  if (imgEl) imgEl.src = PET_SRC;

  // One atomic "react now" entry point - same discipline every other
  // engine module in this app uses (popup-slide-engine.js's setMessage(),
  // chat-tts-engine.js's handleIncomingMessage()) so the visual reaction
  // can never desync from whatever triggered it.
  function react() {
    if (!imgEl) return;
    imgEl.classList.remove('is-reacting');
    // Force a reflow so removing+re-adding the class restarts the CSS
    // animation even if a message arrives again before the previous
    // bounce finished - void the expression, just needed for the reflow.
    void imgEl.offsetWidth;
    imgEl.classList.add('is-reacting');
  }

  // ---- Twitch: anonymous IRC over WebSocket (same convention as
  // chat-tts-engine.js's connectTwitch - justinfan login, no password) ----
  function connectTwitch(channel) {
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ws.onopen = function () {
      const nick = 'justinfan' + Math.floor(Math.random() * 999999);
      ws.send('PASS SCHMOOPIIE');
      ws.send('NICK ' + nick);
      ws.send('JOIN #' + channel.toLowerCase());
    };
    ws.onmessage = function (event) {
      const lines = event.data.split('\\r\\n').filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
        if (line.indexOf('PRIVMSG') !== -1) react();
      }
    };
    ws.onclose = function () { setTimeout(function () { connectTwitch(channel); }, 5000); };
  }

  // ---- Kick: unofficial Pusher WebSocket (same convention as
  // chat-tts-engine.js's connectKick - see that file for the placeholder-
  // app-key caveat, unchanged here) ----
  const KICK_PUSHER_APP_KEY = '32cbd69e4b950bf97679'; // see chat-tts-engine.js's own comment for how to verify/replace this
  async function connectKick(channelSlug) {
    try {
      const chatroomRes = await fetch('https://kick.com/api/v2/channels/' + channelSlug);
      const chatroomData = await chatroomRes.json();
      const chatroomId = chatroomData && chatroomData.chatroom && chatroomData.chatroom.id;
      if (!chatroomId) { if (statusEl) statusEl.textContent = 'Could not resolve this Kick channel.'; return; }
      const ws = new WebSocket('wss://ws-us2.pusher.com/app/' + KICK_PUSHER_APP_KEY + '?protocol=7&client=js&version=7.4.0&flash=false');
      ws.onopen = function () {
        ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: 'chatrooms.' + chatroomId + '.v2' } }));
      };
      ws.onmessage = function (event) {
        let parsed;
        try { parsed = JSON.parse(event.data); } catch (e) { return; }
        if (parsed && parsed.event === 'App\\\\Events\\\\ChatMessageEvent') react();
      };
      ws.onclose = function () { setTimeout(function () { connectKick(channelSlug); }, 5000); };
    } catch (e) {
      setTimeout(function () { connectKick(channelSlug); }, 10000);
    }
  }

  ${dispatchCall}
})();`;
}
