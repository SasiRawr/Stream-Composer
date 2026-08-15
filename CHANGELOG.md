# Changelog

All notable changes to Stream Composer Suite are documented here. See the
[Releases page](https://github.com/SasiRawr/Stream-Composer/releases) to
download any version.

## v1.16.1 — 2026-08-15 (pre-release, pending verification)

Installer-only patch: real TheNerdyBox branding in the Windows installer
itself, not just the app.

### Added
- **Branded installer.** A custom-built header image and welcome/finish
  sidebar image (both generated from the actual TheNerdyBox logo)
  replace NSIS's generic stock graphics throughout the setup wizard.
- **Install location now nests under a publisher folder** —
  `C:\Program Files\TheNerdyBox\Stream Composer Suite\` instead of
  installing directly into Program Files' root. Leaves room for any
  future TheNerdyBox apps to sit alongside it.
- **Start Menu folder now defaults to "TheNerdyBox"** instead of the
  product name — still user-editable on the Start Menu page, same as
  before.
- **New "Check us out on the web" checkbox** on the finish page,
  checked by default. If still checked when you click Finish, it opens
  https://thenerdybox.com in your default browser.

### How this was built
NSIS's Modern UI 2 only supports two built-in finish-page checkboxes,
and both were already spoken for (Launch app, Create desktop shortcut)
— the website checkbox is a genuinely custom third control added via
the same nsDialogs technique this installer's uninstaller page already
used for its own custom checkbox, not a new pattern. The underlying
template is Tauri's own default NSIS installer (pulled from the exact
tauri-cli v2.11.4 tag this project uses, not assumed), with only the
install-path and finish-page pieces changed — everything else, including
the existing pre-install upgrade-warning hook, is untouched.

### Verification note
The custom NSIS template compiles clean (no warnings on the new bitmap
assets), and the install-path/Start-Menu-folder config values are
Tauri's own documented mechanism, not custom scripting. The one thing
that couldn't be verified from here: the actual on-screen look of the
new images and the exact vertical position of the new checkbox relative
to the existing two — flagged clearly for a real look during testing.

## v1.16.0 — 2026-08-14 (pre-release, pending verification)

Real, requested feature: PNGTuber's talking-animation can now react to a
live OBS audio input instead of the browser's own microphone capture —
so the sensitivity slider works like Discord's voice-activation
setting, without needing a re-bake and re-push to OBS every time it's
adjusted.

### Added
- **PNGTuber: "React to an OBS audio source instead of microphone."**
  New toggle in the properties panel. When on, pick any OBS audio
  input (mic, Discord, game audio) from a live dropdown — auto-selects
  the obvious mic-named input if there's exactly one. A new local relay
  connects to OBS (reusing the same connection settings Push to OBS
  already saves) and streams that input's live volume to the baked
  overlay. Changing the sensitivity slider afterward takes effect
  immediately, live — no re-bake, no re-push.
- The default microphone mode (`getUserMedia`, unchanged since v1.10.0)
  is untouched and still has zero dependency on the desktop app once
  baked — this new mode is purely additive and opt-in.

### Caught and fixed before shipping (worth being honest about)
A review of the first build found the feature's core promise didn't
actually work as built: the identifier baked into the overlay never
matched the real project file, so the "live, no re-bake" mechanism
silently fell back to a stale snapshot every time, and the sensitivity
threshold itself was never wired into the live data at all — only the
raw OBS audio level was ever live. Both are fixed: the overlay now
carries the project item's real id, and the relay reads the live
threshold/hold-time straight from the currently open project on every
poll, matched against a live volume-meter subscription to OBS's own
input (a linear amplitude reading, not the meter-in-dB it was first
assumed to be — also caught before shipping).

The same review found a real security gap: the relay was trusting a
file path supplied by the request itself, with no authentication —
meaning any local web page open at the same time as Stream Composer
Suite, not just the OBS overlay, could have made the app open an
arbitrary file, or query whether a chosen OBS input currently has
audio. Fixed — the relay now tracks the currently open project itself
(mirrored from the app's own state) instead of trusting anything the
request claims.

### Known limitation, documented honestly
This relay's OBS connection lives entirely on localhost with no
authentication (same posture as the Kokoro/Chatterbox/Now Playing
sidecars already shipped) — any other local web content running at the
same time could still query whether your selected OBS input currently
has audio. A real auth layer for these local sidecars is out of scope
for this release.

### Verification note
Full test suite passes (25/25 files), cold build succeeds, the whole
data path was traced against `obws`'s actual source (not assumed) and
verified by an independent review pass. The live OBS connection and
the actual feel of OBS's peak-based volume reading versus the existing
mic mode's RMS averaging genuinely need a hands-on test with real OBS
running — flagged clearly in this version's testing checklist.

## v1.15.0 — 2026-08-14 (pre-release, pending verification)

Two fast-follows, orchestrated across a team of specialist agents in one
pass: the chat-bubble/star-burst layer originally scoped out of Chat Pet
Roster v1, and a real fix for the PNGTuber mic-sensitivity pain Harvey
flagged in v1.12.0.

### Added
- **Chat Pet Roster: chat bubbles + star-burst.** When a chatter's pet
  reacts, it now shows a speech bubble with their actual message (capped
  at 80 characters) above the pet, plus a brief sparkle burst. Both are
  togglable per-item, with a configurable bubble display duration.
  Twitch and Kick's connectors now extract real message text (previously
  only username), not just a fresh feature — a genuine capability
  addition to both platform connectors.
- **PNGTuber: live mic meter + Auto-calibrate.** The properties panel now
  has a "Test mic" button showing your real mic level against the
  current threshold live, and an "Auto-calibrate" button that samples
  ~3s of quiet plus ~3s of normal talking and sets the threshold for
  you — no more guessing at a raw 0-100 number.

### Investigated and deliberately not built
- **Tying PNGTuber's talking-trigger to OBS's own voice activation**
  (the ask behind the mic-calibration work) turned out to be technically
  impossible as asked — obs-websocket's protocol has no event or request
  that reports whether an audio input's Noise Gate/VAD is currently
  "open." Confirmed against the full official protocol event list, not
  assumed. A different, genuinely separate feature — reacting to an
  arbitrary OBS audio source's volume (e.g. Discord or game audio)
  instead of the microphone — is real and buildable, but shelved as
  speculative until there's an actual request for it; it would trade
  this feature's current zero-dependency reliability (works standalone
  once baked, no desktop app required) for one that needs Stream
  Composer running and connected to OBS the whole time you're live.

### Fixed (caught in review before shipping)
- A race condition where clicking "Test mic"/"Auto-calibrate" and then
  switching canvas items before the OS permission prompt resolved could
  leave a live microphone stream running with nothing left to stop it.
- Chat bubbles could render clipped or invisible when a pet wandered
  near the top or side edge of its stage (the stage clips overflow) —
  pets now keep clearance from the edges so their bubble always has
  room to show.
- Minor: an evicted pet's pending bubble-hide timer is now cleared
  instead of firing harmlessly later; long messages with emoji no
  longer risk truncating mid-character.

## v1.14.0 — 2026-08-13 (pre-release, pending verification)

**OBS WebSocket automation** — the last of the original v1.x.0 series'
five items — plus a real fix for the Chatterbox download bug Harvey
hit in his own testing.

### Fixed
- **Chatterbox TTS download** no longer fails with "The system cannot
  find the file specified (os error 2)." The old code shelled out to a
  `tar` executable to extract the downloaded Python runtime, which
  wasn't reliably found on PATH from this app's spawned-process
  environment. Now extracted with a pure-Rust archive library instead
  — no external program dependency at all. Also fixed a second,
  previously-unreached bug in the same step: the extraction was
  stripping a path component that shouldn't have been stripped, which
  would have put `python.exe` in the wrong folder even if `tar` itself
  had worked. Verified against the real downloaded archive, not just
  compiled.

### Added
- **Push to OBS** — a new button next to "Copy OBS setup instructions"
  after baking. Connects directly to a running OBS instance (via
  obs-websocket, built into OBS 28+) and adds or updates a Browser
  Source for you, in whichever scene you pick. First push creates the
  source; every push after that just updates it in place.
- Connection settings (host/port/password) are saved after the first
  successful connection, so you're not re-entering them every time.

### Known limitation, documented honestly
obs-websocket has no dedicated "force hard refresh" call for a Browser
Source — Push to OBS updates its settings/URL, which OBS usually
reloads on its own, but it isn't a hard guarantee. If a push doesn't
visibly update, toggling the source's visibility once will.

### Verification note
Couldn't be tested against a real running OBS instance during this
build (none was running on this machine) — the request-building/API
logic was verified against `obws`'s actual source code, and the app
itself builds and launches cleanly, but the live OBS connection genuinely
needs a human with OBS actually open, more than usual for this project.

## v1.13.2 — 2026-08-13 (pre-release, pending verification)

A real fix, caught by Harvey immediately after v1.13.1 shipped: Now
Playing was trusting Windows' own "current session" pick, which isn't
tied to any specific app — a paused (or even playing) browser tab could
outrank the actual music app.

### Changed
- **Now Playing: added an "App to show" filter.** Defaults to
  "Spotify." The overlay now only shows a track from a session whose
  app name matches this filter, instead of trusting Windows' single
  "current" guess — so a Twitch stream or any other browser tab playing
  in the background can never take over the overlay from your actual
  music app. Leave it blank to fall back to "whatever's actually
  playing." A new "See what's playing right now…" button in the
  Properties panel lists every app Windows currently sees, so it's
  never a guessing game which name to type.

## v1.13.1 — 2026-08-13 (pre-release, pending verification)

A quick patch: a **Now Playing** overlay item, added same-day as an
urgent follow-up.

### Added
- **Now Playing** — shows whatever track is currently playing on your
  PC: Spotify, a YouTube Music browser tab, Apple Music, anything.
  No login, API key, or account linking needed — it reads straight from
  Windows' own "now playing" system (the same thing that runs the volume
  flyout's mini-player), so one integration covers every player instead
  of a separate one per streaming service. Automatically hides itself
  when nothing's playing. Only updates while Stream Composer Suite
  itself is running on the PC (can be minimized) — same requirement as
  the local Kokoro/Chatterbox TTS engines.

## v1.13.0 — 2026-08-12 (pre-release, pending verification)

A new item type: **Chat Pet Roster** — one pet per active chatter,
rather than a single shared pet reacting to everyone.

### Added
- **Chat Pet Roster** — a roster of small pets, one per person currently
  chatting. Each pet free-roams (wanders and bounces off the edges) inside
  the item's box, and bounces specifically when *its own* chatter sends a
  message — not on every message in the channel. The roster is capped
  (default 6, adjustable): once full, a new chatter's pet takes the spot
  of whoever's been quietest the longest. All pets share one image for
  now. Twitch + Kick, same platform set as the existing Viewer Pet.
- Distinct from **Viewer Pet** (unchanged) — that's still the simple
  single-pet-reacts-to-any-message version; Chat Pet Roster is the
  multi-pet, per-chatter version, kept as its own item type so neither
  one has to compromise on what it does well.

### Verification note
Covered by automated tests on the string-generation logic (roster/
eviction bookkeeping, the free-roam wander math, the Twitch/Kick
username-extraction connectors). The actual live behaviors — pets
spawning per real chatter, wandering looking natural, evicting the right
one when the roster's full, bouncing on the correct pet — need a human
watching a real chat, same as every other live-chat-driven feature in
this app.

## v1.12.0 — 2026-08-11 (pre-release, pending verification)

Expands the PNGTuber overlay item from its original single behavior
(image swap) to four selectable animation styles — the "basic PNGTuber
app" feature set (bounce/bob, brightness pulse, mouth-flap cutout) that
most other free PNGTuber tools already offer, and a real step toward
full VTuber-style rigging later.

### Added
- **PNGTuber: 3 new animation styles**, selectable per item alongside
  the original behavior (now called "Image Swap"):
  - **Bounce / Bob** — a single character image that bobs up and down on
    a smooth, continuous loop for as long as you're talking.
  - **Brightness Pulse** — a single character image that lightens while
    you talk and dims back down while you're quiet.
  - **Mouth Flap** — a static body image with a separate mouth layer on
    top, alternating between an open and closed mouth image on a fixed
    interval while you're talking. Mouth position/size and flap speed
    are all adjustable in the Properties panel.
- All four styles share the exact same live-mic-volume detection core
  as before (RMS + adjustable sensitivity + hold time) — only the
  visual reaction differs. Switching styles later never loses an
  image you've already picked for a different style.

### Verification note
Covered by automated tests across the string-generation logic (which
style produces which DOM/CSS/script output, all 4 styles individually)
— the actual live behaviors (does the bounce look smooth, is the mouth
flap believable, does brightness read as "talking" at a glance) need a
human to actually watch it react to a real voice, same as every other
mic/chat-driven feature in this app.

## v1.11.0 — 2026-08-11 (pre-release, pending verification)

This closes out the original v1.x.0 series' three long-open items —
asset library, template personalization, and viewer pets — bundled into
one release since all three are small and closely related in scope.

### Added
- **Asset Library** — save any canvas item's settings (not its position)
  to a small personal library, then drop a copy into any future project.
  A new "Save to Library…" button appears in the Properties panel
  whenever an item is selected; saved items show up in a new "Library"
  panel with Insert/Remove actions. Stored locally on your own machine,
  not tied to any one project.
- **Starter Kit personalization** — an optional step when creating a
  Starter Kit project: pick your own accent color (replaces the default
  violet across every gradient/frame/badge in the template) and replace
  the placeholder "YourSite.com" / "Follow @yourhandle" text, all before
  the project is even created. No extra editing needed afterward.
- **Viewer Pet overlay item** — a character image that bounces once for
  every real chat message on a connected platform (Twitch or Kick for
  now — same platform set Chat + TTS Overlay shipped with first, TikTok
  can follow later). This is the chat-message-triggered version, not the
  follow/sub/bits-triggered version — that one needs Twitch EventSub/
  OAuth infrastructure this app doesn't have yet, a different, bigger
  feature for later.

### Verification note
All three features are covered by automated tests (34 test files total
now), but the live behaviors — real chat connections triggering the
Viewer Pet's bounce, the Library persisting correctly across app
restarts, personalization actually producing a correctly re-colored
project — need a human to click through, same as every other
live-behavior feature in this app.

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
