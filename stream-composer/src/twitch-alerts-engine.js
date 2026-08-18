// ============================================================================
// TWITCH ALERTS ENGINE — the actual runtime behavior baked into scene.html's
// <script> block for a twitch-alerts item: connect to Twitch's real-time
// EventSub-over-WebSocket feed and, on a matching follow/subscribe/cheer/
// raid event, play the streamer's own image/video + sound file locally.
//
// Same architecture as Chat + TTS Overlay (chat-tts-engine.js): this runs
// entirely INSIDE OBS's Browser Source — a separate Chromium context with
// no Tauri bridge at runtime — so it's plain WebSocket/fetch calls, not
// invoke(). That also means alerts work for the whole time OBS has this
// scene loaded, with no need for the main editor app to stay open or sit
// minimized in the tray - "keep the app running to monitor" turned out to
// be unnecessary once the connection lives in the same place Chat + TTS
// Overlay's already does.
//
// IMPORTANT VERIFICATION CAVEAT, read before trusting this blindly:
// - This is the SECOND networked feature in the app (after Chat + TTS
//   Overlay) and meaningfully riskier: it needs a real, authenticated user
//   OAuth token from the broadcaster (obtained via twitch-oauth.js's device-
//   code flow in the editor, baked in here at export time), not an
//   anonymous connection. EventSub-over-WebSocket's message shapes
//   (session_welcome/session_keepalive/notification/session_reconnect/
//   revocation) are documented at dev.twitch.tv/docs/eventsub/handling-
//   websocket-events/ and implemented here to match, but this has NOT been
//   tested against a live Twitch channel and a live follow/sub/cheer/raid -
//   that needs Harvey, same as every other live-connection feature in this
//   app, and MORE than usual given nobody has a real TWITCH_ALERTS_CLIENT_ID
//   baked in yet (see twitch-oauth.js's header) to even attempt it with.
// - Token refresh happens independently inside this baked script (it has to
//   - there's no app running to do it for a scene that outlives the editor
//   being open), using the same refresh_token grant Twitch's device-code
//   flow issues. If refresh ever fails outright, this alert item quietly
//   stops firing rather than looping forever - there's no UI inside OBS's
//   Browser Source to surface an error to.
// - The pure parsing/mapping logic below (mapAlertRuleToSubscription,
//   parseEventSubEnvelope, subscriptionTypeToAlertType,
//   extractAlertEventSummary) is a hand-kept-in-sync duplicate of
//   twitch-alerts-parsing.js, Node-tested there - the baked page has no
//   module imports available, same reasoning chat-tts-engine.js's inline
//   IRC parser copy follows.
// ============================================================================

export function buildTwitchAlertsScript(instanceId, props, resolvedRules) {
  const rulesForScript = (resolvedRules || []).map((r) => ({
    eventType: r.eventType,
    mediaPath: r.mediaPath || '',
    mediaKind: r.mediaKind || 'image',
    soundPath: r.soundPath || '',
    durationMs: r.durationMs || 6000,
  }));

  return `
(function () {
  const CLIENT_ID = ${JSON.stringify(props.clientId || '')};
  let accessToken = ${JSON.stringify(props.accessToken || '')};
  let refreshToken = ${JSON.stringify(props.refreshToken || '')};
  let tokenExpiresAt = ${JSON.stringify(props.tokenExpiresAt || 0)};
  const BROADCASTER_USER_ID = ${JSON.stringify(props.broadcasterUserId || '')};
  const RULES = ${JSON.stringify(rulesForScript)};

  const boxEl = document.getElementById('${instanceId}-box');
  const mediaEl = document.getElementById('${instanceId}-media');
  const videoEl = document.getElementById('${instanceId}-video');
  const audioEl = document.getElementById('${instanceId}-audio');
  const labelEl = document.getElementById('${instanceId}-label');

  // ---- alert display queue - one at a time, so overlapping events (e.g. a
  // cheer landing mid-raid-alert) don't stack visuals on top of each other ----
  const queue = [];
  let showing = false;
  function enqueueAlert(rule, summaryText) {
    queue.push({ rule: rule, summaryText: summaryText });
    processQueue();
  }
  function processQueue() {
    if (showing || queue.length === 0) return;
    showing = true;
    const next = queue.shift();
    const rule = next.rule;
    boxEl.style.display = 'flex';
    labelEl.textContent = next.summaryText;
    if (rule.mediaKind === 'video' && rule.mediaPath) {
      videoEl.src = rule.mediaPath;
      videoEl.style.display = '';
      mediaEl.style.display = 'none';
      videoEl.currentTime = 0;
      videoEl.play().catch(function () {});
    } else if (rule.mediaPath) {
      mediaEl.src = rule.mediaPath;
      mediaEl.style.display = '';
      videoEl.style.display = 'none';
    } else {
      mediaEl.style.display = 'none';
      videoEl.style.display = 'none';
    }
    if (rule.soundPath) {
      audioEl.src = rule.soundPath;
      audioEl.currentTime = 0;
      audioEl.play().catch(function () {});
    }
    setTimeout(function () {
      boxEl.style.display = 'none';
      videoEl.pause();
      showing = false;
      processQueue();
    }, rule.durationMs);
  }

  // ---- token refresh - this scene can outlive the editor being open, so it
  // has to keep its own token fresh with no app around to do it for it ----
  async function ensureFreshToken() {
    if (!refreshToken) return;
    if (tokenExpiresAt && Date.now() < tokenExpiresAt - 120000) return;
    try {
      const res = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, refresh_token: refreshToken, grant_type: 'refresh_token' }),
      });
      if (res.ok) {
        const body = await res.json();
        accessToken = body.access_token || accessToken;
        refreshToken = body.refresh_token || refreshToken;
        tokenExpiresAt = Date.now() + (body.expires_in || 0) * 1000;
      }
    } catch (e) { /* keep using the current token - next attempt happens before it's needed again */ }
  }

  // ---- pure logic - kept in sync by hand with twitch-alerts-parsing.js ----
  function mapAlertRuleToSubscription(eventType, broadcasterUserId) {
    if (eventType === 'follow') return { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: broadcasterUserId, moderator_user_id: broadcasterUserId } };
    if (eventType === 'subscribe') return { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: broadcasterUserId } };
    if (eventType === 'cheer') return { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: broadcasterUserId } };
    if (eventType === 'raid') return { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcasterUserId } };
    return null;
  }
  function parseEventSubEnvelope(rawJson) {
    let parsed;
    try { parsed = JSON.parse(rawJson); } catch (e) { return null; }
    const messageType = parsed && parsed.metadata && parsed.metadata.message_type;
    if (!messageType) return null;
    const payload = parsed.payload || {};
    if (messageType === 'session_welcome') {
      const sessionId = payload.session && payload.session.id;
      return sessionId ? { messageType: messageType, sessionId: sessionId } : null;
    }
    if (messageType === 'session_keepalive') return { messageType: messageType };
    if (messageType === 'session_reconnect') {
      const reconnectUrl = payload.session && payload.session.reconnect_url;
      return reconnectUrl ? { messageType: messageType, reconnectUrl: reconnectUrl } : null;
    }
    if (messageType === 'notification') {
      const subscriptionType = payload.subscription && payload.subscription.type;
      if (!subscriptionType || !payload.event) return null;
      return { messageType: messageType, subscriptionType: subscriptionType, event: payload.event };
    }
    if (messageType === 'revocation') {
      return { messageType: messageType, subscriptionType: (payload.subscription && payload.subscription.type) || null };
    }
    return { messageType: messageType };
  }
  function subscriptionTypeToAlertType(subscriptionType) {
    if (subscriptionType === 'channel.follow') return 'follow';
    if (subscriptionType === 'channel.subscribe') return 'subscribe';
    if (subscriptionType === 'channel.cheer') return 'cheer';
    if (subscriptionType === 'channel.raid') return 'raid';
    return null;
  }
  function extractAlertEventSummary(alertType, event) {
    if (alertType === 'follow') return (event.user_name || event.user_login || 'Someone') + ' just followed!';
    if (alertType === 'subscribe') return (event.user_name || event.user_login || 'Someone') + ' just subscribed!';
    if (alertType === 'cheer') return (event.is_anonymous ? 'Someone' : (event.user_name || event.user_login || 'Someone')) + ' cheered ' + (event.bits || '?') + ' bits!';
    if (alertType === 'raid') return (event.from_broadcaster_user_name || event.from_broadcaster_user_login || 'Someone') + ' raided with ' + (event.viewers != null ? event.viewers : '?') + ' viewers!';
    return '';
  }

  // ---- EventSub subscription creation, one per configured rule ----
  async function createSubscription(sessionId, eventType) {
    const sub = mapAlertRuleToSubscription(eventType, BROADCASTER_USER_ID);
    if (!sub) return;
    await ensureFreshToken();
    try {
      await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: { 'Client-Id': CLIENT_ID, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: sub.type, version: sub.version, condition: sub.condition, transport: { method: 'websocket', session_id: sessionId } }),
      });
    } catch (e) { /* this one rule's alert just won't fire - the others still can */ }
  }

  // ---- connection lifecycle ----
  let ws = null;
  let keepaliveTimer = null;
  function resetKeepaliveTimeout() {
    clearTimeout(keepaliveTimer);
    // Twitch's default keepalive interval is short (commonly 10s); doubling
    // a generous 30s ceiling regardless of the server's exact configured
    // interval keeps this simple and still catches a genuinely dead socket
    // well before a viewer would notice a missed alert.
    keepaliveTimer = setTimeout(function () { try { ws.close(); } catch (e) {} }, 30000);
  }
  function connect(url) {
    ws = new WebSocket(url || 'wss://eventsub.wss.twitch.tv/ws');
    ws.onmessage = async function (evt) {
      const msg = parseEventSubEnvelope(evt.data);
      if (!msg) return;
      if (msg.messageType === 'session_welcome') {
        resetKeepaliveTimeout();
        for (let i = 0; i < RULES.length; i++) { await createSubscription(msg.sessionId, RULES[i].eventType); }
      } else if (msg.messageType === 'session_keepalive') {
        resetKeepaliveTimeout();
      } else if (msg.messageType === 'session_reconnect') {
        connect(msg.reconnectUrl);
      } else if (msg.messageType === 'notification') {
        resetKeepaliveTimeout();
        const alertType = subscriptionTypeToAlertType(msg.subscriptionType);
        const rule = RULES.find(function (r) { return r.eventType === alertType; });
        if (rule) enqueueAlert(rule, extractAlertEventSummary(alertType, msg.event));
      }
      // revocation: no action taken in v1 - that one subscription is simply
      // gone until the next reconnect re-creates it.
    };
    ws.onclose = function () {
      clearTimeout(keepaliveTimer);
      setTimeout(function () { connect(); }, 5000);
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  if (RULES.length > 0 && CLIENT_ID && accessToken && BROADCASTER_USER_ID) {
    connect();
  }
})();
`;
}
