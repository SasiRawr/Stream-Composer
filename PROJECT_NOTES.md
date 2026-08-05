# Project Notes: Stream Overlay Creation Suite

Background, decisions, and constraints behind this project — read this
before making changes, since it encodes real lessons learned, not just a
feature list. For the current architecture (app shell, canvas library,
background removal, module system), see `V2_ARCHITECTURE.md`.

---

## 1. Where this came from

TheNerdyBox develops indie games and hosts game servers, and
streams on Twitch and TikTok (occasionally Kick, Trovo, YouTube). This
project started as a single promotional overlay for the stream —
modeled loosely on a commercial product called "Social Media Popup by
Nerd or Die" — and grew into a general-purpose slide-popup generator,
then a reusable generator for creating more of them, then a visual editor
for hand-editing them, and now a full standalone WYSIWYG suite for
creating stream overlays *and* editing the image assets that go into
them: a free/local alternative to Photoshop, GIMP, or paywalled online
editors, for use with StreamElements, StreamLabs, or plain local OBS
browser sources.

`v1-pop-up-slide/` is the result of the first phase. It works, has been
tested, and is real prior art — not a throwaway prototype.

---

## 2. What already exists (`v1-pop-up-slide/`)

### 2.1 `campaign-thenerdybox/` — a finished, working example campaign

A small animated badge (built as a single OBS Browser Source) that slides
in from the bottom-right corner, cycles through slides of tag+text, then
slides out, pauses, and repeats. Files:

- `stream-popup-overlay.html` — the animation engine. Pure CSS/JS, no
  build step, no external dependencies besides an optional Google Fonts
  `@import`. Reads all content from `settings.js` at runtime via
  `<script src="settings.js">` (not `fetch()` — see §3.5 for why that
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
  forms instead of code (see §3.5 — this is the piece that directly
  motivated the "build a real app instead" pivot; `app/` replaces it).
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

### 2.3 `pop-up-slide-skill/` — an automated campaign generator

Turns the manual process above into a repeatable one: interviews the
user (logo/image behavior, transition style, slide content, timing, brand
assets), then generates a fresh three-file campaign
(`stream-popup-overlay.html` + `settings.js` + `editor.html`) from
templates in `assets/`. See `pop-up-slide-skill/SKILL.md` for the full
interview script and generation rules.

---

## 3. Decisions and constraints worth carrying forward

These came from real back-and-forth, not speculation — treat them as
requirements, not suggestions.

### 3.1 Fixed overlay size: 640×220

Every popup-slide campaign is generated at this exact size, for visual
unification/consistency across campaigns. Preserve some equivalent of
"campaigns/projects sharing a consistent canvas size unless deliberately
changed," rather than defaulting to ad-hoc sizing per project.

### 3.2 Three-file convention, never merged

Engine (animation code) / settings (content) / editor (GUI) are always
kept as separate files, specifically so a non-coder can edit *content*
without ever touching *code*. This separation-of-concerns principle
survives into later architecture even as the implementation changes —
in Scene Composer / the Module system, it becomes "project data" vs.
"renderer/template" vs. "editor UI," but the *shape* of the separation
(content should never require touching logic) matters more than the
specific file boundaries.

### 3.3 Plaintext editing as a first-class option, not an afterthought

Editing slide content without writing code needs to stay available "as
an option for simplicity" — even alongside a full GUI editor. Don't
assume a GUI obsoletes plaintext/simple editing for people who'd rather
just type into a text box.

### 3.4 Real brand assets over invented ones — always ask first

The build uses the real TheNerdyBox brand kit's exact hex color tokens,
font names, and logo directions — never an invented palette. Two colors
in that kit have *stated reserved meanings* (one is "reserved for the
escaping block, never decorative," another "means a server is up, and
nothing else") — both are respected: kept out of decorative use
elsewhere. **This generalizes**: anything touching branding/color should
ask whether an existing brand kit exists before inventing anything, and
whether any color/asset has a reserved meaning before reusing it
decoratively.

### 3.5 The hard constraint that triggered the desktop-app pivot: browser file-write

`editor.html`'s "Save" button cannot silently overwrite `settings.js` —
no webpage can do this in any browser, a deliberate security boundary,
not a bug. The best available options from inside a browser are the File
System Access API (`window.showSaveFilePicker`, Chromium desktop only)
or a plain download-and-manually-replace workflow.

**This is why the app is a standalone desktop app (Tauri) rather than a
plain webpage** — real filesystem access, actual in-place save, no
downloads-folder shuffle required. `app/` and `scene-composer/` both
solve this for real.

### 3.6 Trademark/logo policy — resolved

Redrawing actual trademarked platform logos (Twitch, YouTube, TikTok,
Discord, etc.) — even simplified/abbreviated — isn't something this
project does, regardless of common "fan site" conventions for logo
reuse. The resolution: build small stylized badges in TheNerdyBox's own
brand style (using the real brand kit's logo directions/colors) instead
of trying to represent other companies' brands at all — brand-safe by
construction. If something needs to reference *other* platforms'
branding, the correct approach is letting the user supply their own
official assets (downloaded from each platform's own brand/press page)
rather than shipping recreated logos.

### 3.7 Sizing consistency across icon sources

Whatever icon/thumbnail a slide uses — the real logo, a placeholder
badge, or a custom uploaded image — must render at the same fixed display
size so swapping doesn't break layout. Handled today via CSS
`object-fit: contain` inside a fixed-size box; carry the equivalent
principle forward regardless of implementation.

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
  panel all needing to agree on current selection). Scene Composer's
  renderer contract (one atomic `applyState`/render entry point per item
  type) exists specifically to prevent this class of bug going forward.
- **Idle-state override ordering**: resetting a component to its "idle"
  appearance needs to happen *after* whatever else just set it to a
  non-idle value, not before — otherwise the override gets silently
  clobbered by the thing that ran after it. Same category of bug as
  above; worth a moment's thought any time there's an "idle/default
  state" concept (e.g. an unselected/no-active-item state in an editor UI).

---

## 4. Everything else worth knowing

- Minimal coding experience but wants to learn — code in this project has
  consistently favored heavy inline comments and plain explanations over
  terse idiomatic code. Keep doing that; it's a standing preference.
- Intended to be published publicly on GitHub — treat code quality,
  comment clarity, and correctness as genuinely consequential.
- Prior file content in this repo has been syntax-validated and, for
  `editor.html` specifically, functionally tested end-to-end (load →
  edit → save → reload → verify) via a headless-DOM smoke test — not just
  eyeballed. Whatever testing approach is used going forward, matching or
  exceeding that bar (not just "it compiles") is the standing expectation.
