# Roadmap

The strategic plan for Stream Composer Suite, agreed 2026-08-05. This is a
living document — update it as scope shifts, don't just leave it stale
once a milestone ships.

## Versioning

Standard semver, with a specific meaning attached to each position for
this project:

- **`vX.0.0`** — combined-suite / major releases. A new major version
  means "everything got merged/relaunched together," not just "a bigger
  feature."
- **`v0.X.0`** — incremental releases: a new standalone module or
  feature added to whichever app it lives in.
- **`v0.0.X`** — bug fixes and patches only, no new capability.

If a v1.x.0 module needs more patch iterations than a single digit
comfortably covers, letter suffixes are fine (`v1.1.1-a`, `-b`, ...) —
not expected to actually happen, just the agreed fallback if it does.

**Real constraint found 2026-08-11**: letter-suffix versions are fine
for git tags and GitHub release names, but **not valid as the actual
`tauri.conf.json`/`package.json` version field once an MSI bundle is
involved** — Windows Installer requires pre-release identifiers to be
numeric-only (confirmed via a real build failure:
`optional pre-release identifier in app version must be numeric-only...
for msi target`). A numeric pre-release (`1.9.0-2`) technically passes
MSI but sorts *before* the base version in semver — backwards for
something shipping on top of it. When this comes up, ship a normal
patch bump instead (`v1.9.1`, not `v1.9.0-b`) — same intent, correct
ordering, no fighting the platform.

## Release process (agreed 2026-08-06)

Every version gets built, tested (automated), committed, and pushed to
`main` as soon as it's ready — Harvey can grab and try any pushed build
at any time via the repo's `Tests/` folder (one subfolder per thing
being tested, always at a known path). **A version is never published
as a full GitHub Release until Harvey has actually clicked through it.**
Untested-but-ready versions instead get cut as a GitHub **pre-release**
(`gh release create <tag> --prerelease`) — same real version number,
same installers, just flagged as unverified. Once Harvey confirms it's
clean, the same release gets promoted in place
(`gh release edit <tag> --prerelease=false`) — no re-tagging, no
rebuild. Old versions never disappear either way: every tagged release
stays permanently on the GitHub Releases page, and a second copy of
every version's installers lives in the local
`Documents\Claude Code\Projects\Modules\v<version>\` archive —
"installs upgrade in place going forward" and "nothing old is ever
gone" are both true at once, no tension between them.

## Where things stand (2026-08-06)

- `app/` ("Popup Slide Editor") — v0.1.0, human-tested, stable. Being
  retired into `stream-composer/` as part of the v1.0.0 merge, currently
  in progress (see below) — kept around as the tested fallback until
  that merge is verified.
- `stream-composer/` (renamed from `scene-composer/`/"Scene Composer" as
  the first step of the v1.0.0 merge) — 9 image-editing features shipped
  (Chroma Key, Crop, Pad, Color Adjust, Outline, Blur, Flip/Rotate,
  Sharpen, Vignette). Core drag/resize/bake flow still not human-tested
  — flagged as an open risk being carried into the merge, not resolved
  by it. The two standalone modules planned for v0.8.0/v0.9.0 are both
  done — v1.0.0 (see below) is now in progress.
- **v1.0.0 merge status:** every buildable phase is done — shell
  consolidation, `popup-slide` capability-gap closing (per-slide icons,
  plaintext mode, engine reconciliation into one source of truth),
  legacy project import, Overlay Asset Workflow improvements (remembered
  bake folder, copy-instructions action, single-item preview), and the
  Starter Kit Wizard (3 templates + gradient fill for frames) are all
  built, unit-tested where the logic is pure, and verified to compile
  and launch cleanly. Published as a **GitHub pre-release**
  (https://github.com/SasiRawr/Stream-Composer/releases/tag/v1.0.0) —
  real v1.0.0 content, version-bumped for real, but flagged pre-release
  since **the human-testing + performance/stability pass hasn't
  happened yet**. A full first-time-user walkthrough/checklist is
  staged for Harvey in the repo's `Tests/v1.0.0-merge/` folder
  (`FIRST_STREAM_WALKTHROUGH.md`) — none of it can be done without a
  human at the keyboard (no GUI-automation tool covers this app's
  native window). Once he confirms it's clean: `gh release edit v1.0.0
  --prerelease=false` promotes the same release, no rebuild/re-tag
  needed — see the pre-release workflow this project now uses for every
  future version too.
- Two apps, two separate version numbers — this ends once v1.0.0 ships
  (see below).
- **v1.1.0 (Stinger Builder) is already built on top of v1.0.0**, per
  Harvey's explicit call to keep building/committing while v1.0.0's
  testing pass is pending rather than blocking on it — same "build now,
  release later" discipline, not stacking untested work on faith. Also
  published as a GitHub pre-release
  (https://github.com/SasiRawr/Stream-Composer/releases/tag/v1.1.0),
  staged for testing in `Tests/v1.1.0-stinger-builder/`. First item off
  the v1.x.0 list below — see that section for what it is and why a
  solid-key-color export mode is the reliable default, with true alpha
  transparency offered only as an experimental option on top.
- **v1.2.0 (unified chat + TTS overlay, Twitch + Kick) is also already
  built**, same discipline, on top of the still-unverified v1.1.0.
  Published as a GitHub pre-release
  (https://github.com/SasiRawr/Stream-Composer/releases/tag/v1.2.0),
  staged for testing in `Tests/v1.2.0-chat-tts/`. Second item off the
  v1.x.0 list below. **Known gap**: Kick's connector needs a real
  Pusher app key that isn't available without a live browser session
  against kick.com — currently a placeholder (`KICK_PUSHER_APP_KEY` in
  `chat-tts-engine.js`), not a guessed value presented as fact. Twitch
  should work as-is once tested. This is the riskiest-to-verify feature
  shipped so far (the first one making real network connections) — see
  the v1.2.0 plan for the full verification-honesty note.

## First real testing round: v1.0.0–v1.2.0 (2026-08-06)

Harvey's first hands-on pass across all three pending pre-releases, notes
in `Builds\Testing\Testing Notes\v1.0,v1.1,v1.2 test notes.txt`. Overall
verdict: TTS "WORKS PERFECTLY", 10+ minutes of live chat connection with
no disconnects, "we are in an absolutely phenomenal place for this
project" — the issues below are refinements on a working foundation, not
signs of a shaky one.

**Real bugs found and fixed same-day:**
- Every image-edit tool (Chroma Key, Crop, Pad, Color Adjust, Outline,
  Blur, Sharpen, Vignette) was writing its processed output right next to
  the original source file — silently cluttering whatever folder the
  user picked the image from. Now writes to a hidden `.edited-images/`
  folder inside the project, same non-pollution pattern `.preview/`
  already used.
- "Copy OBS setup instructions" used the raw `navigator.clipboard` Web
  API, which isn't reliably permitted inside a Tauri/WebView2 window —
  silently did nothing. Now goes through a proper `tauri-plugin-
  clipboard-manager`-backed command, same "small explicit command"
  pattern every other Rust-side operation in this app already uses.
- Stinger export threw `TypeError: config.quality must be provided` for
  both export modes — Mediabunny's `CanvasSource` config needs either
  `quality` or `bitrate` and neither was ever set. Fixed with `quality:
  new Quality('high')`.
- Stinger Builder had no way to actually resize the logo — the
  "Resolution" dropdown only controls the exported video's pixel
  dimensions (and the preview is capped at 360px tall via CSS regardless,
  so changing it visibly did nothing), while the logo itself was always
  auto-sized to a fixed 35%-of-frame-height with no control over that
  ratio. Added a real "Logo size" slider (5–100% of frame height).

**Minor issues, also fixed same-day:**
- No Reset control existed on any image-edit dialog except Color Adjust.
  Added matching Reset buttons (and reset-on-open, for the two dialogs —
  Chroma Key and Outline — that previously kept stale slider values
  across re-opens) to Chroma Key, Outline, Blur, Sharpen, and Vignette.
- The Windows `.exe` (NSIS) installer gave no indication it was
  overwriting an existing install. Added an `installerHooks` pre-install
  check (`src-tauri/windows/hooks.nsh`) that shows a one-time message
  when an existing install is detected, before any files are touched.
  Note: the app doesn't actually persist any user preferences yet (no
  settings/appdata store exists) — the message says projects/files
  outside the install folder are unaffected, not "preferences are kept,"
  since that wouldn't be true yet. **Only covers the `.exe` installer** —
  the `.msi` (WiX) installer's upgrade behavior is native Windows
  Installer behavior, untouched, and Harvey's original report doesn't
  specify which installer he used, so this needs a re-test on both.
- Added an in-panel note on the Chat + TTS Overlay item that changed
  settings require an OBS Browser Source cache refresh after re-baking
  (right-click → Properties → "Refresh cache of current page") — Harvey
  had to discover this by trial and error.

Shipped as **v1.2.1** (2026-08-10): version bumped, cold `tauri build`
clean, launch-then-kill smoke test passed, pushed and tagged, published
as a GitHub pre-release, staged at `Builds\Testing\
Stream-Composer-v1.2.1-fixes\`. None of the above has been re-verified
by a real install/click-through yet, though — same standing rule as
everything else in this project: automated tests + a clean build only
prove it compiles and the pure logic is correct, not that the installer
dialog reads right or the stinger logo actually looks good at 35% by
default. Needs Harvey's next testing pass before promotion to a real
release.

**Suggestions raised — built in v1.3.0 (2026-08-10):**
- **Name scenes when baking** — the Bake dialog now asks for a scene
  name the first time it picks a new output folder (or on "Bake to new
  folder…"), and writes `<name>.html` instead of a hardcoded
  `scene.html`. Repeat bakes into the same folder reuse the last name
  automatically, matching how folder reuse already worked — no extra
  dialog on the fast path.
- **Starter Kit**: renamed "Gradient Border" → "Gradient Background",
  and the dialog is now a checklist instead of a single-pick dropdown —
  select one, several, or all, and they merge into a single project
  (`mergeStarterProjects()` in `starter-kit/manifest.js`, using the
  largest of the selected templates' own canvas sizes).
- **Chat + TTS Overlay**: voice selection — a dropdown populated from
  the editor's own real `speechSynthesis.getVoices()` list (the editor
  window is Chromium/WebView2 too, so no guessing at voice names was
  needed). Emote-only message filtering for **Twitch only** — parses
  the `emotes` IRC tag to detect when a message is entirely emotes and
  skips it from both TTS and the feed, the same way "skip messages
  starting with !" already works. Kick has no known equivalent metadata
  to build this against yet, so it stays Twitch-only for now.

**Suggestions raised, not yet built — backlog for future versions:**
- **Global eyedropper** — a color-pick tool that can sample any pixel on
  the screen, not just within a dialog's own preview canvas (raised
  against Chroma Key specifically, but generally useful). Needs research
  into what's available cross-platform inside a Tauri/WebView2 window —
  not a trivial add, likely its own small scoping pass.
- ~~**Starter Kit "ghost effect"**~~ — **built in v1.4.0**, but as the new
  standalone **Background Generator** tool's "Photo + gradient overlay"
  mode, not as a Starter Kit template — a static-image export tool fits
  the actual ask ("a complete... editor or static image generator type
  plugin") better than a canvas-item mode would have. See v1.4.0 section
  below.
- **Stinger Builder, full editor controls** — beyond the logo-size slider
  already shipped in v1.2.1: rotation, movement/position, and general
  placement controls inside the editor (not just centered/animated
  per-template), so a user can actually art-direct the result instead of
  picking from fixed templates. Also raised: importing a video file as
  the stinger's source instead of a static image — either one with a
  pre-existing green-key area, or with an eyedropper-style "mask this
  color" tool applied to video frames. Also: pause/play and mute
  controls on the stinger preview player (raised specifically so a
  repeating 3–5 second audio loop doesn't become "maddening" during
  editing).
- **Chat + TTS Overlay downloadable voice models** — a much bigger ask,
  **needs Harvey directly, not something to build blind**:
  downloadable/curated TTS voice models beyond what Windows ships (he's
  specifically heard character-style voices — a C-3PO-style voice, an
  "airy kid" voice, a raspy-voiced man — on sites like Tikfinity, and has
  logins that could help identify and source the actual voice models).
- **TikTok as a chat platform** — already a known, explicitly-deferred
  gap from the original v1.2.0 plan (needs a Node-only signing-service
  library that doesn't fit this app's no-backend runtime); re-flagged
  again by testing, and again by the 2026-08-10 ReStream idea-board scan
  below (single most-voted item across all four boards) — the technical
  blocker hasn't moved, but the repeated demand signal is worth a real
  conversation with Harvey rather than staying silently deferred forever.
  **Sharper pain point from Harvey directly, 2026-08-10 night**: this
  isn't just "TikTok support would be nice" — his actual, current problem
  is that TikTok's own live chat window is unreliable for streaming off
  of: messages/TTS inconsistently fail to display or speak at all, AND
  TikTok's chat feed interleaves join/leave events with real chat messages
  in the same stream, so a viewer's message can get buried and missed
  before they leave. This changes the shape of the eventual feature, not
  just its priority — even once a TikTok connector exists, it needs
  explicit join/leave-event filtering (a first for this app; Twitch/Kick's
  connectors only ever see real chat messages, no membership-event noise
  to filter), not just "connect and show everything." Still blocked on
  the same technical wall as before (needs a signing-service key this
  app's no-backend architecture doesn't have a clean answer for) — worth
  a real feasibility re-check specifically for the join/leave-filtering
  requirement once that wall is addressed, not assumed solved by copying
  the Twitch/Kick connector pattern as-is.

  **Feasibility re-check, same night, better news than expected.** The
  maintained community connector no longer tries to compute TikTok's
  request signature itself — it delegates entirely to a third-party
  signing service, Euler Stream (eulerstream.com), which exposes a plain
  REST API: one HTTP call in, a signed WebSocket URL out. The actual chat
  connection is then opened directly by the client, same shape as the
  existing Twitch/Kick connectors. This means the real backend
  requirement may be much smaller than originally assumed — possibly
  zero:
  - **If Euler Stream's API allows a direct browser call (CORS) — not yet
    confirmed, needs a live test** — this could ship as a bring-your-own-
    Euler-key pattern, architecturally identical to the Polly bring-your-
    own-AWS-key connector shipped as v1.6.0 and the already-decided
    YouTube bring-your-own-key plan. No backend at all. Euler has a free
    tier (2,500 requests/day, forever).
  - If CORS is blocked, the backend shrinks to "proxy one HTTP call, hand
    back a URL" — much lighter than hosting a full relay, and the same
    basic shape ("hold an API key server-side") a Polly relay would need,
    so the two could plausibly share infrastructure if one ever gets
    built.
  - **Join/leave filtering is directly solvable, not just theoretically
    filterable**: TikTok's live event stream separates real chat messages
    (`WebcastChatMessage`) from joins (`WebcastMemberMessage`), gifts,
    likes, and follows into distinctly-typed events — a connector can
    just ignore everything except real chat messages, the same way the
    Twitch connector already ignores non-`PRIVMSG` IRC lines. The mixing
    Harvey sees is TikTok's own official chat UI's presentation choice,
    not a limit of the underlying data.
  - **Real risk, not just a technical caveat**: TikTok is described
    (2026 sources) as actively fingerprinting and banning accounts/
    traffic it flags as automated — a meaningfully more aggressive
    enforcement posture than Twitch tolerates for its anonymous-IRC
    convention. This is a risk to a *streamer's own TikTok account*, not
    just an engineering inconvenience, and needs to be weighed honestly
    before committing to this, not glossed over.
  - **Next concrete step, not yet done**: confirm whether Euler Stream's
    API actually permits a direct browser `fetch()` call (the CORS
    question above) — this is the one thing standing between "ship it
    exactly like Polly, no backend" and "needs at least a minimal relay."

## Harvey's decisions on the backend-relay question, plus a batch of new
## direction (2026-08-11 morning, after testing the overnight builds)

Harvey read the game-detector/Polly/TikTok status update and made several
real calls, plus set the sequencing for everything up to v2.0.0.

- **`CameraDetection` — dropped as a build target, but the underlying
  idea isn't.** "Lets 86 the camera detection for now" — confirmed. But
  he's interested in the face/eye-tracking technique itself as its own,
  much bigger future project: webcam-based eye/gaze tracking, comparable
  to what dedicated hardware (Tobii Eye Tracker, popular with Star
  Citizen players) does today, using a regular webcam instead of special
  hardware. Explicitly "another project for sure" — not scoped, not
  started, logged as task #35. Likely shares underlying computer-vision
  groundwork (facial landmark detection) with the PNGTuber/VTuber
  rigging research idea below — worth researching together later rather
  than as two unrelated efforts.
- **Polly hosting — greenlit, real infrastructure decision made.**
  Harvey will create the AWS account + a Polly-scoped IAM key himself
  (per the setup guide) and wants **us to host the actual relay
  ourselves in a Docker container on his existing server
  infrastructure**, so individual users never need their own AWS
  account. This resolves the "shared key is unsafe" objection from
  earlier the right way: instead of baking the raw AWS key into the app
  (unbounded blast radius if leaked), the app gets a **relay API key**
  baked in instead — the relay itself holds the real AWS key server-side
  and enforces real rate limits on the relay key. If the baked relay key
  ever gets extracted from the public app/releases, the worst case is
  bounded by the rate limit, not an open AWS bill. Task #34 tracks the
  build.

  **Built and deployed, 2026-08-11.** Harvey delegated the host choice
  ("whichever will handle this function better... your judgement").
  Picked CT101 (`dockerhost`/`docket-host`) over the Pi — it's the real
  Xeon D-2143IT server (8C/16T, 48GB RAM) already running as the general
  Docker host with Traefik + Portainer configured; the Pi is reserved for
  Pi-hole and Harvey's stated future NAS repurposing, not more app
  hosting. Deployed to `~/tts-relay/` on the host (not `/opt/` — that's
  root-owned, no passwordless sudo configured, didn't ask for one or try
  to work around it). Container built and running, joined the existing
  `edge` Traefik network, router configured for
  `tts-relay.thenerdybox.com` matching the same HTTP-01/Let's Encrypt
  pattern already live for `auth.`/`gamebox.`/etc. on the same host.
  Verified reachable inside the Docker network (`/health` responds
  correctly). A real relay key was generated and staged server-side.

  **DNS record confirmed live, 2026-08-11** — `tts-relay.thenerdybox.com`
  now resolves to `64.184.103.252` (verified via `nslookup`), the
  original blocker. **Harvey has also completed the AWS account + IAM
  user setup** (scoped to `polly:SynthesizeSpeech` only, per the setup
  guide: https://claude.ai/code/artifact/06d3257b-9bd7-4bd8-b309-5af45f672702)
  and is providing the real access key/secret. Remaining work to actually
  close task #34: write the real credentials into the relay's `.env` on
  CT101, restart the container, verify a real Polly request round-trips
  through it end-to-end, and decide whether/how the desktop app's Chat +
  TTS Overlay should offer a "use the relay" mode (a relay key, no AWS
  account needed) alongside the existing bring-your-own-AWS-key mode —
  not yet decided, this is the "bake it into the app" step Harvey asked
  about.

  Still remaining after that: the TikTok relay endpoint (waiting on the
  Euler Stream CORS question below), and the desktop app's own
  client-side "relay" TTS provider option in `chat-tts-engine.js` (needs
  the real relay URL working end-to-end first, not started).
- **TikTok — same relay treatment, "if possible."** Once the Euler
  Stream CORS question (above) is answered, if a relay turns out to be
  needed at all, it should follow the same pattern as the Polly relay —
  a small proxy for the one signing HTTP call, same rate-limiting
  discipline, plausibly the same Docker service exposing two endpoints
  rather than two separate deployments.
- **TikTok join/leave — simpler requirement than originally scoped.**
  Harvey doesn't need automatic detection/filtering complexity — he just
  doesn't want TTS reading "X joined" / "X left" messages aloud at all.
  Instead: **a short rising tone/ping for someone joining, a short
  falling tone/ping for someone leaving** — a lightweight, non-intrusive
  audio cue instead of either silence or spoken text. Simpler to build
  than full filtering logic once the event stream is actually connected
  (per the feasibility research, `WebcastMemberMessage` covers joins —
  **whether TikTok's event stream distinguishes actual "leave" events at
  all is still unconfirmed and needs checking when this gets built**, not
  assumed to exist just because Harvey asked for it).
- **MixItUp — greenlit for feature-inspiration research.** Not code to
  copy (it's someone else's actively-maintained product, see the
  FabioZumbi12 fork-checking note above) — a legitimate "what features
  does this well-regarded all-in-one streaming tool have that we could
  build our own original take on" research pass. Not scheduled yet.
- **The stated product vision, worth remembering for every future scope
  decision**: Harvey wants Stream Composer Suite to become a genuine
  catch-all replacement for the roughly 15 different single-purpose
  streaming tools a streamer currently has to juggle, not just add
  features piecemeal. This is the actual "why" behind chasing
  FabioZumbi12's tools, MixItUp's feature set, TikTok/Polly, etc. — they
  all serve this one thesis.
- **Sequencing, explicitly set by Harvey**: keep building features and
  ironing out what's already shipped (the ongoing v1.x.0 testing-pass
  cycle) — **then, before v2.0.0 specifically, the TTS/voice work and
  the hosted-relay infrastructure need to be fully ironed out** — that's
  a hard prerequisite Harvey named, not just "nice to have done by
  then." Only after that does the v2.0.0 "combine again" merge (see its
  own section below) make sense to pursue.
- **New idea: a companion web app for voice/config selection**, still
  just a question at this point, not a decision. Harvey's framing: once
  people have real optionality (multiple TTS voices, maybe multiple
  relay-backed features), does that configuration live purely in the
  desktop app, or does it need something like a "login style" web
  dashboard for configuration/editing — the same pattern already used
  for the separate Discord Server Builder project (`Working\
  Discord-Server-Builder\`). Worth a real design conversation once the
  relay infrastructure exists and there's an actual multi-option surface
  to configure — not scoped yet.
- **PNGTuber/VTuber interest, reiterated with more detail.** More
  reference screenshots in `_examples\` show PNGTuber/VTuber setups with
  visibly more interaction/detail than earlier examples. Harvey's
  instinct is there's a Python-script-based rigging/webcam-tracking
  approach behind a lot of these — matches the existing "VTuber features
  explicitly not scheduled" standing note elsewhere in this doc, still
  research-only for now, not started. Worth exploring together with the
  eye-tracking idea above, given both are fundamentally "webcam →
  detect face/features → drive something" problems that could share
  underlying computer-vision tooling.

## Three research passes, same day (2026-08-11) — Harvey asked to
## investigate before building; no code written yet, findings only

Harvey wanted real research on three things before committing further:
whether local/offline TTS could replace the Polly relay entirely,
whether PNGTuber/VTuber is realistic to build, and whether the viewer
avatars/pets idea from a reference screenshot is buildable.

### Local/offline TTS — a real, legally-clean candidate found

Harvey's question: he cited a game he called "World of Claudecraft" as
evidence that quality TTS at scale doesn't require paying per-character
cloud fees, and wanted to know how.

**What we found**: the game is real (**World of ClaudeCraft**, a
browser MMORPG). It does NOT prove the theory as stated — its NPC voice
lines were generated with **ElevenLabs, a paid cloud TTS API**, same
category as Polly. The actual reason it doesn't rack up a huge bill:
those lines are a **fixed, finite set written and generated once during
development**, shipped as static audio files — not synthesized live per
player/session the way Stream Composer's chat TTS has to be (unpredictable,
real-time chat text can't be pre-generated). Harvey's underlying instinct
— that high-volume voiced content avoids live per-use billing — is
correct, but the mechanism is pre-generation/caching, not a bundled local
engine replacing the cloud call. Worth telling him this directly rather
than letting the specific example stand uncorrected.

**That said, a real local option does exist and is worth pursuing on its
own merits**: **Kokoro TTS** (Apache 2.0 — clean, no GPL conflict), 54
voices across 8 languages from one ~327MB model, real-time on plain CPU.
Real Rust crates exist for Tauri integration (`kokoro-rs`, `kokoroxide`,
using ONNX Runtime, no Python needed), and Tauri's documented sidecar
mechanism (`externalBin`) is the standard way to bundle a platform binary
like this. Piper — the other well-known option — moved its actively
maintained fork to **GPL-3.0** in Oct 2025, a hard no under this
project's license rule; its old MIT snapshot exists but pinning an
unmaintained fork is a real risk, not recommended. **Honest quality
caveat**: Kokoro is a genuine step up from browser `speechSynthesis`'s
thin OS voices, but isn't independently verified as Polly-neural-tier —
frame it as "a much better free tier," not "replaces Polly." Not started
— a real candidate for a third TTS provider option, worth prototyping.

### Piper re-examined, and the "Justin" voice question (2026-08-11)

Harvey pushed back on ruling Piper out outright: "since we arent hiding
anything really, its all open and on github for the source code, i think
we fall under the piper GPL license, possibly." Worth a real answer
rather than either just overriding him or just agreeing.

**His specific reasoning isn't quite the legal test, but his instinct to
not write Piper off was right.** Being open-source ourselves doesn't
change anything — GPL-3.0 cares about *how a GPL binary gets combined
into a distributed product*, not whether the combining project is also
open. The actual test is the FSF's own "mere aggregation" distinction:
- **Linking Piper's code into Stream Composer's own binary** → GPL-3.0
  would apply to Stream Composer's code too. Not viable under this
  project's license.
- **Bundling Piper as a separate executable, launched via subprocess**
  (the same shape as a Tauri sidecar) → this is "mere aggregation," not
  a combined work. Stream Composer's own code stays under whatever
  license we pick, untouched.
- **The catch**: the Piper *binary itself* is still GPL-3.0, and
  distributing it — including inside our installer — carries GPL's
  distribution obligations for that binary specifically (source
  availability, license text included, etc.). That's a real compliance
  step, not a blocker, but not "free to just bundle" either.
- **Separate catch, easy to miss**: the code license and the voice
  *model* license aren't the same thing. Some Piper voice models are
  labeled CC-BY but were trained on data with murkier provenance —
  each voice we'd actually want to ship needs its own license check,
  not an assumption that "Piper is fine so every Piper voice is fine."

**Net effect on the Kokoro-vs-Piper call**: Piper stays on the table as
a subprocess-sidecar candidate, architecturally identical to how
Kokoro would be bundled — it's not dead. But it adds real compliance
work (GPL notice/source-availability for the bundled binary,
per-voice-model license verification) that Kokoro's clean Apache-2.0
model doesn't need. Not a reason to drop Piper, but a reason Kokoro is
still the lower-friction first prototype — task #36 now covers both,
Kokoro first.

### Kokoro built and working end-to-end, v1.9.0 (2026-08-11)

Task #36 built for real, not just prototyped on paper. Architecture:
a new `kokoro-sidecar/` Rust crate (separate from `src-tauri/`, a
standalone binary) wraps the `kokoro-en` crate (Apache-2.0) behind a
tiny local HTTP server, bundled into the app via Tauri's `externalBin`
sidecar mechanism. The BAKED overlay's `chat-tts-engine.js` gets a third
`kokoro` provider, calling `http://127.0.0.1:5757/synthesize` — the
exact same shape as the Polly connector calling AWS, just pointed at
localhost with no request signing needed.

**Real native-toolchain friction hit and fixed** (full detail in
`kokoro-sidecar/README.md`): `espeak-rs-sys` (a transitive dependency,
phoneme fallback for out-of-dictionary words) needed LLVM/clang
(`bindgen`) and CMake (to build `espeak-ng` from source) installed via
winget, a CMake generator override (`CMAKE_GENERATOR="Visual Studio 17
2022"` — auto-detection picked a generator name CMake doesn't actually
recognize on this machine), and a short `CARGO_TARGET_DIR` to dodge
Windows' 260-character `MAX_PATH` limit (this repo's own path is already
long enough that CMake's generated temp-file paths blew past it).

**Genuinely verified working, not just "compiles"**: downloaded the real
92MB quantized ONNX model + two real voice files from Kokoro's
HuggingFace repo, ran the sidecar standalone, and generated actual
speech audio from real text over a real HTTP request — a 412KB, valid
24kHz WAV file, sent to Harvey directly as proof. Worth noting as a real
resilience finding: on this dev machine, ONNX Runtime tried CUDA
(unavailable), fell back to DirectML (failed on this specific GPU/model
combination), fell back to CPU, and succeeded — all without crashing.
That fallback chain working cleanly is a good sign for how this will
behave across the range of streamers' actual hardware.

**Model NOT bundled in the installer** — a deliberate size tradeoff: the
model+voices (~110MB for all 29 English voices) download on first use
from the properties panel instead, so the ~35 people who never touch
Kokoro don't carry that weight in every install. The `kokoro-sidecar.exe`
binary itself (~66MB) IS bundled in every installer regardless, since
`externalBin` requires it — a real, permanent size increase worth
knowing about, not hidden.

**Sidecar lifecycle, the one real design decision here**: it's spawned
DETACHED from the editor app and is NOT killed when Stream Composer
Suite closes — deliberately, since a streamer's OBS session routinely
outlives the editor by hours and TTS needs to keep working the whole
time. This mirrors an operational reality streamers already live with
(OBS itself has to stay running) rather than inventing a new one. The
properties panel has explicit Start/Stop controls, not just Start, since
that also means a stray process can be left running after closing the
app.

**Honest verification gap, same category as this project's other
first-native-feature gaps** (v1.0.0's original untested drag/resize
flow, Kick's placeholder Pusher key): the sidecar binary itself and the
Rust backend commands are proven — real audio was generated, the
commands compile clean, the full app builds and bundles correctly — but
the actual in-app Download → Start → speak-in-OBS click path has not
been tested, since driving this app's native Tauri window is outside
what any tool available here can do. Needs Harvey's real test, flagged
prominently in `Tests/v1.9.0-kokoro-local-tts/WHAT_TO_TEST.md`.

**"Two builds to compare Kokoro vs Polly" delivered as one build**: per
the earlier simplification, both providers now live in the same Voice
Source dropdown in the same app — switch between them to compare
responsiveness/quality directly, no separate installers needed.

**Not built this pass, real next steps if this gets picked up further**:
Chatterbox Turbo as a fourth provider (Harvey greenlit it same session,
task tracked separately) — same subprocess-sidecar shape as Kokoro,
but a fresh integration since it has no existing Rust crate (would need
a Python subprocess or a from-scratch Rust ONNX wrapper, more work than
Kokoro's ready-made crate). Also not built: any UI polish beyond a
functional Download/Start/Stop control block, and no attempt yet to
reduce the sidecar's own ~66MB baseline installer-size cost (e.g.
lazy-downloading the sidecar binary itself, not just the model, for
users who never touch this feature).

**Separate, unrelated discovery made while checking this**: the
`Stream-Composer` GitHub repo currently has **no LICENSE file at all**
(confirmed via a direct GitHub API check, 404). That means it's
technically "all rights reserved" by default right now, regardless of
being publicly visible — this has nothing to do with the Piper
question specifically, but it's the thing that makes "what license are
we actually under" impossible to answer precisely today. **This needs
a decision from Harvey** (MIT/Apache-2.0/proprietary/something else) —
flagging it rather than picking one myself since it's a business call,
not a technical one.

**On "Justin"**: Harvey named the specific voice he uses on
StreamElements and asked if it, specifically, could run locally
without a key/relay. **"Justin" is an actual Amazon Polly voice name**
(en-US, standard engine only — no neural variant exists for it) —
StreamElements' TTS voice list is built on top of Polly for most of its
catalog, and the naming lines up exactly. That means Harvey's favorite
voice is very likely **already available today** through the Chat + TTS
Overlay's existing Polly connector (shipped in v1.6.0) once the relay
is live — no Piper/Kokoro work needed for this specific voice. It would
still require the relay (Polly is a cloud API, not a local model), but
it sidesteps the "which local engine has a voice I actually like"
question entirely for this one case. Worth Harvey just trying voiceId
`Justin`, engine `standard`, once the relay's DNS record and AWS key are
in (task #34).

### Chatterbox built and working end-to-end, v1.9.1 (2026-08-11)

Task #44 built for real, same discipline as Kokoro. Different
architecture, though: Chatterbox (Resemble AI, MIT code + weights) has
no ONNX export and no Rust crate, so unlike Kokoro's Rust binary this
runs as a Python process - a portable Python 3.12 interpreter (Astral's
`python-build-standalone`) plus `pip install chatterbox-tts`, all
downloaded on demand into the app's local-data directory rather than
bundled in the installer (only the tiny `sidecar.py` script itself ships
as a Tauri resource). Same local-HTTP-server contract as Kokoro
(`/health`, `POST /synthesize`), just on port 5758 instead of 5757 so
both can run simultaneously - switch between all four providers in the
same dropdown to compare them directly, the "two builds" comparison
Harvey originally asked for, still just one app.

**Genuinely verified working**: pip install resolved and installed
cleanly (confirmed torch 2.13.0 has real Windows wheels for this
machine's Python), and real CPU synthesis produced genuine audio - sent
to Harvey as proof, same as Kokoro's WAV. Two real bugs hit and fixed
during verification, both real upstream compatibility issues, not
mistakes in this project's own code: newest `setuptools` (84.0.0)
dropped `pkg_resources`, breaking Chatterbox's own watermarker import
(pinned `setuptools<81`); `torchaudio`'s newer `save()` API now defaults
to a `torchcodec` backend that isn't installed by default (switched to
`soundfile.write` instead, which was already in the dependency tree).

**Naming correction, worth remembering**: the installed PyPI package
(`chatterbox-tts` 0.1.7) only exposes a `ChatterboxTTS` class - no
separate `ChatterboxTurboTTS`. "Chatterbox Turbo" referenced in earlier
research appears to live on the project's GitHub main branch but isn't
in the published PyPI release used here. Shipped as plain "Chatterbox,"
not claimed as "Turbo" specifically - worth re-checking if a Turbo
checkpoint becomes available via a stable install path later.

**Real discovery made while verifying this, directly useful**:
`ChatterboxTTS.generate()` has an `audio_prompt_path` parameter for
**zero-shot voice cloning from a reference clip - no training needed at
all**. This directly solves Harvey's "I want to use my own voice, and
give it away free to everyone" ask (task #50) - completely legally clean
since it's his own voice, and the infrastructure to do it already
exists, just needs a real recorded sample from him.

**A versioning lesson, worth remembering generally**: Harvey asked for
this as "v1.9.0b" (a same-topic patch addition, using this project's
letter-suffix convention). Tried it literally first - Tauri's MSI/WiX
bundler rejected it outright: `optional pre-release identifier in app
version must be numeric-only... for msi target` (a real, confirmed
Windows Installer constraint, not a Tauri limitation). A numeric
pre-release like `1.9.0-2` would technically satisfy MSI but sorts
*before* `1.9.0` in semver ordering - backwards, since this ships on top
of it. Shipped as a normal patch bump, **v1.9.1**, instead - same
intent, correct ordering, no fighting the platform. Worth checking MSI
compatibility before promising a letter-suffix version to Harvey again.

### On XTTS-v2, "our own voice," and "combine all the engines" (2026-08-11)

Harvey read the earlier TTS research memo and asked three follow-ups,
each answered directly rather than deferred:

1. **Coqui XTTS-v2**: a hard no, not a "grab what we can" situation -
   its CPML license is explicitly non-commercial, and Coqui Inc. shut
   down in Jan 2024, so there is no one left to grant a commercial
   exception even if paid for one. This doesn't change with more
   research; it's a closed door.
2. **Using Harvey's own recorded voice, baked in free for everyone**:
   completely clean - it's his own voice/likeness, no right-of-publicity
   issue at all, unlike the earlier Justin/Tikfinity question. Directly
   solvable using Chatterbox's `audio_prompt_path` zero-shot cloning
   (discovered while building v1.9.1, no training needed) - task #50,
   just needs a real recorded sample from him.
3. **"Combine techniques from all the surveyed engines into our own
   model"**: a real, honest research pass (Haiku) found this framing
   doesn't quite match how these systems are actually built - you pick
   ONE base architecture and fine-tune it; heterogeneous model merging
   (combining genuinely different architectures) is an open research
   problem, not a practical option for a small team. Corrected directly
   rather than either humoring it or building nothing. **What IS real
   and useful from that research**: if genuine fine-tuning (not just
   zero-shot cloning) is wanted later, **Parler-TTS** and **MeloTTS**
   are the clean candidates - both Apache 2.0/MIT with real published
   training code (not just inference code), realistic on a single
   consumer GPU (RTX 4090-class) with 5-40 hours of reference audio
   depending on quality target. This is a genuinely separate, bigger
   R&D initiative from anything shipped this session - not scheduled to
   any version, noted here as a real future track since Harvey mentioned
   wanting to reuse a custom model beyond this project (future games,
   etc.).

### Multi-chat aggregation, voice cloning, and a second local-TTS survey (2026-08-11)

Three follow-up research questions from the same morning, full synthesis
published as an Artifact:
https://claude.ai/code/artifact/277c142e-2dcb-4395-8ba8-8d1a0650c383

- **Multi-chat/multi-streaming aggregation ("1-chat-to-rule-them-all")**:
  a crowded but fragmented market (Restream Chat, Streamlabs, SleepyChat,
  Casterlabs, Streamerbot all do some version of this) — not a gap, but
  no single tool owns "free, desktop-native, TTS-first multi-chat." The
  dropdown + multi-chat toggle shipped this same session (v1.8.0, see
  below) is the right shape for it, reusing the existing per-platform
  parsing/badge/TTS pipeline rather than a new system. Real gotchas for
  later: message ordering across sockets, TTS queue backlog under
  combined load, and Twitch's own TOS technically restricting display of
  non-Twitch chat while live on Twitch (a UI disclaimer, not a blocker).
- **Voice cloning for Polly "Justin" / Tikfinity "AI Pro"**: technically
  doable as a rough personal prototype (OpenVoice, MIT license, ~2-3
  hours to wire up, "rough but usable" quality) — but genuinely risky to
  ship to other users. 2025/2026 brought real legal teeth to this (US AI
  Transparency and Voice Rights Act, EU Digital Personality Act,
  Tennessee's ELVIS Act all extend right-of-publicity to synthetic
  voices; ElevenLabs/Amazon's own terms prohibit unauthorized mimicry;
  voice-cloning IP disputes up ~300% YoY). If this becomes a real
  feature: let users train on their OWN recorded voice samples instead
  of cloning a named commercial voice — same tech, zero IP exposure.
- **Second local-TTS survey**: found a genuinely strong second candidate
  alongside Kokoro — **Chatterbox Turbo** (Resemble AI, MIT license,
  faster than Kokoro, <100ms time-to-first-audio, studio-grade emotional
  tone control, 23 languages). No Rust crate yet, would need a CLI/
  subprocess wrap. Also confirmed to avoid: Fish Speech/F5-TTS (CC-BY-NC
  on the open tier — non-commercial only), Bark (MIT but 5-10 min per 10
  sec of audio on CPU, unusable for live chat), Coqui XTTS-v2 (CPML,
  non-commercial, company defunct).

### Chat + TTS Overlay platform picker redesigned as a dropdown (v1.8.0, 2026-08-11)

With Twitch/Kick/TikTok all shown as always-visible cards, the
properties panel was getting crowded — Harvey's direct feedback. Rebuilt
as a single "Chat platform" dropdown (shows only the selected platform's
fields) plus a "Using a Multi-Chat or Multi-Streaming?" checkbox that
reveals a second dropdown for simultaneous multi-platform use. The
underlying slot-selection rules (switching primary while a secondary is
active, what happens when the same platform gets picked for both slots,
toggling multi-chat off) were pulled out into pure functions in
`chat-platforms.js` (`activePlatformKeys`/`ensurePrimarySelected`/
`selectPrimaryPlatform`/`selectSecondaryPlatform`/`setMultiChatEnabled`)
specifically so this logic is Node-tested (14 new assertions) rather than
only eyeballed in a browser — this app's Tauri-dependent flows can't be
driven by Playwright MCP (web-content-only, confirmed again this
session), so pulling testable logic out of DOM closures is the real
mitigation, not a nice-to-have.

**Trovo added to the platform list, but disabled** — Harvey asked for it
to be added; research (already on record from the v1.2.0 platform
scoping pass) found Trovo's live-streaming shut down platform-wide on
June 30, 2026, which had already passed as of this date. Rather than
silently skip it or silently build a dead connector, it's listed in the
dropdown greyed out with an explanation, matching this project's
"never silently omit, always show why" convention (same pattern as the
Kick placeholder-key gap).

### A native OBS companion plugin — one real gap found, most of it doesn't need one (2026-08-11)

Harvey asked whether a native OBS Studio plugin (same C++/libobs
toolchain already stood up for game-detector) would meaningfully help
this app beyond what remote-control via `obs-websocket` already covers.
Real research, not a guess: **mostly no, with one genuine exception.**

`obs-websocket` v5+ (built into OBS 28+) already covers everything this
app's own remote-automation plans (task #47) need — adding/updating a
Browser Source's URL, switching scenes, reading state. A native plugin
only earns its keep for things WebSocket structurally can't do: custom
source types, direct audio/video-pipeline hooks with real sub-frame
latency, or fixing something OBS itself doesn't expose a WebSocket
verb for.

**The one real gap found**: Browser Source **cache refresh has no
WebSocket API at all** — confirmed via a live, years-old open feature
request on `obs-websocket`'s own GitHub (issue #1171), and a real
community plugin (`xObsBrowserAutoRefresh`) already exists specifically
to work around it. This is a genuine, current pain point for exactly
this app's use case — every version's `WHAT_TO_TEST.md` already tells
Harvey to manually right-click → Properties → "Refresh cache of current
page" after re-baking. A small, focused native plugin ("watch the baked
output folder, poke OBS to refresh the linked Browser Source when it
changes") would remove that manual step entirely — real value, small
scope (~500 lines of C++ per the research), low ongoing maintenance
since it doesn't touch OBS's audio/video pipeline at all.

**Not worth it**: a broader "recreate the overlay natively in C++"
plugin — the Tauri app already generates correct HTML; duplicating that
in C++ gains nothing and adds a second thing to keep in sync. For
mic-reactive items (PNGTuber, task #37): Web Audio API's Browser-Source
latency (~16-33ms) vs. a native audio hook's ~1-frame (~23ms) is not a
meaningfully different experience for this use case — not a reason to
go native.

**Real-world precedent found**: StreamElements ships both a native
OBS.Live fork *and* Browser Source support; Streamlabs stayed standalone
software with no native plugin at all. Two legitimate players landed on
different answers — there's no single "correct" approach here, it's a
scope/value tradeoff each product makes for itself.

**Verdict**: worth building eventually as a small, single-purpose
plugin (cache-refresh watcher), not worth building as a general-purpose
companion. Not scheduled to a specific version yet — task #48, folds
naturally into whichever version ends up tackling task #47 (OBS
WebSocket automation), since they're solving adjacent problems.

### PNGTuber/VTuber — PNGTuber is small and near-term, full VTuber is a
### separate, much bigger project

**PNGTuber**: confirmed simple in the real world (mic volume crosses a
threshold → swap between two images, same mechanism Veadotube Mini and
similar tools use) — buildable entirely with standard browser APIs
(`getUserMedia` + Web Audio API's `AnalyserNode`) inside the baked,
backend-free `scene.html`, zero native/Rust code needed. Same complexity
class as the existing Chat + TTS Overlay item. Realistic near-term
candidate.

**Full VTuber**: harder, but the hard part turned out to be model
rigging/rendering, not tracking. **MediaPipe Face Landmarker** (Google,
Apache 2.0) does real-time 468-point face tracking + blendshapes and —
genuinely useful finding — runs **entirely client-side via WASM**, which
means real face tracking is architecturally possible even inside the
backend-free baked overlay, not just in the native editor process.
Actually animating a rigged Live2D/VRM model from that tracking data is
where the real engineering weight sits, and is a separate, meaningfully
bigger problem. **Recommendation**: build PNGTuber first if either gets
picked up — VTuber support deserves its own dedicated scoping pass later,
not bundled in as "the same feature, just fancier."

**Overlap with the webcam eye-tracking idea** (spun out to its own
project idea, no longer tracked here — see the
`idea_webcam-eye-gaze-tracking` memory): real but limited — MediaPipe's
face landmarks include eye-region points, a plausible starting point,
but gaze *direction* estimation is a distinct, harder problem than
facial-landmark animation tracking. Current webcam-based gaze research
lands around 2-3° of error vs. Tobii hardware's ~1.6° — share the
underlying CV tooling/pipeline concept, not a shared solution. Don't
assume solving one gets the other for free.

### Multi-participant Discord-voice PNGTuber — genuinely simpler than expected, no bot needed (2026-08-11)

Harvey described a real feature seen elsewhere: multiple people in a
Discord voice call, each with their own on-screen character, where only
the person currently talking animates. The concern going in was that
this needs a Discord bot + backend infrastructure (the same class of gap
already blocking event-triggered viewer pets and Twitch EventSub). Real
research found the opposite.

**Discord's own official StreamKit** (`streamkit.discord.com`) already
broadcasts real per-user speaking state (`SPEAKING_START`/
`SPEAKING_STOP`, tagged per Discord user, not just "someone is
talking") directly to a browser context via the Discord desktop client
— **no bot, no bot token, no OAuth, no server infrastructure at all.**
The streaming PC just needs Discord's desktop app connected to the call
plus a small local page listening to those events, mapping each Discord
username to an idle/talking avatar pair. Confirmed via real existing
tools already doing exactly this: **SpeakForge** (standalone app,
connects directly to StreamKit, serves a local overlay URL to paste into
OBS) and **PNGStage** (web-based, built for exactly this "PNGTuber
collab stream" use case).

**Verdict: genuinely buildable, and simpler than Twitch's EventSub path**
(which needs real OAuth + webhook infra this app doesn't have). This
turns the single-streamer PNGTuber (task #37) and the multi-participant
version into a natural two-phase build of the *same* feature rather than
two unrelated ones — build the single-mic version first, then extend it
with a StreamKit listener + per-user avatar mapping once that's solid.
Not yet scoped into a specific version — task #49's research is done,
a real build-scoping pass is the next step whenever this gets picked up
after task #37 ships.

### Viewer pets/overlay games — two different features hiding under one
### name, only one is near-term buildable

Real-world examples confirmed (Streamlabs Chat Pets, StreamPet, Cat
Stream Pet Widget) — and they reveal an important split:

- **Chat-message-triggered pets** (a pet reacts when someone sends a
  real chat message) — buildable now, reusing the exact same
  chat-connection plumbing already built for Chat + TTS Overlay. Similar
  complexity to that existing item.
- **Event-triggered pets** (follow/sub/bits/donation-triggered) — this
  is actually the *dominant real-world pattern*, and it's **NOT**
  buildable with today's architecture. It needs Twitch's EventSub API,
  which requires OAuth app registration plus either a webhook receiver or
  an authenticated WebSocket — a real credential/backend requirement,
  same class of gap that's already blocking YouTube chat. The version of
  this feature people actually recognize is the harder one to build, not
  the easier one.

**Persistence without a backend**: the baked overlay's OBS Browser Source
runs in a persistent Chromium profile — `localStorage`/`IndexedDB` there
survives between stream sessions (unless the source cache gets cleared),
enough for a simple "has this viewer shown up before" check, though it's
local to one PC/OBS install and invisible across machines. Workable for a
first version, not full persistence.

**Broader overlay-games survey**: chat-controlled on-screen elements and
chat-voted mini-polls are the same complexity class as pets (just message
parsing). Prediction/battle-style overlays with real scoring and
resolution logic are a meaningfully bigger category — closer to a small
game engine than a decorative overlay item, not a natural next step from
here.

**Verdict**: a basic chat-message-triggered pet item is realistically
near-term buildable. The more recognizable event-triggered version needs
new backend/OAuth infrastructure Stream Composer doesn't have — logged as
a real gap, not something to fake or skip past.

## Outside sources scouted for ideas (2026-08-10) — not scoped, not built

Harvey asked for a look at two outside sources of feature ideas, separate
from the testing-pass backlog above. First-pass triage only — nothing
below is scoped or built, and this needs a real conversation with Harvey
before any of it becomes a version plan.

- **FabioZumbi12's abandoned GitHub repos** — Harvey forked repos from a
  GitHub user (`FabioZumbi12`) who stopped maintaining several OBS-
  adjacent tools, intending to either fold them into Stream Composer or
  take them over as separate projects. Only 2 forks actually exist under
  `SasiRawr` right now, not the ~10 Harvey estimated — worth confirming
  with him which repos he actually meant. Of the 2: `game-detector` (a
  native C++ OBS Studio plugin, GPL-2.0, genuinely abandoned — last
  commit ~5.5 months ago, unanswered issues since April) is a legitimate
  take-over candidate, but as its **own separate project**, not a Stream
  Composer feature — it's a native OBS plugin with a completely
  different toolchain (C++/OBS plugin SDK) than this Tauri app.
  `TwitchChatOverlay` has **no LICENSE file** (so Harvey's "open
  licenses" assumption doesn't hold for this one specifically) and would
  just duplicate the Chat + TTS Overlay this app already ships — not
  worth pursuing.
- **ReStream's public idea boards** (new-feature-requests / studio /
  integration-requests / api-requests, filtered for spam/junk) — almost
  entirely specific to ReStream's own hosted multistreaming platform,
  cloud production Studio tool, and developer API, none of which
  transfers to a local desktop app with no backend. One real signal:
  **TikTok chat support is the single most-voted item across all four
  boards** (230 votes, 2x the next-highest anywhere) — doesn't change
  the technical blockers already logged above (paid signing-service key,
  Node-only library), but is a real demand signal worth revisiting as a
  business decision with Harvey, not just a technical one.

**Full repo list, 2026-08-10:** Harvey asked for a complete pass over
`github.com/FabioZumbi12`'s repos so he can decide what to clone/fork —
full triaged list (123 repos → 7 streaming/OBS-relevant, 39 unrelated
Minecraft-era originals, 77 forks-of-others excluded as out of scope)
published at https://claude.ai/code/artifact/1f1c8769-de3c-4fdd-949a-877fcc7eea91.
Nothing cloned or forked beyond the 2 repos already under `SasiRawr`
(`game-detector`, `TwitchChatOverlay`) — waiting on his call.

## Standing rule: rebrand anything we take over (2026-08-10)

Any dead/abandoned project, feature, or third-party asset we incorporate
or improve on (FabioZumbi12's tools, downloadable TTS voice models if
that becomes real) ships as a **sole, unique TheNerdyBox.com/SasiRawr
product** — no upstream name, no "Developed by X" credit, no visible
lineage anywhere user-facing. Full reasoning in the
`feedback_rebrand-incorporated-projects` memory. Applies to `game-detector`
below and to any future voice-model work.

## Game Detector — renewed interest, concrete failure example (2026-08-10)

**Escalated to top priority, same night** — "I want those plugins
remade, tested and owned by us. DEFINITELY the game detector. Getting
that working fully and top of the line is a new priority." Explicit
instruction: work on this first, before anything else in this backlog.

Harvey has actually used FabioZumbi12's `game-detector` OBS plugin (the
one already forked under `SasiRawr` — GPL-2.0, genuinely abandoned, see
above) and wants to focus on fixing it: "when it does work, it is a VERY
very useful thing to have and works great. But sometimes it doesn't work
at all, or reports an incorrect game/category." He dropped real
screenshots in `_examples\` (`game detector options.png`, `adjust game
or category detection and exe detection.png`, `docked plugin in OBS
Studio.png`, `optionally set manually.png`).

What the screenshots actually show:
- **A real live misdetection**: the docked panel shows Twitch stream
  title "Back After a Long Break: Starting a New Marvel Rivals Season"
  but detected category "Just Chatting" — a clear false negative, not
  user error.
- **The detection mechanism**: scans installed-game libraries (Steam,
  Epic, GOG, Ubisoft Connect) into a Category/Executable mapping table,
  refreshed on OBS startup and periodically (10 min default), then
  matches against... something at runtime (the actual match trigger —
  foreground window vs. running-process-list vs. something else — isn't
  visible in these screenshots; needs reading the actual source once
  it's cloned).
- **A likely root cause, visible in the mapping table itself**: several
  entries map to generic, easily-collided executable names rather than
  the game's real distinguishing exe — row 2 is literally labeled
  category "game" mapped to `cs2.exe` (looks like a broken/default
  entry, not a real category name), "Dreadmyst" maps to `Launcher.exe`
  (a name shared by countless other games' generic launchers), and
  "RSDragonwilds" maps to `EpicOnlineServicesInstaller.exe` (an Epic
  platform service process, not the actual game). Generic/shared exe
  names are a plausible explanation for both "reports incorrect
  game/category" (wrong table entry matches first) and "doesn't work at
  all" (the real game's actual exe was never in the table because the
  library scan only sees the launcher, not what the launcher spawns).
- There's a manual override ("Set Category Manually" — title + category
  fields, per-platform) as the existing fallback for when detection
  fails, which is presumably what Harvey resorts to today.

**Not being rebuilt blind tonight** — this is a native C++ OBS Studio
plugin (completely different toolchain than this Tauri app), and
detection-logic changes are exactly the kind of thing that can't be
verified without launching real games against a real OBS install, the
same "needs Harvey's live testing" caveat this project already applies
to the Chat + TTS Overlay's live connections. What's safe and useful to
do without him: read the actual `game-detector` source (already forked
under `SasiRawr`) to find the real match logic and confirm/refute the
generic-exe-name theory above, and turn that into a concrete, scoped fix
plan — ready to build once he's back to help verify against real
game launches. Per the rebrand rule above, if this gets rebuilt, it
ships as a TheNerdyBox-branded tool, not "FabioZumbi12's Game Detector,
improved."

Full writeup also published for easy reading:
https://claude.ai/code/artifact/215ed3f8-67bd-4afe-9a8a-51a280d50439

### Source read, 2026-08-10 — root cause confirmed, not just theorized

Cloned the fork read-only and actually traced the detection code
(`src/GameDetector.cpp`, `ConfigManager.cpp`) — the generic-exe theory
above was right, and here's exactly why, with line references:

- **Detection mechanism**: a `QTimer` polls the full Windows running-
  process list every 5 seconds, checks each process's **executable
  basename only** (not full path) against a `knownGameExes` set built by
  the Steam/Epic/GOG/Ubisoft library scan (on startup + every 10 min).
  First match wins; zero matches fires `noGameDetected()`.
- **"Just Chatting" is a hardcoded fallback, not a wrong match** —
  `ConfigManager.cpp` defaults the no-match command to `!setgame just
  chatting`. Marvel Rivals showing "Just Chatting" means its running
  process was **never in the known-exe set at all**, not that something
  matched incorrectly.
- **The real bug — confirmed only for Steam and Ubisoft**: the library
  scan picks "the first non-ignored `.exe` in the game's root install
  folder," with no check that it's actually the game binary. Many games
  ship a root-level launcher stub that spawns the real game exe from a
  subfolder under a different name — the scan stops at the stub, the
  real running process is never recorded, permanent miss. **Epic and
  GOG don't have this problem** — Epic reads `LaunchExecutable` straight
  from its own manifest JSON, GOG reads `exe` straight from its registry
  key, both declared values, no guessing.
- **The same root cause also explains "wrong category," not just "no
  category"**: two games whose root folders both yield a generic exe
  name (`Launcher.exe`, etc.) collide in the same set — first-scanned
  game "owns" that name, so launching the second game silently fires the
  first game's category. This matches Harvey's screenshot exactly
  (`Dreadmyst` → `Launcher.exe`, `RSDragonwilds` →
  `EpicOnlineServicesInstaller.exe`).
- Two smaller, lower-priority findings: a fixed 1024-process buffer that
  silently truncates on a heavily-loaded PC, and exe-name matching that's
  case-sensitive with no normalization.

**Scoped fix plan, ready once Harvey's around to verify against real
game launches** (in priority order — **updated** after the elevation
investigation below turned up a real item #0): (0) switch the per-
process exe-path lookup from `OpenProcess(...VM_READ) +
GetModuleFileNameExW` to `QueryFullProcessImageNameW` with
`PROCESS_QUERY_LIMITED_INFORMATION` — removes a real anti-cheat-
triggered silent-skip failure mode (see below, this is likely what
actually happened with Marvel Rivals specifically); (1) for
Steam/Ubisoft, don't stop at the first root-folder `.exe` — read each
platform's own real launch-target metadata the way Epic/GOG already do,
where it exists (Steam has `appmanifest_*.acf` + can often be cross-
referenced against `launch.vdf`-style config; Ubisoft's manifests need
the same treatment Epic/GOG already get); (2) stop silently dropping
the second game on an exe-name collision — at minimum warn/flag it in
the Category and Games List UI instead of one game invisibly winning;
(3) normalize exe-name casing at both scan- and match-time; (4) raise
or dynamically size the process-list buffer. All of this needs a real
Windows machine with Steam/Epic/GOG/Ubisoft games installed to verify
against — can't be confirmed as *fixed* from static reading alone, only
diagnosed.

### New feature, requested same night: tie a scene + source list to a game category

Harvey's idea: when a game is detected, don't just switch the Twitch/
Trovo category — also switch OBS to a specific **scene** (and that
scene's source visibility list) tied to that game. E.g. "Marvel Rivals"
detected → auto-switch to a "Marvel Rivals" scene with that game's
specific overlay/webcam layout, instead of every game sharing one
generic scene. Genuinely useful, not yet scoped in code terms — needs:
a per-category-entry mapping to an OBS scene name (the plugin already
talks to OBS's frontend API for other things, per `PluginMain.cpp`/
`GameDetectorDock.cpp`, so scene-switching is architecturally
plausible, not a new capability class); a settings-UI addition to the
existing Category and Games List dialog to pick a scene per entry; and
a decision on what happens when a detected game has no scene mapped
(fall back to current scene? A configurable default?). Real scoping
work for once there's an actual build environment to test against.

### Admin-elevation hypothesis, raised same night by Harvey — investigated, real finding

Harvey's own diagnosis: "I believe the issue comes from running OBS
Studio as administrator and it might not be detecting games that are
running... However, I HAVE to run OBS Studio as admin, because if I
don't, my hotkeys for scene changes/transitions/foreground-game-capture
don't work unless I'm running OBS as admin." Investigated with a fresh
read of the same cloned source. Two separate findings:

**A second, genuinely new root cause for detection misses — likely THE
explanation for Marvel Rivals specifically.** `GameDetector.cpp:733`
calls `OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE,
pid)` on every running process to read its exe path. If that call
returns NULL, the process is silently skipped (line 734, no log at
all). `PROCESS_VM_READ` is exactly the access right anti-cheat systems
(Easy Anti-Cheat, BattlEye, Vanguard) commonly deny to any external
caller, elevated or not, specifically because it's how memory-scanning
cheat tools work — and **Marvel Rivals ships with Easy Anti-Cheat.**
This isn't confirmed without a live test, but it's a strong, specific,
independently-plausible explanation for the exact game in Harvey's
screenshot, on top of the already-confirmed wrong-exe-recorded bug.
**Fix, and it's a small one**: switch to `QueryFullProcessImageNameW`
with `PROCESS_QUERY_LIMITED_INFORMATION` instead — the modern API for
exactly "what's this PID's exe path," needs no `VM_READ`, far less
likely to be blocked by anti-cheat regardless of elevation. Adding this
as **fix-plan item #0**, ahead of the exe-scan-heuristic fix — smaller,
more mechanical, and directly explains the specific case Harvey hit.

The library-scan code (Steam/Epic/GOG/Ubisoft) reads
`HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\...`, a machine-wide hive
readable by standard users and not subject to UAC virtualization (which
only redirects writes from legacy unmanifested apps) — **ruled out** as
an elevation-sensitive path.

**Harvey's hotkey problem is unrelated to this plugin.** Grepped the
entire source tree for `RegisterHotKey`, `SetWindowsHookEx`,
`GetForegroundWindow`, `FindWindow`, `SetForegroundWindow`,
`IsUserAnAdmin`, `TOKEN_ELEVATION` — zero matches. `game-detector` is
pure `EnumProcesses` polling; it never touches hotkeys or window focus.
His hotkey/foreground-capture issue lives entirely in OBS core (or its
Game Capture hook) — the two problems are correlated by both happening
to need "OBS running as admin," not by sharing any code.

**The hotkey issue itself is real, OS-enforced Windows behavior (UIPI),
not something even a custom plugin could bypass**: a lower-integrity-
level process cannot hook into or send synthetic input to a higher-
integrity-level window. If a game (or its anti-cheat) runs elevated,
OBS must match that elevation to hook/capture it or receive its
hotkeys — full stop, enforced by the OS. Two realistic paths, **neither
verified live yet**: (1) check whether the game actually needs to run
elevated at all (Task Manager's Details tab has an "Elevated" column;
or Properties → Compatibility → "Run as administrator") — if it
doesn't, turning that off removes the need for OBS to elevate too;
(2) if it genuinely does need elevation, keep OBS elevated but remove
the repeated UAC-prompt friction with a Windows Task Scheduler entry
set to "Run with highest privileges," launched from a normal shortcut —
same admin rights, no prompt every time.

### Build toolchain status, checked same night

This machine has Visual Studio Build Tools 2022 installed (MSVC is
available) but **no `cmake`**, and `game-detector`'s own `buildspec.json`
needs a fresh multi-gigabyte fetch of OBS Studio's own source, prebuilt
`obs-deps`, and Qt6 before a build is even possible — a genuinely bigger
and riskier undertaking than anything else built for this project so
far (new toolchain, multi-GB downloads, and still unverifiable without
Harvey actually running OBS against real games afterward). Not started
without checking with him first — real research and fix-planning work
doesn't need the toolchain, so that's what's happening in the meantime.

## Ideas noted from Harvey's other reference screenshots (2026-08-10)

Two more images landed in `_examples\` (`pngTuber example.png`,
`streamvatar and frames.png`) alongside the Game Detector ones — not
tied to a specific ask, just "take a look and jot down what could be
taken from those images." Logged here as backlog candidates, not
scoped or built:
- **PNGTuber-style reactive avatar overlay** — a small animated 2D
  character in the corner of the stream (the example shows a simple
  chibi avatar). The standard technique swaps between an idle and a
  talking sprite based on live mic input level. Flagged as
  higher-complexity than it looks: OBS Browser Sources need explicit
  mic permission (`getUserMedia`) granted via OBS's own audio-capture
  settings for a source, which is new, unverified ground — similar in
  kind to the live-connection risk category the Chat + TTS Overlay
  already carries, not a quick add.
- **Social links panel** — a small always-visible box listing social
  handles (YouTube/TikTok/X/Instagram, etc.) with platform icons. Cheap
  to build: this app already has platform icon SVGs
  (`popup-slide-icons.js`) to reuse, and it's static content, no new
  risk category. Good candidate for an actual Starter Kit addition or
  new lightweight item type.
- ~~**Countdown timer overlay**~~ — **built in v1.5.0**, see that section
  below.
- **Non-rectangular frame shapes** — the example's diamond-shaped webcam
  frame suggests frame shape options beyond rounded-rectangle (diamond,
  hexagon, circle). Moderate scope: CSS `clip-path` in the baked output,
  a matching Fabric.js polygon in the editor canvas.

## More ideas from Harvey, same night, later (2026-08-10) — not scoped, not built

A second batch, in a live conversation rather than a "go to bed"
handoff. Standing philosophy he stated explicitly here, worth keeping
in mind for all of these: **"I want to make USEFUL plugins that people
want or have been wanting that will integrate nicely and be discussed
for their usefulness and what good they do for users."**

- **Android tablet / Steam Deck as a stream controller** — his own
  Elgato Stream Deck is an original (older) one, newer ones are pricey,
  and he hasn't yet built one of the 3D-printed DIY Stream Deck/volume-
  mixer designs he's found. Asked whether a cheap Android tablet or his
  Steam Deck could act as a dynamic OBS scene/hotkey controller and/or
  control his Elgato Key Lights. This is a genuinely different
  direction from anything built so far — not an OBS plugin, more likely
  a companion app or web control surface the tablet/Deck's browser hits
  (OBS has its own WebSocket API — `obs-websocket` — already noted
  elsewhere in this ROADMAP as a planned v1.x.0 feature; Elgato Key
  Lights have their own local HTTP control API too, well-documented and
  commonly integrated with). Not scoped — worth its own research pass
  when there's time, since it's unrelated to the Game Detector work
  that's the current priority.
- **`nightbotsr-obsplugin` as a "BoxBot" chat-moderation angle** —
  floated as something to think about, explicitly "not sure if it's
  possible or worth it to integrate into our current app." Lower
  priority, no action yet.
- **Downloadable TTS voice models — screenshots received and reviewed
  (2026-08-10 night, following power outage)**. Harvey sent 5 screenshots
  (`_examples/SE Voices.png`, `voices1-4.png`) comparing StreamElements'
  overlay TTS picker against Tikfinity's credit-gated voice list, plus a
  link to one of his own StreamElements overlay configs as a "this is
  what I'd want to help beginners build" reference (not fetchable —
  tied to his SE account session, no public/anonymous view).
  **What the screenshots actually show, name-matched against known TTS
  vendor catalogs**:
  - `SE Voices.png` — StreamElements' plain "TTS settings" panel (not the
    "AI" tab), free, showing Kimberly/Kendra/Justin/Joey/Joanna. These
    names, plus the larger set in `voices1.png`/`voices4.png`
    (Matthew/Ivy/Salli/Ruth/Stephen/Vera/Danielle/Gregory/Kevin/etc.),
    match Amazon Polly's standard/neural US English voice catalog almost
    exactly. Polly is an AWS cloud TTS API — SE is almost certainly
    eating that AWS cost themselves as a bundled perk, not exposing
    something free-to-run-anywhere. AWS does have a genuine free tier
    (5M characters/month for a new account's first 12 months, cheap
    per-character after), so **the exact same voices are legitimately
    obtainable with an AWS account** — just not literally zero-cost
    forever, and not something we can bundle without either eating the
    AWS bill ourselves across all users or asking each streamer to
    supply their own AWS key.
  - `voices2.png`/`voices3.png` (the "AI" tab, gated behind SE's own "AI
    Voice Credits" — same banner shown on-screen) — SpongeBob, Patrick
    Star, Whisper, Tentacle, Singer, Joe Biden, Donald Trump, Alpha,
    Breaker, Breeze, Inferno, Leader, Mentor, Micro, Luna, Tiffany. These
    do **not** match Polly's catalog at all — this looks like a separate
    licensed/custom voice-clone vendor, and **this is the part
    StreamElements ALSO charges credits for, not just Tikfinity.**
    Correction to the "Tikfinity ripoff" read from earlier tonight: only
    the ~5-voice legacy Polly-style set is actually free on SE; the
    character/novelty catalog is gated on both platforms.
  - Character voices modeled on real people (Trump, Biden) or copyrighted
    characters (SpongeBob, Patrick Star) carry real right-of-publicity
    and IP exposure if reproduced by name/likeness — flagging this now,
    before any build time goes toward chasing them, not after.
  **Net read, and now built as v1.6.0**: Harvey chose to build the Polly
  connector immediately rather than settle for a picker-only polish pass.
  Shipped: an opt-in "Voice source: Free (browser) / Amazon Polly (bring
  your own AWS key)" toggle on the Chat + TTS Overlay item. Polly requests
  are signed client-side with real AWS Signature Version 4 (`polly-tts.js`
  — pure canonical-request/string-to-sign builders plus SHA-256/HMAC-SHA256
  primitives via the Web Crypto API, verified against known SHA-256 and
  RFC 4231 HMAC-SHA256 test vectors, cross-checked against Node's
  independent `crypto.createHmac` too), no AWS SDK needed so the baked
  overlay stays import-free. `chat-tts-engine.js`'s baked script carries a
  literal copy of the same Web Crypto calls (not a re-implementation in a
  different API, unlike the JSON-parser duplicates elsewhere in this app).
  The properties panel shows an explicit, visually-flagged security note
  (`.hint-warn`, amber) since AWS keys end up embedded in plain text inside
  the exported `scene.html` — recommends an IAM user scoped to only
  `polly:SynthesizeSpeech`, never root/admin keys. The character/novelty
  voice catalog remains a pass, not a build target, for the legal reasons
  above. **Same verification caveat as Twitch/Kick**: the signing math is
  tested and structurally sound, but has not been confirmed against a real
  AWS account — needs Harvey's own key to verify actual audio comes back.
  Remember
  the rebrand rule for anything that does move forward.
- **`CameraDetection` — Harvey's own theory of what it does**: he thinks
  it's meant to alert if the camera/audio/game capture stops working —
  webcam frozen, audio not detected, game capture not detecting. Said
  himself this is lower priority than Game Detector and TTS voices, and
  he'll research it more before it's worth scoping.
- **Chat mods / VIP identification** — a loose idea about using a chat-
  moderation or VIP-tracking mod to identify VIPs for play-along
  segments or direct communication during a stream. Not scoped, no
  specific plugin identified yet.
- **Minecraft server plugins as NerdyBox-branded in-house tools** —
  Harvey/TheNerdyBox run their own Minecraft server (not Bukkit-based).
  He wants to take some of FabioZumbi12's Minecraft plugins from the
  Tier 2 list in the repo-review artifact (`RedProtect` — his biggest
  project by stars, `UltimateChat`, etc. — see
  https://claude.ai/code/artifact/1f1c8769-de3c-4fdd-949a-877fcc7eea91)
  and brand them as NerdyBox's own, both to actually use on the server
  and as a name-building exercise. Real open question before any of
  this is scoped: those plugins are built for Bukkit/Spigot/Sponge —
  compatibility with whatever server software TheNerdyBox actually runs
  needs to be confirmed first (not researched yet).

None of the above has been started — Game Detector is the explicit
priority ("lets see what we can do first about perfecting the Game
Detector thing"), these are logged so they're not lost, not queued next.

## v1.4.0: Background Generator (2026-08-10)

Harvey's ask, same night as the above: "a complete 'Gradient Background'
editor or 'static image generator' type plugin would be great to have as
well. Because even just basic background imagery is nice to have for a
stream." Told to keep working solo overnight ("do another module and
work it out") — built as the next module while `game-detector` and the
FabioZumbi12 repo list waited on his input.

**Shipped**: a new **Background Generator** — a standalone tool
(topbar, works with no project open, same pattern as the Stinger
Builder) that generates and exports a static background image: solid
color, a linear or radial gradient, or a photo with a semi-transparent
gradient overlaid on top (the "ghost effect" from the testing-pass
backlog, reframed here as a static-image-export mode rather than a
Starter Kit template — closer to what he actually asked for). Exports a
plain PNG, meant to be used directly as an OBS Image Source. New pure
module `background-generator.js` (fully tested: `coverFitRect()` for
the photo-fit math, `hexToRgba()` for the overlay's alpha-carrying
gradient stops, `resolveBackgroundPlan()` separating "what to draw" from
the actual canvas draw calls) reuses `gradient.js`'s existing
`gradientCoordsForAngle()` so this tool's gradients look identical to a
Frame item's gradient fill elsewhere in the app.

**Not built**: pattern/texture generation beyond solid/gradient/photo —
kept to what "basic background imagery" actually asked for rather than
guessing at a bigger scope.

## v1.5.0: Countdown Timer overlay (2026-08-10)

Still overnight, still "do another module" — picked the next-safest item
off the backlog above rather than the riskier PNGTuber/social-links
ideas, since it was already flagged as needing no network or
live-verification risk at all.

**Shipped**: a new **Countdown Timer** canvas item — set a target
date/time, a label shown above it, and text to show once it hits zero;
optionally fold the "days" segment into hours instead of showing it
separately. Ticks down live once a second in the baked output, same
"no live preview in the editor, dashed placeholder box instead" pattern
as Popup Slide and Chat + TTS Overlay (this one gets its own accent
color, `#ffb454`, so it's visually distinguishable from those two at a
glance). New pure module `countdown-timer.js` (time math: days/hours/
minutes/seconds remaining, zero-padding, the "fold days into hours"
option — fully tested) plus `countdown-timer-engine.js` (the baked
tick script, following `chat-tts-engine.js`'s established pattern of
re-implementing the pure module's math inline since baked output has no
module imports available — also tested, including a `new Function()`
syntax-validity check on the generated script, same pattern added for
the chat overlay in v1.3.0).

**Not built**: nothing deferred here — this one was fully in scope as
described.

## v0.8.0 – v0.9.0: two more standalone modules

Same pattern as v0.2.0–v0.7.0: build, test, ship as separate releases.

**Explicitly out of scope for these two** (corrected 2026-08-05, right
after the roadmap was first drafted):
- **VTuber-style features — deferred, not scheduled.** Harvey's call:
  "no vtuber features later. not now." Don't pick this back up without
  him raising it again. **When it does get raised:** Harvey specifically
  wants the option space to include PNGtuber/ENVtuber-style approaches
  alongside full rigged-3D-model avatars, not just the latter — many
  streamers don't have the budget or resources for a fully rigged 3D
  model and camera-tracking setup, and PNGtuber/ENVtuber approaches are
  a much lower barrier to entry. Noted 2026-08-05; scope this in
  whenever VTuber features actually get explored, not before.
- **Anything from the "validated next directions" list** (stinger/
  transition builder, chat+TTS overlay, asset library, template
  personalization) — that whole bucket is reserved *purely* for the
  v1.x.0 series after the merge (see below), not before.

So v0.8.0/v0.9.0 are two more deterministic, Node-testable image-editing
modules in the same vein as everything shipped so far (chroma-key, crop,
pad, color adjust, outline, blur, flip/rotate) — pick sensible next
candidates from that same well (e.g. sharpen, vignette/gradient overlay,
pixelate) the way each prior module was picked, not from either
excluded bucket above.

## v1.0.0: the combined suite

The big merge — `app/` and `scene-composer/` (and everything built by
v0.9.0) become **one** application, one version number, going forward.
Explicitly scoped to be feature-heavy, not a bare merge:

- **The merge itself** — Popup Slide Editor's popup-slide editing becomes
  a Module/item type inside the unified Scene Composer data model (§4/§7
  of `V2_ARCHITECTURE.md` already anticipated this).
- **Overlay Asset Workflow** — the #1 pain point the research surfaced
  (design → export → OBS has no integrated pipeline anywhere free).
  v1.0.0 is where this becomes a real, smooth, first-class flow, not an
  afterthought bolted onto separate tools.
- **Performance and stability pass** — a real major release needs to
  hold up, not just accumulate features. Budget real time for this
  before calling v1.0.0 done, not just at the end.
- **Color Adjust and Outline** — already shipped (v0.4.0, v0.5.0),
  carried forward as-is.
- **Starter Kit Wizard / tutorial** — guided first-run flow for new
  users:
  - Skippable up front.
  - Re-runnable later from a menu, for anyone who skipped it initially.
  - Comes with default imagery/templates/gradients as learning material
    — real starter assets, not lorem-ipsum placeholders.
  - Ends with an explicit "export this overlay and use it" option, so
    finishing the tutorial can produce something genuinely usable, not
    just a throwaway practice project.

## v1.x.0: the research doc's validated directions, as separate modules

This series is reserved **purely** for the "validated next directions"
from the research doc — nothing else gets scheduled here, and nothing
from this list gets built before v1.0.0. Build each as its own
standalone module/release — same incremental pattern as v0.2.0–v0.9.0 —
**before** attempting to combine them (that combination is v2.0.0, below):

1. **Stinger/transition builder — built as v1.1.0, pending Harvey's
   testing pass (see "Where things stand" above).** Ties directly into
   the video/GIF/WebM chroma-key interest already noted. Shipped with a
   solid-key-color export mode as the reliable default (Harvey's
   explicit call: not a pass/fail bet on true alpha transparency —
   easier matters more than being different) plus an experimental true-
   alpha mode, only offered when a capability check confirms support.
2. **Unified chat + TTS overlay — built as v1.2.0, pending Harvey's
   testing pass.** The reframed idea from the research doc, using free
   browser-native `speechSynthesis`. Twitch + Kick shipped (both
   zero-credential for the streamer — Twitch via widely-used but
   undocumented anonymous IRC, Kick via the same unofficial Pusher feed
   its own web client uses, pending a real app-key value). YouTube,
   TikTok, Trovo, and X were all researched and explicitly deferred/
   rejected — YouTube needs an API key (a shared embedded key would
   create real abuse/quota-exhaustion risk across every user of the
   app, so **when YouTube support is built, it's bring-your-own-key,
   with an explicit disclaimer that Stream Composer Suite doesn't supply keys
   or offer direct account linking for it — Harvey's call, settled
   ahead of time**), TikTok needs a backend this app doesn't have,
   Trovo is shutting down entirely (June 30, 2026, regardless of API
   quality), X has no real live-chat API surface below enterprise
   pricing. A `showAdultPlatforms` toggle mechanism was built into the
   platform picker per Harvey's ask (for platform options he doesn't
   want shown by default, adult-streaming sites specifically named) —
   no adult-platform connector exists yet, just the visibility
   plumbing for whenever that gets its own scoping conversation.
3. **Asset library / reusable components** — not yet scoped in real
   detail. Task #45.
4. **Template personalization** (re-color/re-text without a full
   re-edit) — not yet scoped in real detail, likely the smallest of the
   three remaining items since it can probably reuse the Starter Kit's
   existing brand-color/template infrastructure. Task #46.
5. **Real OBS WebSocket automation** for the Overlay Asset Workflow
   (auto-adding/updating the Browser Source in a running OBS instance,
   instead of the user pointing OBS at the baked scene.html by hand) —
   deferred out of v1.0.0's Overlay Asset Workflow pass (2026-08-06)
   since it's a meaningfully bigger scope/risk surface (a live connection
   to a separate running app) than the rest of that pass, which stayed
   to in-app improvements only (remembered bake folder, one-click OBS
   setup instructions, single-item preview). Task #47, not yet
   researched — a parallel question about whether a *native* OBS plugin
   (not just obs-websocket) is worth building alongside this is being
   researched as task #48.

This series grew substantially past its original 5-item scope while
items #1 and #2 were being built — item #2 (Chat + TTS Overlay)
specifically expanded from "Twitch + Kick" into TikTok (v1.7.0), Amazon
Polly (v1.6.0), Kokoro local TTS (v1.9.0), a dropdown/multi-chat
redesign (v1.8.0), and soon Chatterbox (v1.9.0-b) — all real, all
shipped, just far beyond the original one-line description. Items #3-5
are the only pieces of the *original* 5-item list still genuinely
unbuilt.

**Version budget, updated 2026-08-11**: originally "prefer under
v1.10.0, absolute max v1.15.0, hard ceiling v1.16.0" (set 2026-08-05,
before the series grew as described above). Harvey raised the soft
ceiling explicitly: **new soft target is v1.15.0** (the old absolute
max), same v1.16.0 hard ceiling as before, "just in case" — acknowledging
the series ran past the original v1.10.0 target, not a blank check to
pad versions further than needed.

**Sequencing agreed 2026-08-11**: Chatterbox ships as **v1.9.0-b**
(task #44, a same-topic patch addition to the just-shipped v1.9.0, using
this project's existing letter-suffix convention rather than a full new
minor version). Then **v1.10.0 = PNGTuber** (task #37) and **v1.11.0 =
chat-triggered viewer pets** (task #38) — both already researched as
near-term buildable. Items #3-5 above (asset library, template
personalization, OBS WebSocket automation) fill in after that, in
whatever order they end up scoped, before the series closes out and
v2.0.0 planning begins in earnest.

## v2.0.0: combine again, the TTS/alerts launch

Once the v1.x modules above exist independently, merge them together —
the next "everything becomes one" moment, this time centered on chat,
alerts, and TTS as the headline capability.

- **Self-hosted / runs locally first** — the whole point is nobody pays
  for a "pro plan" to get real alert/TTS functionality. This is the
  north star, not a fallback tier.
- **Optional hosting service** — if someone would *rather* have their
  designs/overlays hosted off their own PC, a paid hosting tier (small
  monthly/quarterly/annual fee) is worth exploring — explicitly **later**,
  not part of v2.0.0's actual build. Revisit once the free local product
  is proven out.

## Beyond v2.0.0

Once v1.0.0 is stable and shipped, keep brainstorming for additional
features to fold into later minor/major releases — this roadmap is a
direction, not a finished spec. Update it as real usage and further
research reshape priorities.

### Long-term direction: from "design tool" to "runs alongside your stream" (noted 2026-08-06)

Harvey's stated long-term vision, worth keeping in view for how v2.0.0+
gets scoped, not something to act on now: Stream Composer Suite eventually
becoming less of a "design it, export it, close it" tool and more of a
lightweight companion app that **runs alongside OBS/Streamlabs while
you're live** — modules feeding live sources into OBS the way some paid
overlay-provider desktop apps already do, with on-the-fly editing and
management (not just one-time export), potentially including a built-in
chat moderation bot. Explicit requirement that comes with this: the app
would have to become **very lightweight** to run continuously alongside
a stream, not just at design time.

This is exactly the direction the v1.2.0 Chat + TTS Overlay item already
points toward (a continuously-running, live-connected overlay module,
not a one-shot export) — if this vision holds, expect more future
modules to follow that same "always-running item type" shape rather
than the Stinger Builder's "one-shot export tool" shape.

**Brainstormed feature candidates noted for later** (not scoped, not
started):
- A "chat companion" overlay — small animated critters (foxes, cats,
  etc.) at the bottom of the screen, one per active chatter, with a
  speech bubble popping up from the critter's mouth when that person
  sends a message. Harvey saw this on another streamer's overlay and
  noted a paid Steam app exists specifically for this — validates the
  "people already pay for this, we could give it away free" thesis.
  Architecturally close to the existing Chat + TTS Overlay item (same
  underlying chat-connection/message-event plumbing) — likely an
  extension of that item type or a closely related one, not a
  from-scratch feature, when it gets picked up.
- VTuber features (still explicitly deferred, not scheduled — see the
  existing deferral note above): Harvey saved a reference screenshot of
  a fully-rigged, interactive VTuber model in a local `Examples` folder
  as a visual reference for "the direction" when this eventually gets
  explored. Combine with the existing PNGtuber/ENVtuber note already on
  file — full rigged 3D models are one end of the spectrum this
  reference represents, not the only option to build toward.

## Standing rule, reconfirmed

Everything ships free. The optional hosting idea above is the one
explicitly-flagged exception under consideration for the future, and even
that stays opt-in on top of a fully-functional free local product — never
a paywall on something already free. See the free-tier directive.

**Never store user data on TheNerdyBox infrastructure** (Harvey's
explicit policy, stated 2026-08-06): no user files, API keys, tokens, or
credentials of any kind get saved to any server this project controls —
even if that means passing up an easier "hosted" version of a feature.
This is a real design constraint, not just a preference: it's a large
part of why the app is architected local-first (see the "self-hosted /
runs locally first" north star already established for v2.0.0), and it
directly informed why v1.2.0's Chat + TTS Overlay never asks a user for
platform credentials the app itself would hold (Twitch/Kick both connect
anonymously; YouTube's future bring-your-own-key design means the
key lives only on the user's own machine, never touches anything we
run). The one explicitly-carved-out exception: a future Patreon/Discord
presence for community announcements, updates, and feature requests —
not a data-collection surface, just a public communication channel.
