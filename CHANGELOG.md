# Changelog

All notable changes to Stream Composer are documented here. See the
[Releases page](https://github.com/SasiRawr/Stream-Composer/releases) to
download any version.

## v0.3.0 — 2026-08-05 (Scene Composer)

### Added
- **Crop** on `image` items — drag a resizable selection box over the
  image and keep only what's inside it.
- **Pad** on `image` items — add space around the image (transparent by
  default, or a solid fill color).

Both write a new file rather than touching the original, and resize the
item's on-canvas box to match the result so nothing looks stretched.
Popup Slide Editor unchanged in this release (still v0.1.0).

### Also in this release (installer polish, applies to both apps)
- Installer icon replaced with the real TheNerdyBox logo, instead of the
  default Tauri scaffold icon.
- Confirmed installing a newer version now correctly replaces an older
  one already on your machine, instead of installing side-by-side.

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
