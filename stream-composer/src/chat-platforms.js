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
];

export function visibleChatPlatforms(showAdultPlatforms) {
  return CHAT_PLATFORMS.filter((p) => !p.adult || showAdultPlatforms);
}
