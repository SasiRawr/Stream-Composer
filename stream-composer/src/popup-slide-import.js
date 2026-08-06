// ============================================================================
// POPUP-SLIDE TEXT CONVERSION + LEGACY IMPORT
// ============================================================================
// parseSlidesText/slidesToPlaintext are the two halves of the properties
// panel's "Plaintext" content mode (main.js) — plain "tag, then text, blank
// line between slides" text, converted to/from the canonical `slides` array.
// Plaintext mode never carries icons (matching the real limitation the
// standalone Popup Slide Editor already had), so slidesToPlaintext discards
// icon fields and parseSlidesText's callers always set iconMode: 'none'.
//
// evalConfig/legacyConfigToPopupSlideProps read an OLD v1 settings.js-based
// project (see v1-pop-up-slide/campaign-thenerdybox/settings.js for a real
// example) and map it onto this app's popup-slide props shape, for Legacy
// Project Import (main.js's importLegacyProject) — bringing an existing
// campaign into the unified project.json model without losing its content.
//
// Pure functions only (no DOM, no Tauri) — directly unit-testable in Node.
// ============================================================================

import { findPlatformByIcon } from './popup-slide-icons.js';

export function parseSlidesText(text) {
  return text.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.trim().split('\n').map((l) => l.trim());
    return { tag: lines[0] || '', text: lines.slice(1).join(' ') };
  }).filter((m) => m.tag || m.text);
}

export function slidesToPlaintext(slides) {
  return slides.map((s) => `${s.tag || ''}\n${s.text || ''}`).join('\n\n');
}

// settings.js defines `const CONFIG = {...}`. It's read as plain text (via
// Tauri's read_text_file), so this runs it through `new Function` to get
// the real CONFIG value back — the same trust level the old standalone
// Popup Slide Editor already had when it executed this same file as a
// literal <script> tag. This is always the user's own project file on
// their own disk, never anything fetched from a network.
export function evalConfig(text) {
  const factory = new Function(text + "\n;return (typeof CONFIG !== 'undefined') ? CONFIG : undefined;");
  return factory();
}

// Maps a legacy CONFIG object onto this app's popup-slide props shape.
// Doesn't touch the filesystem — any 'custom' slide's customAssetPath here
// is still the BARE filename from settings.js (e.g. "thumb-web.png");
// resolving that against the legacy project's folder into a real absolute
// path is main.js's job (it needs invoke('file_exists') to check).
export function legacyConfigToPopupSlideProps(CONFIG) {
  let rawMessages;
  let contentMode;
  if (CONFIG.messagesText && CONFIG.messagesText.trim()) {
    rawMessages = parseSlidesText(CONFIG.messagesText);
    contentMode = 'plaintext';
  } else {
    rawMessages = CONFIG.messages || [];
    contentMode = 'structured';
  }

  const slides = rawMessages.map((m) => {
    if (m.image) {
      return { tag: m.tag || '', text: m.text || '', iconMode: 'custom', customAssetPath: m.image };
    }
    if (m.icon) {
      const platformKey = findPlatformByIcon(m.icon);
      if (platformKey) return { tag: m.tag || '', text: m.text || '', iconMode: 'platform', platformKey };
      return { tag: m.tag || '', text: m.text || '', iconMode: 'keep', rawIcon: m.icon };
    }
    return { tag: m.tag || '', text: m.text || '', iconMode: 'none' };
  });

  return {
    contentMode,
    slides: slides.length ? slides : [{ tag: '', text: '', iconMode: 'none' }],
    transitionStyle: CONFIG.transitionStyle || 'fade',
    perSlideMs: (CONFIG.timing && CONFIG.timing.perMessageHold) || 2600,
    pauseMs: (CONFIG.timing && CONFIG.timing.slideOutPause) || 500,
    colors: CONFIG.colors || { void: '#0a0a12', violet: '#7c5cff', violetSoft: '#a594ff', ink: '#f2f1f9', mute: '#918eae' },
  };
}
