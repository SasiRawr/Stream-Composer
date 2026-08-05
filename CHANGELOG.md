# Changelog

All notable changes to Stream Composer are documented here. See the
[Releases page](https://github.com/SasiRawr/Stream-Composer/releases) to
download any version.

## v0.2.0 — 2026-08-05 (Scene Composer)

### Added
- **Chroma Key** on `image` items — remove a green (or any color) screen.
  Click the preview to pick the exact key color, then adjust similarity,
  edge feather, and spill suppression with a live preview. Never
  overwrites the original file.

Popup Slide Editor unchanged in this release (still v0.1.0).

## v0.1.0 — 2026-08-05 (initial release)

### Added
- **Popup Slide Editor** — open a popup-slide project folder, edit
  slides, transition style, and timing through a form, and save changes
  straight back to disk. A real desktop app, not a webpage, so it can
  actually save in place.
- **Scene Composer** — compose a whole stream layout on a canvas sized to
  your real stream resolution. Drag, resize, and rotate items (a webcam
  positioning frame, images, popup-slide badges), then bake the
  arrangement into a single OBS Browser Source.
