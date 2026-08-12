// ============================================================================
// CHAT PET ROSTER ENGINE — the actual runtime behavior baked into
// scene.html's <script> block for a pet-roster item: one pet PER active
// chatter (not a single global pet — see viewer-pet-engine.js for that
// simpler version), each free-roam wandering inside the item's box, and
// bouncing specifically when ITS OWN chatter sends a message.
//
// Scoped 2026-08-11/12 after reviewing a real reference video Harvey sent
// (a game's squad-list HUD showing one small animated pet per teammate
// name) and confirming the design with him directly: roster capped to the
// N most-recently-active chatters (a new chatter evicts whoever's been
// quietest longest once full), all pets share one image for v1 (no
// per-user tint/label), real free-roam wander movement (position/velocity
// state + edge-bounce, not a fixed-spot idle loop), bounce reaction
// targets the specific chatter's own pet.
//
// Twitch + Kick only for v1, same platform set/sequencing as Viewer Pet
// and the original Chat + TTS Overlay. The Twitch IRC / Kick Pusher
// connector code below is a deliberate inline copy of the same connectors
// already in viewer-pet-engine.js and chat-tts-engine.js — every engine
// module bakes its own copy since the runtime output is a standalone
// script with no module imports available. The one real difference from
// Viewer Pet's connectors: this version has to actually extract WHO sent
// the message (not just "a message arrived"), using the same
// username-extraction logic chat-message-parsing.js's pure
// parseTwitchIrcMessage()/parseKickChatEvent() functions already encode —
// kept in sync by hand, same as every other inlined-vs-pure-module pair
// in this app.
// ============================================================================

export function buildPetRosterScript(instanceId, petAssetPath, props) {
  const platform = props.platformKey || 'twitch';
  const channelName = (props.channelName || '').trim();
  const maxPets = Math.max(1, Math.min(30, props.maxPets ?? 6));

  // Resolved at GENERATION time, not baked as a runtime if/else - same
  // "avoid leaving both connectors' call-site text in every output"
  // discipline established for chat-tts-engine.js and viewer-pet-engine.js.
  const dispatchCall = !channelName
    ? "if (statusEl) statusEl.textContent = 'No channel name set for this Chat Pet Roster yet.';"
    : platform === 'kick'
      ? `connectKick(${JSON.stringify(channelName)});`
      : `connectTwitch(${JSON.stringify(channelName)});`;

  return `
(function () {
  const PET_SRC = ${JSON.stringify(petAssetPath)};
  const MAX_PETS = ${JSON.stringify(maxPets)};

  const stageEl = document.getElementById('${instanceId}-stage');
  const statusEl = document.getElementById('${instanceId}-status');

  const pets = new Map(); // username -> { el, x, y, vx, vy, size, lastActiveAt }

  function randomVelocity() {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 0.7; // px per animation-frame tick
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  }

  // Position lives on the wrapper (JS-driven, every wander tick); the
  // bounce reaction lives on the inner img (CSS-driven) - kept on
  // separate elements so the two transforms never fight over the same
  // element (see bake.js's CSS comment for why that matters).
  function positionPet(entry) {
    entry.wrapperEl.style.transform = 'translate(' + entry.x + 'px, ' + entry.y + 'px)';
  }

  function spawnPet(username) {
    const wrapperEl = document.createElement('div');
    wrapperEl.className = 'pet-roster-wrapper';
    const imgEl = document.createElement('img');
    imgEl.src = PET_SRC;
    imgEl.alt = '';
    imgEl.className = 'pet-roster-pet';
    wrapperEl.appendChild(imgEl);
    stageEl.appendChild(wrapperEl);

    const w = stageEl.clientWidth || 300;
    const h = stageEl.clientHeight || 300;
    const size = Math.max(24, Math.min(w, h) * 0.18);
    wrapperEl.style.width = size + 'px';
    wrapperEl.style.height = size + 'px';

    const v = randomVelocity();
    const entry = {
      wrapperEl,
      imgEl,
      x: Math.random() * Math.max(1, w - size),
      y: Math.random() * Math.max(1, h - size),
      vx: v.vx,
      vy: v.vy,
      size,
      lastActiveAt: performance.now(),
    };
    pets.set(username, entry);
    positionPet(entry);
    return entry;
  }

  function evictLeastRecentlyActive() {
    let oldestUser = null;
    let oldestAt = Infinity;
    for (const entry of pets) {
      if (entry[1].lastActiveAt < oldestAt) { oldestAt = entry[1].lastActiveAt; oldestUser = entry[0]; }
    }
    if (oldestUser !== null) {
      pets.get(oldestUser).wrapperEl.remove();
      pets.delete(oldestUser);
    }
  }

  // One atomic "this user chatted" entry point - same discipline every
  // other engine module in this app uses, so spawning/evicting/reacting
  // can never desync from each other.
  function react(username) {
    if (!username) return;
    let entry = pets.get(username);
    if (!entry) {
      if (pets.size >= MAX_PETS) evictLeastRecentlyActive();
      entry = spawnPet(username);
    }
    entry.lastActiveAt = performance.now();
    entry.imgEl.classList.remove('is-reacting');
    void entry.imgEl.offsetWidth;
    entry.imgEl.classList.add('is-reacting');
  }

  // One shared wander loop drives every pet's free-roam movement + edge
  // bounce each frame, rather than a separate timer per pet.
  function tick() {
    const w = stageEl.clientWidth || 300;
    const h = stageEl.clientHeight || 300;
    for (const entry of pets.values()) {
      entry.x += entry.vx;
      entry.y += entry.vy;
      const maxX = Math.max(0, w - entry.size);
      const maxY = Math.max(0, h - entry.size);
      if (entry.x <= 0 || entry.x >= maxX) { entry.vx *= -1; entry.x = Math.min(Math.max(entry.x, 0), maxX); }
      if (entry.y <= 0 || entry.y >= maxY) { entry.vy *= -1; entry.y = Math.min(Math.max(entry.y, 0), maxY); }
      positionPet(entry);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---- Twitch: anonymous IRC over WebSocket (same convention as
  // chat-tts-engine.js/viewer-pet-engine.js's connectTwitch), extended to
  // pull the actual chatter's display-name out of the IRC tags ----
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
        const match = line.match(/^(?:@(\\S+) )?:(\\S+)!\\S+@\\S+\\.tmi\\.twitch\\.tv PRIVMSG #\\S+ :/);
        if (!match) continue;
        const tagsRaw = match[1];
        let username = match[2];
        if (tagsRaw) {
          const pairs = tagsRaw.split(';');
          for (let j = 0; j < pairs.length; j++) {
            const eqIdx = pairs[j].indexOf('=');
            if (eqIdx === -1) continue;
            if (pairs[j].slice(0, eqIdx) === 'display-name' && pairs[j].slice(eqIdx + 1)) {
              username = pairs[j].slice(eqIdx + 1);
              break;
            }
          }
        }
        react(username);
      }
    };
    ws.onclose = function () { setTimeout(function () { connectTwitch(channel); }, 5000); };
  }

  // ---- Kick: unofficial Pusher WebSocket (same convention as
  // chat-tts-engine.js/viewer-pet-engine.js's connectKick - see either
  // file's comment for the placeholder-app-key caveat, unchanged here) ----
  const KICK_PUSHER_APP_KEY = '32cbd69e4b950bf97679'; // see chat-tts-engine.js's comment for how to verify/replace this
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
        if (!parsed || parsed.event !== 'App\\\\Events\\\\ChatMessageEvent' || typeof parsed.data !== 'string') return;
        let inner;
        try { inner = JSON.parse(parsed.data); } catch (e) { return; }
        const username = inner && inner.sender && inner.sender.username;
        if (username) react(username);
      };
      ws.onclose = function () { setTimeout(function () { connectKick(channelSlug); }, 5000); };
    } catch (e) {
      setTimeout(function () { connectKick(channelSlug); }, 10000);
    }
  }

  ${dispatchCall}
})();`;
}
