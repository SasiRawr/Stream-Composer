# Changelog

All notable changes to Stream Composer are documented here. See the
[Releases page](https://github.com/SasiRawr/Stream-Composer/releases) to
download any version.

## v1.2.0 — 2026-08-06 (pre-release, pending verification)

### Added
- **+ Chat + TTS Overlay** item — connects to your live chat (Twitch and
  Kick supported) and reads new messages aloud via free, fully-offline
  text-to-speech, shown as an on-screen feed. First networked feature
  in the app. YouTube/TikTok/Trovo/X were researched and deliberately
  not built yet — see ROADMAP.md.
- **Known gap**: Kick's connection needs a real Pusher app key that
  isn't available without a live browser session against kick.com —
  currently a placeholder in the code. Twitch works as-is.

## v1.1.0 — 2026-08-06 (pre-release, pending verification)

### Added
- **Stinger Builder…** — build a short animated transition clip for
  OBS's Stinger Transition feature. 4 built-in templates (Fade, Slide
  Through, Zoom Burst, Wipe), a live scrubbable preview, and two export
  modes: **Solid color** (recommended, always available — pairs with
  OBS's own built-in Chroma Key filter) and **Transparent**
  (experimental — real alpha-channel export, only offered if your
  system supports it). Doesn't need an open project.

## v1.0.0 — 2026-08-06 (pre-release, pending verification)

### Added (so far)
- Repo consolidation: `scene-composer/` renamed to `stream-composer/`,
  the surviving app going forward. `app/` (Popup Slide Editor) is being
  folded in and will be removed once the merge is fully verified.
- Merged Tauri identity: `productName: "Stream Composer"`, new
  identifier `com.thenerdybox.streamcomposer` (supersedes both
  `com.thenerdybox.popupslideeditor` and `com.thenerdybox.scenecomposer`
  — installing v1.0.0 will **not** upgrade either old app in place;
  uninstall both before installing).
- `preview_overlay` Tauri command ported over from the old Popup Slide
  Editor (cache-busted live preview in the OS browser).
- The `popup-slide` item type now supports per-slide icons (a platform
  placeholder badge, a custom image file, or none) — matching, and in
  the custom-icon case improving on, the standalone Popup Slide
  Editor's capability. Also new: a Plaintext content mode for quickly
  editing all slides as one block of text (no icons in that mode, same
  real limitation the old editor had).
- The popup-slide animation engine now has one source of truth
  (`popup-slide-engine.js`) instead of two duplicate implementations.
- **Import Legacy Project…** — brings an old `settings.js`-based popup-
  slide campaign into a new project.json project, without ever touching
  the original files. Auto-offered when opening a folder that turns out
  to be an old-style project instead of just erroring.
- **Overlay Asset Workflow improvements**: Bake now remembers the last
  folder it wrote to, so re-baking while iterating on a design doesn't
  re-prompt for a folder every time ("Bake to new folder…" is there when
  you actually want to change it). A "Copy OBS setup instructions" action
  appears after a successful bake. New **Preview…** button on popup-slide
  items previews just that item in your browser without doing a full
  bake first.
- **Starter Kit** — a "Starter Kit…" button offering 3 ready-made
  templates (Popup Badge; Gradient Border; Webcam Frame + Badge) as a
  starting point instead of a blank canvas.
- **Gradient fill for `frame` items** — a real feature, not just wizard
  content: any frame can use a two-color gradient fill (pick the colors
  and the angle) instead of a flat color.

### Still ahead before this ships
- A full human-testing + performance/stability pass — every feature
  above is built, unit-tested where the logic is pure, and verified to
  build/launch cleanly, but the actual click-through (Fabric canvas
  drag/resize/rotate, every new dialog, a real bake tested in OBS) has
  **not** been done by a human yet. This is the one remaining gate
  before v1.0.0 can be tagged — see ROADMAP.md.

## v0.9.0 — 2026-08-05 (Scene Composer)

### Added
- **Vignette** on `image` items — strength, radius, softness, and tint
  color controls with a live preview. Darkens (or tints) the image
  toward its edges.

Popup Slide Editor unchanged in this release (still v0.1.0).

## v0.8.0 — 2026-08-05 (Scene Composer)

### Added
- **Sharpen** on `image` items — amount and radius sliders with a live
  preview, using unsharp masking to boost local contrast and make edges
  read as crisper. The natural complement to Blur.

Popup Slide Editor unchanged in this release (still v0.1.0).

## v0.7.0 — 2026-08-05 (Scene Composer)

### Added
- **Flip & Rotate** on `image` items — four instant one-click actions:
  Flip Horizontal, Flip Vertical, Rotate 90° Clockwise, Rotate 90°
  Counter-Clockwise. No dialog needed — nothing to tune, so it applies
  immediately.

Popup Slide Editor unchanged in this release (still v0.1.0).

## v0.6.0 — 2026-08-05 (Scene Composer)

### Added
- **Blur** on `image` items — a radius slider with a live preview.
  Useful for softening an image, or for obscuring detail you don't want
  visible on stream. Handles transparency correctly (no dark fringing
  around transparent edges).

Popup Slide Editor unchanged in this release (still v0.1.0).

## v0.5.0 — 2026-08-05 (Scene Composer)

### Added
- **Outline** on `image` items — traces a solid-color border around the
  image's visible (non-transparent) content, with a thickness and color
  picker and a live preview. Works best on an image that already has a
  transparent background, like one you've just Chroma Keyed — pairs
  naturally to get a clean "sticker" cutout look.

Popup Slide Editor unchanged in this release (still v0.1.0).

## v0.4.0 — 2026-08-05 (Scene Composer)

### Added
- **Color Adjust** on `image` items — brightness, contrast, and saturation
  sliders with a live preview. Writes a new file rather than touching the
  original.

Popup Slide Editor unchanged in this release (still v0.1.0).

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
