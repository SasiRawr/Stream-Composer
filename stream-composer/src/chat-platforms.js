// ============================================================================
// CHAT PLATFORM REGISTRY — the list of platforms the chat+TTS overlay item
// can connect to. Deliberately small right now (Twitch + Kick — see
// chat-tts-engine.js's header for why YouTube/TikTok/Trovo/X aren't here),
// but structured so more entries can be added later without a restructure.
//
// `adult` marks platforms that should stay hidden unless the item's own
// `showAdultPlatforms` prop is on — this is ONLY the visibility mechanism;
// no adult-platform connector exists yet, this just makes sure adding one
// later doesn't need new plumbing. Badge visuals reuse
// popup-slide-icons.js's existing PLATFORM_ICONS/platformIconSvg rather than
// duplicating icon data — call platformIconSvg(key) directly wherever a
// badge is drawn.
//
// Pure data — no DOM/Tauri — directly unit-testable.
// ============================================================================

export const CHAT_PLATFORMS = [
  { key: 'twitch', label: 'Twitch', adult: false },
  { key: 'kick', label: 'Kick', adult: false },
  // TikTok needs a bring-your-own Euler Stream API key on top of the usual
  // channel name - the signing service TikTok's own connection requires.
  // See chat-tts-engine.js's header for why (no client-computable signing,
  // and no backend of ours involved - CORS on Euler's API is confirmed
  // open, so this connects directly from the baked overlay).
  { key: 'tiktok', label: 'TikTok', adult: false, needsApiKey: true },
  // Listed (not hidden) so it's clear this was considered, not forgotten -
  // Trovo shut down live-streaming platform-wide 2026-06-30, so there is
  // nothing left to connect to. `disabled` + `disabledReason` let the UI
  // show it greyed out with an explanation instead of silently omitting it.
  { key: 'trovo', label: 'Trovo', adult: false, disabled: true, disabledReason: 'Trovo ended live-streaming platform-wide on June 30, 2026 - there is no live chat left to connect to.' },
];

export function visibleChatPlatforms(showAdultPlatforms) {
  return CHAT_PLATFORMS.filter((p) => !p.adult || showAdultPlatforms);
}

// ============================================================================
// PLATFORM PICKER SLOT LOGIC — pure, Node-testable rules for the properties
// panel's primary/secondary dropdown picker (main.js's
// renderChatOverlayProperties). Kept separate from DOM rendering so the
// actual selection rules (what happens when you switch platform X while Y
// is active, what happens toggling multi-chat off) are unit-tested rather
// than only eyeballed in a browser — the same discipline this project uses
// everywhere a real choice exists between DOM code and pure logic.
//
// `props` here is a chat-overlay item's props object: { platforms: [...],
// multiChatEnabled, showAdultPlatforms, ... }. These functions mutate
// props.platforms entries in place (matching how the rest of this item
// type's props are edited) and return nothing.
// ============================================================================

function entryFor(props, key) {
  let entry = props.platforms.find((e) => e.key === key);
  if (!entry) {
    entry = { key, enabled: false, channelName: '', apiKey: '' };
    props.platforms.push(entry);
  }
  return entry;
}

// Which platform keys are currently "active" (enabled), in CHAT_PLATFORMS
// order — never includes a disabled (e.g. Trovo) or hidden-adult platform,
// even if its `enabled` flag is somehow stale/true from old data.
export function activePlatformKeys(props) {
  return CHAT_PLATFORMS
    .filter((pl) => !pl.disabled && (!pl.adult || props.showAdultPlatforms))
    .filter((pl) => entryFor(props, pl.key).enabled)
    .map((pl) => pl.key);
}

// The primary dropdown always shows a real selection - call this before
// rendering so a freshly-created (or freshly-loaded-old) item defaults to
// something sensible instead of showing no selection at all.
export function ensurePrimarySelected(props) {
  const [primaryKey] = activePlatformKeys(props);
  if (!primaryKey) entryFor(props, CHAT_PLATFORMS.find((pl) => !pl.disabled).key).enabled = true;
}

// Switching the primary platform preserves a distinct secondary selection
// (if one exists) - unless the newly-chosen primary key WAS the secondary,
// in which case the secondary slot is cleared (a platform can't be both).
export function selectPrimaryPlatform(props, newKey) {
  const [, oldSecondary] = activePlatformKeys(props);
  activePlatformKeys(props).forEach((k) => { entryFor(props, k).enabled = false; });
  entryFor(props, newKey).enabled = true;
  if (oldSecondary && oldSecondary !== newKey) entryFor(props, oldSecondary).enabled = true;
}

// newKeyOrEmpty === '' means "the Choose a platform… placeholder" - clears
// the secondary slot without activating anything.
export function selectSecondaryPlatform(props, newKeyOrEmpty) {
  const [, oldSecondary] = activePlatformKeys(props);
  if (oldSecondary) entryFor(props, oldSecondary).enabled = false;
  if (newKeyOrEmpty) entryFor(props, newKeyOrEmpty).enabled = true;
}

// Turning multi-chat off disconnects whatever was in the secondary slot
// rather than leaving it silently enabled but hidden from the UI.
export function setMultiChatEnabled(props, enabled) {
  props.multiChatEnabled = enabled;
  if (!enabled) {
    const [, secondaryKey] = activePlatformKeys(props);
    if (secondaryKey) entryFor(props, secondaryKey).enabled = false;
  }
}
