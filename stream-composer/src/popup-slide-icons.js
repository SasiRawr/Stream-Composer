// ============================================================================
// POPUP-SLIDE PLATFORM ICONS — generic placeholder badges (colored circle +
// initials), NOT the real Twitch/YouTube/etc. logos. Redrawing trademarked
// logos isn't something this project does — see PROJECT_NOTES.md §3.6. If a
// real platform logo is wanted, use a custom image file pointed at an
// official asset downloaded from that platform's own site instead.
//
// Pure data + string-building only (no DOM, no Tauri) so this can be shared
// between the properties-panel UI (main.js) and the baked-output renderer
// (bake.js) without either depending on the other. Ported verbatim from the
// standalone Popup Slide Editor (app/src/main.js) as of the v1.0.0 merge.
// ============================================================================

export const PLATFORM_ICONS = {
  twitch:    { label: 'Twitch (placeholder)',    initials: 'TW', color: '#9146FF' },
  youtube:   { label: 'YouTube (placeholder)',   initials: 'YT', color: '#FF0000' },
  tiktok:    { label: 'TikTok (placeholder)',    initials: 'TT', color: '#111111' },
  kick:      { label: 'Kick (placeholder)',      initials: 'KI', color: '#53FC18' },
  trovo:     { label: 'Trovo (placeholder)',     initials: 'TR', color: '#1FCF6C' },
  x:         { label: 'X / Twitter (placeholder)', initials: 'X', color: '#000000' },
  discord:   { label: 'Discord (placeholder)',   initials: 'DC', color: '#5865F2' },
  steam:     { label: 'Steam (placeholder)',     initials: 'ST', color: '#1B2838' },
  instagram: { label: 'Instagram (placeholder)', initials: 'IG', color: '#C13584' },
  facebook:  { label: 'Facebook (placeholder)',  initials: 'FB', color: '#1877F2' },
};

export function platformIconSvg(key) {
  const p = PLATFORM_ICONS[key];
  if (!p) return '';
  return '<circle cx="12" cy="12" r="11" fill="' + p.color + '"/>' +
         '<text x="12" y="15.5" font-size="8" font-weight="700" text-anchor="middle" ' +
         'fill="#ffffff" font-family="Arial, sans-serif">' + p.initials + '</text>';
}

// Reverse-lookup: given an icon svg string already saved in a project (or a
// legacy settings.js), figure out which platform (if any) it matches, so
// re-opening shows the right dropdown selection instead of losing track of it.
export function findPlatformByIcon(iconSvg) {
  for (const key in PLATFORM_ICONS) {
    if (platformIconSvg(key) === iconSvg) return key;
  }
  return null;
}
