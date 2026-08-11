# Changelog

All notable changes to Stream Composer Suite are documented here. See the
[Releases page](https://github.com/SasiRawr/Stream-Composer/releases) to
download any version.

## v1.10.0 — 2026-08-11 (pre-release, pending verification)

### Added
- **PNGTuber overlay item** — a new canvas item type: pick an "idle"
  image and a "talking" image, and it swaps between them live based on
  your own microphone volume, the same mechanism free tools like
  Veadotube Mini use. Adjustable mic sensitivity and a hold-time setting
  so it doesn't flicker between images during brief pauses mid-sentence.
- Needs one-time microphone permission granted to the Browser Source in
  OBS (right-click the source → Interact → allow the mic prompt) — this
  is the first item type in the app that asks for a media permission,
  not just network access.

### Verification note
The mic-volume-detection script was tested for correct string generation
and syntax validity (33 automated tests total across the app, including
17 new for this item), but the actual live "does it correctly detect my
voice through OBS's Browser Source" behavior needs a human with a real
microphone — flagged in `WHAT_TO_TEST.md`, same as every other
live-behavior feature in this app.

## v1.9.1 — 2026-08-11 (pre-release, pending verification)

### Added
- **Chat + TTS Overlay: Chatterbox local voice option** — a fourth TTS
  provider, alongside the free browser voice, Amazon Polly, and Kokoro.
  Also fully offline, no key or relay. Runs a different local voice
  service than Kokoro (port 5758 vs. 5757), so both can run at the same
  time — switch between them in the Voice Source dropdown to compare
  directly. **Bigger download than Kokoro**: needs a full Python +
  PyTorch runtime (~1-3GB, downloaded on demand, not part of the
  installer itself), versus Kokoro's single small model file. Same
  Start/Stop, separate-process-that-survives-editor-close behavior as
  Kokoro.

### Verification note
Same discipline as Kokoro's v1.9.0 release: the actual voice-generation
engine was tested standalone before being wired in — a real pip install
and real CPU synthesis produced genuine audio (confirmed valid WAV
output). The in-app Download/Start/Stop button flow has not been
click-tested, same native-window limitation as every prior version.

## v1.9.0 — 2026-08-11 (pre-release, pending verification)

### Added
- **Chat + TTS Overlay: Kokoro local voice option** — a third TTS
  provider alongside the free browser voice and Amazon Polly, fully
  offline: no AWS key, no relay, no per-character or ongoing cost. Runs
  as a small local voice service (`kokoro-sidecar`) that Stream Composer
  Suite spawns on your own machine, talking to it over `127.0.0.1` —
  architecturally identical to how the Polly connector talks to AWS, just
  pointed at localhost. 29 English voices (American + British, several
  per gender). One-time ~110MB download (model + voices), not bundled in
  the installer itself, downloaded on first use from the properties
  panel.
- **The local voice service is a separate process from the editor app on
  purpose** — it does not close when you close Stream Composer Suite
  (so it keeps working while you're live in OBS with the editor closed),
  and does not start itself automatically. Start/Stop controls live in
  the Chat + TTS Overlay's properties panel.

### Verification note
The `kokoro-sidecar` binary was tested standalone and confirmed to
produce genuine synthesized audio (real 24kHz WAV output from real text,
not a stub) — including a real-world resilience check: on this
development machine it tried CUDA (unavailable), fell back to DirectML
(failed on this GPU/model combo), fell back to CPU, and succeeded
without crashing. The Rust backend commands (model download, sidecar
spawn/stop) compile cleanly and the full app builds and bundles the
sidecar correctly. **What has NOT been click-tested**: the actual
in-app Download → Start → speak-in-OBS flow, since driving this app's
native Tauri window isn't something any tool available here can do (the
same category of gap as v1.0.0's original drag/resize flow and the Kick
placeholder-key connector) — needs Harvey's real test.

## v1.8.0 — 2026-08-11 (pre-release, pending verification)

### Changed
- **Chat + TTS Overlay: platform picker redesigned as a dropdown** — with
  Twitch, Kick, and TikTok all listed as always-visible cards, the
  properties panel was getting crowded. Now a single "Chat platform"
  dropdown picks the active platform, showing only that platform's fields
  (channel name, API key if needed). A new "Using a Multi-Chat or
  Multi-Streaming?" checkbox reveals a second dropdown + fields for
  streamers simulcasting to more than one platform at once, so both feed
  into the same combined TTS/message feed.
- **Trovo listed, not built** — added to the platform dropdown as a
  disabled/greyed-out option with an explanation, rather than silently
  left out: Trovo ended live-streaming platform-wide on June 30, 2026,
  so there's no live chat left to connect to.

## v1.7.0 — 2026-08-11 (pre-release, pending verification)

### Added
- **Chat + TTS Overlay: TikTok Live chat support** — a third platform
  alongside Twitch and Kick. Connects directly to Euler Stream (a
  third-party signing service TikTok's own connection requires) with a
  bring-your-own API key — no backend/relay of ours involved, confirmed
  CORS-open. Real chat messages join the same feed/TTS pipeline as
  Twitch/Kick; join/member events get a short synthesized tone instead
  of being read aloud or shown as text (no leave-event tone — TikTok's
  event stream doesn't appear to expose one). Properties panel carries an
  explicit warning that TikTok is known to fingerprint/restrict
  automated-looking connections more aggressively than Twitch tolerates.
  **Verification note**: the connection mechanics are read directly from
  Euler's current docs; the exact message envelope shape could not be
  confirmed without a live API key and is handled defensively — this is
  the least-verified connector shipped so far, more than usual caution
  needed testing it.

## v1.6.0 — 2026-08-10 (pre-release, pending verification)

### Added
- **Chat + TTS Overlay: Amazon Polly voice option** — an opt-in, bring-your-
  own-AWS-key alternative to the default free browser/OS voice. Gets the
  exact named Polly voices (Joanna, Matthew, Ivy, Kendra, etc.) that
  StreamElements' free TTS panel uses under the hood — same voices,
  sourced directly from AWS instead of a third party. Requests are signed
  client-side with AWS Signature Version 4, built from scratch (no AWS
  SDK) so the baked overlay stays import-free. **Security note**: because
  this app has no backend, your AWS keys are embedded in plain text inside
  the exported scene.html — the properties panel shows this warning
  directly and recommends creating an IAM user scoped to only
  `polly:SynthesizeSpeech`, not root/admin credentials.

## v1.5.0 — 2026-08-10 (pre-release, pending verification)

### Added
- **+ Countdown Timer** item — set a target date/time, a label, and text
  to show once it hits zero. Ticks down live once a second in the baked
  output. Optionally fold the "days" segment into hours instead of
  showing it separately.

## v1.4.0 — 2026-08-10 (pre-release, pending verification)

### Added
- **+ Background Generator** — a new standalone tool (Topbar, works with
  no project open, same pattern as the Stinger Builder): generates and
  exports a static background image for your stream. Solid color, a
  linear or radial gradient, or a photo with a semi-transparent gradient
  overlaid on top ("ghost effect"). Exports a plain PNG, usable directly
  as an OBS Image Source.

## v1.3.0 — 2026-08-10 (pre-release, pending verification)

More requests from the v1.0-v1.2 testing pass — the ones that didn't
need Harvey's direct judgment call first. Full detail in ROADMAP.md.

### Added
- **Name scenes when baking** — the Bake dialog asks for a scene name
  the first time it picks a new output folder (or on "Bake to new
  folder…"), and writes `<name>.html` instead of a fixed `scene.html`.
  Repeat bakes into the same folder reuse the last name automatically.
- **Starter Kit is now multi-select** — pick one, several, or all
  templates and they merge into a single project, instead of picking
  exactly one.
- **Chat + TTS Overlay: voice selection** — a dropdown of your system's
  actual installed TTS voices, instead of always using the browser/OS
  default.
- **Chat + TTS Overlay: skip emote-only messages (Twitch)** — messages
  that are entirely emotes are now skipped from both TTS and the feed,
  the same way "!command" messages already are. Kick doesn't expose the
  metadata needed for this yet, so it's Twitch-only for now.

### Changed
- Starter Kit's "Gradient Border" template renamed to "Gradient
  Background" — same template, clearer name for what it actually is.

## v1.2.1 — 2026-08-10 (pre-release, pending verification)

Fixes from Harvey's first real hands-on testing pass across v1.0.0–v1.2.0.
Full detail in ROADMAP.md's "First real testing round" section.

### Fixed
- Image-edit tools (Chroma Key, Crop, Pad, Color Adjust, Outline, Blur,
  Sharpen, Vignette) no longer drop processed output next to the source
  file — writes to a hidden `.edited-images/` project folder instead.
- "Copy OBS setup instructions" button now actually copies, via a proper
  clipboard-manager-backed command instead of the unreliable raw Web API.
- Stinger export no longer throws `config.quality must be provided` —
  both export modes work again.
- Stinger Builder logo is now actually resizable — new "Logo size" slider
  (5–100% of frame height), decoupled from the export Resolution dropdown.

### Added
- Reset buttons on every image-edit dialog (previously only Color Adjust
  had one); Chroma Key and Outline also now reset their sliders on open
  instead of keeping stale values from the last edit.
- Windows `.exe` (NSIS) installer now shows a one-time notice when
  upgrading over an existing install. **Only covers `.exe`** — the `.msi`
  (WiX) installer's upgrade behavior is native Windows Installer and
  untouched by this fix.

## v1.2.0 — 2026-08-06 (pre-release, pending verification)

### Changed
- **Renamed to "Stream Composer Suite"** (from "Stream Composer") —
  clearer about what it actually is: a suite of integrated tools, not
  a single design tool. Applied before this version was ever promoted
  to a real release, so no one has to deal with a mid-flight rename —
  the technical installer identity is unchanged, so future updates
  still install in place as normal.

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
