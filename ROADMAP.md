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

None of the above has been re-verified by a real install/click-through
yet — same standing rule as everything else in this project: automated
tests + a clean build only prove it compiles and the pure logic is
correct, not that the installer dialog reads right or the stinger logo
actually looks good at 35% by default. Needs Harvey's next testing pass.

**Suggestions raised, not yet built — backlog for future versions:**
- **Global eyedropper** — a color-pick tool that can sample any pixel on
  the screen, not just within a dialog's own preview canvas (raised
  against Chroma Key specifically, but generally useful). Needs research
  into what's available cross-platform inside a Tauri/WebView2 window —
  not a trivial add, likely its own small scoping pass.
- **Name scenes when baking** — currently baked output folders are
  unnamed/generic; let the user give a scene a name at bake time.
- **Starter Kit**: rename "Gradient Border" → "Gradient Background" (the
  existing option reads as border-only but is more general than that),
  and add a "ghost effect" mode — overlay a semi-transparent gradient on
  top of a real image, not just a flat gradient fill. Also: make starter
  kit items individually selectable (build all, or pick and choose)
  rather than all-or-nothing.
- **Stinger Builder, full editor controls** — beyond the logo-size slider
  just added: rotation, movement/position, and general placement controls
  inside the editor (not just centered/animated per-template), so a user
  can actually art-direct the result instead of picking from fixed
  templates. Also raised: importing a video file as the stinger's source
  instead of a static image — either one with a pre-existing green-key
  area, or with an eyedropper-style "mask this color" tool applied to
  video frames. Also: pause/play and mute controls on the stinger preview
  player (raised specifically so a repeating 3–5 second audio loop
  doesn't become "maddening" during editing).
- **Chat + TTS Overlay**: filter/exempt emote-only messages from being
  read aloud, the same way "skip messages starting with !" already works
  — needs a definition of "emote-only" per platform (Twitch has emote
  metadata in IRC tags; Kick's equivalent needs checking). Voice
  selection (a dropdown over `speechSynthesis.getVoices()`, rather than
  always using the browser/OS default voice). A much bigger ask, **needs
  Harvey directly, not something to build blind**: downloadable/curated
  TTS voice models beyond what Windows ships (he's specifically heard
  character-style voices — a C-3PO-style voice, an "airy kid" voice, a
  raspy-voiced man — on sites like Tikfinity, and has logins that could
  help identify and source the actual voice models). TikTok as a chat
  platform — already a known, explicitly-deferred gap from the original
  v1.2.0 plan (needs a Node-only signing-service library that doesn't
  fit this app's no-backend runtime); re-flagged here since testing
  surfaced the same ask independently.

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
3. Asset library / reusable components.
4. Template personalization (re-color/re-text without a full re-edit).
5. Real OBS WebSocket automation for the Overlay Asset Workflow (auto-
   adding/updating the Browser Source in a running OBS instance, instead
   of the user pointing OBS at the baked scene.html by hand) — deferred
   out of v1.0.0's Overlay Asset Workflow pass (2026-08-06) since it's a
   meaningfully bigger scope/risk surface (a live connection to a
   separate running app) than the rest of that pass, which stayed to
   in-app improvements only (remembered bake folder, one-click OBS setup
   instructions, single-item preview).

**Version budget (Harvey's explicit constraint, 2026-08-05):** prefer to
land this whole series **under v1.10.0**; **v1.15.0 is the absolute
max**; **do not exceed v1.16.0 under any circumstance**. With 4 items
above, even a strict one-item-per-release pace only needs v1.1.0 through
v1.4.0 — comfortably inside budget. That headroom (up to v1.15.0) exists
specifically so more items can be added to this list from continued
brainstorming without blowing the ceiling — it's slack for scope growth,
not an invitation to pad the version count. A single release is free to
bundle multiple related items together (e.g. asset library + template
personalization might ship as one release if they turn out to overlap
significantly) if that's a better fit than one-per-version — the budget
is a ceiling, not a target to fill.

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
