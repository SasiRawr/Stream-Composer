// ============================================================================
// Pure EventSub-over-WebSocket parsing/mapping logic — Node-testable here,
// then hand-duplicated inline inside twitch-alerts-engine.js's baked
// <script> template (the baked page has no module imports available, same
// reasoning chat-tts-engine.js's inline parseTwitchIrcMessage copy follows).
// Keep the two copies in sync by hand if this file changes.
// ============================================================================

// Maps one alert rule's event type to the EventSub subscription Twitch
// actually expects (type + version + condition), given the broadcaster's
// own numeric user id (resolved once via the Users API before connecting).
// channel.follow v2 requires a moderator_user_id — the broadcaster reading
// their own channel's follows is always allowed to name themselves as that
// moderator, no separate mod-only token needed.
export function mapAlertRuleToSubscription(eventType, broadcasterUserId) {
  if (eventType === 'follow') {
    return { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: broadcasterUserId, moderator_user_id: broadcasterUserId } };
  }
  if (eventType === 'subscribe') {
    return { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: broadcasterUserId } };
  }
  if (eventType === 'cheer') {
    return { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: broadcasterUserId } };
  }
  if (eventType === 'raid') {
    return { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcasterUserId } };
  }
  return null;
}

// Safely pulls the pieces this app actually needs out of one raw EventSub
// WebSocket message. Returns null for anything malformed rather than
// throwing — a live connection to a third-party service should never crash
// the page on an unexpected frame.
export function parseEventSubEnvelope(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }
  const messageType = parsed && parsed.metadata && parsed.metadata.message_type;
  if (!messageType) return null;
  const payload = parsed.payload || {};

  if (messageType === 'session_welcome') {
    const sessionId = payload.session && payload.session.id;
    if (!sessionId) return null;
    return { messageType, sessionId };
  }
  if (messageType === 'session_keepalive') {
    return { messageType };
  }
  if (messageType === 'session_reconnect') {
    const reconnectUrl = payload.session && payload.session.reconnect_url;
    if (!reconnectUrl) return null;
    return { messageType, reconnectUrl };
  }
  if (messageType === 'notification') {
    const subscriptionType = payload.subscription && payload.subscription.type;
    if (!subscriptionType || !payload.event) return null;
    return { messageType, subscriptionType, event: payload.event };
  }
  if (messageType === 'revocation') {
    const subscriptionType = payload.subscription && payload.subscription.type;
    return { messageType, subscriptionType: subscriptionType || null };
  }
  return { messageType }; // an unrecognized-but-well-formed message — ignored, not an error
}

// Maps a raw EventSub subscription type string back to this app's own
// short alert-rule event type key, so an incoming notification can be
// matched against the user's configured rules.
export function subscriptionTypeToAlertType(subscriptionType) {
  if (subscriptionType === 'channel.follow') return 'follow';
  if (subscriptionType === 'channel.subscribe') return 'subscribe';
  if (subscriptionType === 'channel.cheer') return 'cheer';
  if (subscriptionType === 'channel.raid') return 'raid';
  return null;
}

// A short, human on-screen label for the alert — event payload field names
// per Twitch's documented EventSub event shapes for each type.
export function extractAlertEventSummary(alertType, event) {
  if (alertType === 'follow') return `${event.user_name || event.user_login || 'Someone'} just followed!`;
  if (alertType === 'subscribe') return `${event.user_name || event.user_login || 'Someone'} just subscribed!`;
  if (alertType === 'cheer') return `${event.is_anonymous ? 'Someone' : (event.user_name || event.user_login || 'Someone')} cheered ${event.bits || '?'} bits!`;
  if (alertType === 'raid') return `${event.from_broadcaster_user_name || event.from_broadcaster_user_login || 'Someone'} raided with ${event.viewers ?? '?'} viewers!`;
  return '';
}
