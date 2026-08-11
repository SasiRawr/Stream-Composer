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
  **Net read**: the free-and-legitimately-buildable win here is what's
  already shipped — browser-native `speechSynthesis` (OS voices, zero
  cost, zero account, forever) — possibly with a picker UX polish pass
  (search box, per-voice Test button, matching the SE/Tikfinity list
  feel Harvey pointed at). A real *quality* upgrade to get the literal
  Polly names/voices would mean a bring-your-own-AWS-key Amazon Polly
  connector, opt-in, mirroring the already-decided YouTube
  bring-your-own-key pattern for Chat + TTS Overlay — not started, real
  scope (AWS SDK calls, credential storage, needs Harvey's live AWS
  account to verify audio output). The character/novelty voice catalog
  is a pass, not a build target, for the legal reasons above. Remember
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
