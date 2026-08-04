# Handoff: Stream Overlay Creation Suite (v2)

**Purpose of this document:** context for Claude Code (or whoever picks
this up) to build a much larger project than what exists in this repo
today. Everything in `v1-pop-up-slide/` is a working, tested foundation —
read this whole document before touching code, since it encodes real
constraints and decisions discovered the hard way, not just a feature list.

**A note on how this document was produced:** this is a written summary
reconstructed from a Claude.ai chat conversation, not a raw exported
transcript — no such export existed to hand over verbatim. Where it
matters, exact wording, file contents, and reasoning have been preserved
as accurately as possible, but treat this as a careful summary rather
than a primary-source log.

---

## 1. Where this came from

The person building this streams on Twitch and TikTok (occasionally Kick,
Trovo, YouTube). Their company, TheNerdyBox, develops indie
games and hosts game servers, and they wanted a promotional overlay for
their stream advertising the brand — modeled loosely on a commercial
product called "Social Media Popup by Nerd or Die."

What started as "build me one popup ad" escalated, over the course of a
long conversation, into: a general-purpose slide-popup generator, then a
reusable Claude Skill for generating more of them, then a visual editor
for hand-editing them, and now — the person's explicit ask — a full
standalone WYSIWYG app for creating stream overlays *and* editing the
images/assets that go into them, positioned as a free/local alternative
to Photoshop, GIMP, or paywalled online editors, for use with
StreamElements, StreamLabs, or plain local OBS browser sources.

`v1-pop-up-slide/` is the result of the first phase. It works, has been
tested, and should be treated as real prior art — not a throwaway
prototype to ignore.

---

## 2. What already exists (`v1-pop-up-slide/`)

### 2.1 `campaign-thenerdybox/` — a finished, working example campaign

A small animated badge (built as a single OBS Browser Source) that slides
in from the bottom-right corner, cycles through slides of tag+text, then
slides out, pauses, and repeats. Files:

- `stream-popup-overlay.html` — the animation engine. Pure CSS/JS, no
  build step, no external dependencies besides an optional Google Fonts
  `@import`. Reads all content from `settings.js` at runtime via
  `<script src="settings.js">` (not `fetch()` — see §4.2 for why that
  distinction matters).
- `settings.js` — the actual content: slide text, colors, timing,
  transition style. Two ways to define slides are supported
  simultaneously (see §3.3):
  - `messagesText`: a plaintext template-literal block (tag/text pairs,
    blank line between slides) — no code syntax needed, but can't carry
    per-slide icons.
  - `messages`: a structured array of `{ tag, text, icon?, image? }` —
    supports per-slide icons/images, at the cost of needing correct JS
    object syntax to hand-edit.
- `editor.html` — a first-pass GUI for editing `settings.js` through
  forms instead of code (see §3.5 and §4.1 — this is the piece that
  directly motivated the "build a real app instead" pivot).
- `logo.png` — the real TheNerdyBox logo (the "monogram" mark, chosen
  because the brand kit's own README said it's the most legible at small
  sizes).
- `stream-popup-overlay-GUIDE.md` — a running, chronological log of every
  change made to this specific campaign and why. Worth skimming for the
  texture of decisions made, even though §3 below extracts the important
  parts.

### 2.2 `example-separate-images/` — reference for the "different icon per slide" mode

A full working copy of the same engine, but configured to show a
different thumbnail image per slide instead of a static logo — using
three other logo directions from the brand kit as stand-in thumbnails.
Exists so both supported content modes have a working, runnable example.

### 2.3 `pop-up-slide-skill/` — a packaged Claude Skill

Turns the manual process above into a repeatable one: interviews the
user (logo/image behavior, transition style, slide content, timing, brand
assets), then generates a fresh three-file campaign
(`stream-popup-overlay.html` + `settings.js` + `editor.html`) from
templates in `assets/`. See `pop-up-slide-skill/SKILL.md` for the full
interview script and generation rules — it's dense with hard-won detail
and worth reading directly rather than summarizing further here.

---

## 3. Decisions and constraints worth carrying forward

These came from real back-and-forth, not speculation — treat them as
requirements, not suggestions.

### 3.1 Fixed overlay size: 640×220

Every campaign is generated at this exact size "for unification" (the
person's words) — visual consistency across campaigns matters to them.
Whatever v2 becomes, preserve some equivalent of "campaigns/projects
sharing a consistent canvas size unless the user deliberately changes
it," rather than defaulting to ad-hoc sizing per project.

### 3.2 Three-file convention, never merged

Engine (animation code) / settings (content) / editor (GUI) are always
kept as separate files, specifically so a non-coder can edit *content*
without ever touching *code*. This separation-of-concerns principle
should survive into v2's architecture even if the implementation changes
completely — e.g., in an Electron/web-app version, this likely becomes
"project data" vs. "renderer/template" vs. "editor UI," but the *shape*
of the separation (content should never require touching logic) matters
more than the specific file boundaries.

### 3.3 Plaintext editing as a first-class option, not an afterthought

The person specifically asked for a way to edit slide content without
writing code, "as an option for simplicity" — even after a full GUI
editor existed. The lesson: don't assume a GUI obsoletes plaintext/simple
editing for people who'd rather just type into a text box. v2 should
probably preserve *some* fast, code-free text-editing path even inside a
full app (e.g., a "paste your slides as plain lines" import, not just
one-field-at-a-time form editing).

### 3.4 Real brand assets over invented ones — always ask first

When the person provided a brand kit (a zip with a README documenting
real hex color tokens, font names, and multiple logo directions), the
build used those exact values rather than inventing a palette. Two colors
in that kit had *stated reserved meanings* (one was "reserved for the
escaping block, never decorative," another "means a server is up, and
nothing else") — both were respected: the reserved colors were kept out
of decorative use elsewhere in the build. **This generalizes**: any v2
tool that touches branding/color should ask whether the user has an
existing brand kit before inventing anything, and should ask whether any
color/asset has a special reserved meaning before reusing it decoratively.

### 3.5 The hard constraint that triggered this whole pivot: browser file-write

`editor.html`'s "Save" button cannot silently overwrite `settings.js`.
No webpage can do this in any browser — it's a deliberate security
boundary, not a bug or a missing feature. The best available options from
inside a browser are:
- The File System Access API (`window.showSaveFilePicker`), which gives
  something that *functions* like a real overwrite via a save dialog, but
  only works in Chromium-based desktop browsers (Chrome/Edge), not
  universally.
- Otherwise, triggering a file download and asking the user to manually
  replace the old file — which is also literally how Nerd or Die's own
  commercial product works, per the person's own observation partway
  through this project ("it just downloads a new version of the file and
  you overwrite it").

**This is the reason v2 should be a standalone app rather than a plain
webpage.** An Electron/Tauri-style desktop app (or a local Node server
with a thin native wrapper) has real filesystem access and can actually
save in place, no downloads-folder shuffle required. If v2 ends up being
purely a hosted web app instead (e.g. for a SaaS-style product), this
limitation re-appears and needs a real answer (browser extension?
File System Access API with a clear "not supported in your browser"
fallback? Requiring a local companion app?) — don't quietly re-introduce
the download-and-replace workaround and call it solved.

### 3.6 Trademark/logo policy — carried forward, with a resolution

Early in this project, a request came up to include real platform logos
(Twitch, YouTube, TikTok, Discord, etc.) as selectable icons in the
editor. The position taken: redrawing actual trademarked logos — even
simplified/abbreviated — isn't something to do, regardless of common
"fan site" conventions for logo reuse. The generic placeholder built
instead (a plain colored circle with two-letter initials per platform)
was explicitly called out by the person as a good middle ground, but they
then proposed something better: **build small stylized badges in
TheNerdyBox's own brand style** (using the real brand kit's actual logo
directions/colors) instead of trying to represent other companies' brands
at all. That's the right direction for v2's default icon set — brand-safe
by construction, since it's the user's own brand kit driving the
options, not an attempt to represent third parties.

If v2 needs users to reference *other* platforms' branding (e.g., "share
to Twitch" style buttons), the correct approach is letting the user
supply their own official assets (downloaded from each platform's brand/
press page) rather than the app shipping recreated logos itself.

### 3.7 Sizing consistency across icon sources

Whatever icon/thumbnail a slide uses — the real logo, a placeholder
badge, or a custom uploaded image — must render at the same fixed display
size so swapping doesn't break layout. The existing engine handles this
today via CSS `object-fit: contain` inside a fixed-size box; carry the
equivalent principle forward regardless of how v2 implements image
handling.

### 3.8 Bugs worth knowing about (so they aren't reintroduced)

- **Icon/text desync during the first slide's open animation**: a
  function that was supposed to update *text, icon, and panel width
  together* got split so one code path only updated the icon — leaving
  the text panel's width stuck at zero, so the first slide's text was
  present and "faded in" but invisible inside a zero-width container.
  Symptom looked like "the first slide just skips." Lesson: when
  refactoring a function that updates multiple related pieces of UI state
  together, don't let a caller update only one of them without the
  others — that class of bug is easy to reintroduce in a bigger app with
  more state to keep in sync (e.g. a canvas + layers panel + properties
  panel all needing to agree on current selection).
- **Idle-state override ordering**: resetting a component to its "idle"
  appearance needs to happen *after* whatever else just set it to a
  non-idle value, not before — otherwise the override gets silently
  clobbered by the thing that ran after it. Same category of bug as
  above; worth a moment's thought any time v2 has an "idle/default state"
  concept (likely: an unselected/no-active-layer state in an editor UI).

---

## 4. What v2 should actually be

### 4.1 The concrete ask

A standalone application (not just a webpage) that lets someone create
and edit stream overlays *and* the image assets inside them, without
needing Photoshop, GIMP, or a paywalled/ad-supported online editor.
Concretely, image-editing needs include: cropping, padding, background
removal, adding transparency, and masking — plus everything already
built in v1 (slide/text/timing/transition editing). Output needs to work
either as a browser-source-style local overlay (what v1 already does) or
as something compatible with hosted platforms like StreamElements or
StreamLabs.

### 4.2 Technical considerations to resolve early (don't guess — decide deliberately)

- **Platform**: Electron or Tauri (real filesystem access, resolves §3.5
  cleanly) vs. a web app with a local companion process vs. a pure hosted
  web app (which reopens §3.5's save problem and needs its own answer).
  Given the explicit ask for a "standalone app," lean Electron/Tauri
  unless there's a strong reason otherwise — confirm with the user before
  committing significant work in one direction.
- **Background removal** is a real ML task, not a simple image filter.
  Realistic options: a client-side WASM/ONNX model (keeps everything
  local, no server dependency, larger bundle size) vs. a hosted API
  (simpler to implement, requires network + likely a cost per call, works
  against the "standalone/local" framing of this whole project). Given
  the project's stated goal of *not* requiring paid tools or the internet
  dependency that comes with SaaS editors, a local/client-side model is
  probably the right fit — but this is a real architectural decision, not
  a detail, and deserves its own research spike before committing.
- **Canvas/editing engine**: don't build a raster editor from scratch.
  Evaluate existing open-source canvas editing libraries (e.g. Fabric.js,
  Konva, or similar layer-based canvas toolkits) rather than
  hand-rolling crop/mask/layer math.
- **Project file format**: needs a real persisted-project concept (not
  just "a folder of loose files" like v1) if this is going to support
  multiple overlays, multiple image assets, and non-destructive editing
  (undo history, layers, masks) the way a real editor should.
- **Export targets**: local OBS-style browser source (extend v1's
  approach) at minimum; StreamElements/StreamLabs export is a stretch
  goal worth scoping separately once the core editor exists, since their
  respective overlay/widget formats have their own constraints to
  research rather than assume.

### 4.3 Suggested starting point

Don't try to design the whole app before writing code. A reasonable first
milestone: a minimal Electron/Tauri shell that can open a folder, load
one of v1's existing campaigns (`campaign-thenerdybox/`) as a "project,"
and render/edit its slides through a proper UI — essentially
`editor.html`'s functionality, but as a real app with actual file save,
no download-and-replace workaround. Get that solid before layering on
image editing (crop/pad/background-removal/masking), which is a
substantially bigger, separate body of work.

---

## 5. Everything else worth knowing

- The person has minimal coding experience but wants to learn — code in
  this project has consistently favored heavy inline comments and plain
  explanations over terse idiomatic code. Keep doing that; it's a
  standing preference, not specific to v1.
- They intend to publish this publicly (mentioned GitHub explicitly) —
  treat code quality, comment clarity, and correctness as genuinely
  consequential, not just a nice-to-have.
- All prior file content in this repo has been syntax-validated and, for
  `editor.html` specifically, functionally tested end-to-end (load →
  edit → save → reload → verify) via a headless-DOM smoke test — not just
  eyeballed. Whatever testing approach v2 adopts, matching or exceeding
  that bar (not just "it compiles") is the expectation already set.
