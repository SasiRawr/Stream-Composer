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
// Legacy project import (reading an old v1 settings.js-based project folder
// into this app's project.json model) is a later addition to this file —
// see the v1.0.0 merge plan's Phase 4.
//
// Pure functions only (no DOM, no Tauri) — directly unit-testable in Node.
// ============================================================================

export function parseSlidesText(text) {
  return text.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.trim().split('\n').map((l) => l.trim());
    return { tag: lines[0] || '', text: lines.slice(1).join(' ') };
  }).filter((m) => m.tag || m.text);
}

export function slidesToPlaintext(slides) {
  return slides.map((s) => `${s.tag || ''}\n${s.text || ''}`).join('\n\n');
}
