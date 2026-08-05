# v2 Architecture Decisions

This document records the technical decisions made for v2 — the standalone
Stream Overlay Creation Suite — and why. Read `PROJECT_NOTES.md` first for
the full background; this picks up where that document leaves open
questions and answers them.

**Scope note:** v2 is not "popup slides plus an image editor." It's a
general-purpose stream overlay design suite — the goal is that if a
streamer can imagine an overlay (a border, a webcam frame, an alert, a
badge slide, or something nobody's built yet), there should be a way for
them to build it without needing a developer. Everything below is chosen
with that goal as a hard requirement, not an afterthought.

---

## 1. App shell: Tauri

Chosen over Electron for a smaller install size, lower memory footprint,
and real filesystem access (needed because browsers can't save files in
place — see §3.5 of PROJECT_NOTES.md for why that matters). The frontend
runs inside a system webview (WebView2 on Windows, which is Chromium-based
and already installed on this machine), so ordinary web technologies —
HTML/CSS/JS, canvas libraries, WASM — all work normally.

## 2. Canvas / editing engine: Fabric.js

**Chosen:** [Fabric.js](https://fabricjs.com/) (MIT license).
**Fallback if performance becomes a real problem:** [Konva.js](https://konvajs.org/) (also MIT).
**Ruled out:** tldraw — it's *source-available*, not actually open source;
commercial/production use requires a paid license key. That's a hard
blocker for a free product built for TheNerdyBox.

**Why Fabric:**
- It's an object-model scene graph (shapes, images, text, groups), not
  just a rendering engine — that object model is exactly what a generic
  "project" needs, since it can be saved to a file and reloaded
  (`toJSON()` / `loadFromJSON()`) without hand-rolling that ourselves.
- `clipPath` gives non-destructive, *arbitrary-shape* masking (not just
  rectangular crop) on any object — this is what makes webcam-frame
  cutouts, border shapes, and general masking possible.
- SVG import/export is built in, which helps pulling in brand-kit assets.
- It's the library design tools reach for specifically (as opposed to
  Konva, which leans toward interactive UI, or PixiJS, which is a raw
  rendering engine you'd have to build an object model on top of).

**Trade-off:** Fabric is slower than Konva/PixiJS with very high object
counts or heavy real-time animation. That's an acceptable trade because
the canvas is the *editing* surface, not the thing that actually runs in
OBS — see §4 below for why that distinction matters.

## 3. Background removal: BiRefNet_lite, running locally in the webview

**Chosen:** [BiRefNet_lite](https://github.com/ZhengPeng7/BiRefNet) (MIT
license), fp16 ONNX weights, run in-browser via Transformers.js /
ONNX Runtime Web, with WebGPU acceleration and automatic WASM/CPU
fallback for machines without WebGPU. No hosted API by default.

**Important gotcha this research caught:** the models most tutorials
point to for background removal — BRIA's RMBG-1.4 and RMBG-2.0 — are
**non-commercial-use only** (CC BY-NC 4.0; commercial use needs a paid
agreement with BRIA). Since this ships as a product for a company, those
are off the table. BiRefNet (and its lighter `_lite` variant) is MIT —
genuinely free to use commercially — and is close to RMBG in quality.

**Why local instead of a hosted API (e.g. remove.bg):** hosted APIs cost
money per call (remove.bg: ~$0.20/image, free tier capped at 50/month,
preview resolution only) and need network access — both work against the
whole point of this project being a free, local, no-paywall tool. If
local quality ever becomes a real complaint, a hosted API could be added
later as an *optional* "higher quality, needs internet" toggle — not the
default.

**Why in the webview and not the Rust backend:** Tauri's WebView2 already
supports WebGPU, so Transformers.js can run the model directly in the
frontend. This avoids writing Rust-side ONNX Runtime (`ort` crate) code
and shuttling image buffers across the Tauri IPC bridge — simpler, and a
well-trodden path other open-source "background removal in the browser"
tools already use.

## 4. Project / template architecture — how "any overlay idea" stays possible

This is the piece that makes the app generic instead of hardcoded to
popup slides. It's grounded in prior art that solves the exact same
problem: StreamElements' custom widget system (JSON field schema +
renderer, auto-generates the edit form), tldraw's shape system (registered
shape types with `{type, props}` instances), and OBS's own scene/source
model (flat list of typed sources). All three converge on the same shape,
which is what's proposed here.

### Module = a self-contained overlay *type*

A **Module** is the unit of "a kind of overlay element" — Popup Slide is
one, Webcam Frame is another, Stream Border is another, and so on. Every
module has the same three parts, mirroring the engine/settings/editor
split that already works in v1:

1. **`schema.json`** — declares what's editable (text field, color picker,
   number/slider, image picker, dropdown, and a `multiline-parsed` type
   for plaintext editing — see below). This is what makes the editor UI
   generic: one form-renderer reads *any* module's schema and draws the
   right inputs, instead of hand-building a custom form per module the
   way v1's `editor.html` does today.
2. **A renderer** (HTML/CSS/JS, same spirit as v1's
   `stream-popup-overlay.html`) — a pure function of *props → visual
   output*. No hardcoded content, ever.
3. **Optional default assets** — a thumbnail, starter images, etc.

New overlay types are added by dropping a new folder under `modules/`
with these three parts — the app discovers modules at startup and they
appear in the palette. **No core-app code changes required.** This is the
actual mechanism behind "if they can think of it, there's a way to build
it": someone (eventually maybe a modder, more immediately future us)
writes a new module, and the app doesn't need to know it exists in advance.

### Project = a flat list of instances

A **Project** (an overlay, or a whole collection of overlays for a scene)
is just a list of placed instances:

```
{ id, moduleType, x, y, w, h, z, props }
```

— one entry per element the user dropped onto the canvas, exactly like
OBS's source list. Mixing module types freely in one project (a border +
a webcam frame + a popup badge, all in the same scene) is the normal
case, not a special one.

### Plaintext editing stays first-class, not per-module

Rather than reinventing v1's one-off `messagesText` plain-block parser for
every new module, plaintext editing becomes a **field type** in the
schema system (`type: "multiline-parsed"`, with a pluggable parser). Any
module can opt a field into "edit as plain text" without a bespoke
mechanism — this keeps §3.3 of PROJECT_NOTES.md (plaintext editing as a
first-class option) true for every module, forever, not just the first one.

### Avoiding the bug class from §3.8 of PROJECT_NOTES.md

The icon/text/width desync bug happened because a module's rendered state
could be updated piecemeal by different callers. The fix is structural:
every module's renderer exposes exactly **one** `applyState(props)` entry
point that updates everything atomically. No renderer may expose partial
update functions. This rule applies to every module going forward, not
just Popup Slide.

### v1 → this model

Popup Slide becomes the *first* Module, not a special case:
- `settings.js`'s `CONFIG` object → `schema.json` + default prop values.
- `stream-popup-overlay.html`'s CSS/JS → the renderer file, unchanged in
  spirit, wired to the one-entry-point `applyState` rule above.
- `editor.html` is retired — the generic schema-driven form replaces it,
  and gains "works for every future module" for free.

No capability is lost in this move; it's the same content, reorganized so
it's the first of many rather than the only one.

### How this connects to the canvas library (§2)

A module's renderer contract is defined abstractly — *props in, visual
output out* — rather than assuming plain DOM/CSS. That keeps this
architecture independent of whether the editing canvas ends up rendering
modules via Fabric.js objects directly, or via an embedded live preview
of the module's own renderer. This interface point should get nailed down
concretely during the first implementation milestone, not before.

## 5. Beyond background removal: masking, chroma-key, vectorization

Harvey asked (2026-08-04) for the image-editing side to go further than
just background removal — interactive masking/cutout, green-screen/
chroma-key, and raster-to-vector conversion, aiming to make the "free
Photoshop alternative" pitch genuinely indispensable rather than a toy.
Researched and decided, same standard as §3 (must run 100% locally, no
paid API, commercially-usable license):

**Interactive masking (click-to-select a subject):** **MobileSAM**
(Apache 2.0), a compressed build of Meta's Segment Anything Model
(~40MB, vs. 800MB+ for full SAM2/SAM3), run the same way as BiRefNet —
locally via Transformers.js/ONNX Runime Web. Click a point on an image,
get a mask back, entirely client-side. `SlimSAM` is a smaller fallback if
even MobileSAM proves too heavy for the app bundle. First-run model
download (tens of MB) and GPU-memory warm-up are real, worth surfacing to
the user rather than hiding.

**Chroma-key / green-screen:** **not a library dependency at all** — this
is a classical color-distance algorithm (sample a key color, measure each
pixel's distance to it, key out/feather within a tolerance, suppress
color spill at the edges), well within reach as a first-party WebGL
shader (~100 lines) or canvas pixel-math fallback. Expose key color
picker, similarity/tolerance, and edge feather as the user-facing
controls — same parameter set real chroma-key tools expose.

**Vectorization (raster → SVG):** **VTracer** (Rust compiled to WASM,
dual MIT/Apache-2.0 licensed), not potrace. This mattered: potrace — the
default first instinct for anyone researching this — is **GPL-2.0**,
which would force this entire app open-source under GPL if shipped.
VTracer is actively maintained and runs fully client-side. Real
limitation to communicate to users: works well on high-contrast/line-art
(logos, sketches), not photographs — set that expectation in the UI
rather than let a bad result read as a bug.

**Chroma-key is now built** (2026-08-05) — `scene-composer/src/chromakey.js`
+ `chromakey.test.mjs`, wired into `image` items' properties panel as a
"Chroma Key…" dialog (eyedropper key-color picker, similarity/feather/
spill-suppression sliders, live preview). Implemented as plain JS pixel
math (color distance in Cb/Cr space, not naive RGB, plus spill
suppression on the dominant key-color channel) rather than a WebGL
shader — the original plan called for WebGL, but for a one-shot still-
image edit (not live video) plain pixel math is simpler, has no GL-context
risk, and — importantly — is what actually makes the algorithm testable
in plain Node with no browser/GPU (see the test file: known input pixel →
known output pixel, no visual judgment required). Never touches the
original file; writes `<item-id>-keyed.png` alongside it. **Not yet
click-through tested by a human** — same caveat as the rest of Scene
Composer.

**Crop and Pad are now built too** (2026-08-05, v0.3.0) —
`scene-composer/src/croppad.js` + `croppad.test.mjs`, same deterministic-
math-first approach as chroma-key. Crop uses a small dedicated Fabric.js
canvas (image as a static backdrop, one draggable/resizable Rect as the
selection — reuses the same Fabric interaction model already proven on
the main canvas) so the user drags a box rather than typing coordinates;
Pad is a plain 4-field form (top/right/bottom/left + fill color or
transparent). Both write a new file (`<item-id>-cropped.png` /
`<item-id>-padded.png`) and resize the item's on-canvas box to match the
result's real pixel dimensions (no stretch/distortion). Not yet
click-through tested by a human.

**Color Adjust is now built too** (2026-08-05, v0.4.0) —
`scene-composer/src/coloradjust.js` + `coloradjust.test.mjs`. Brightness
(additive offset), contrast (scale around the 128 midpoint), and
saturation (blend toward/away from each pixel's own luminance) as three
independent, composable sliders with a live preview — 10/10 unit tests.
Alpha is never touched. Writes `<item-id>-adjusted.png`.

Masking (MobileSAM) and background removal (BiRefNet_lite, §3) are still
**researched and decided, not yet built** — deliberately sequenced after
the deterministic features (chroma-key, crop, pad) specifically because
they need real visual judgment to verify (an ML model's output "looks
right" or it doesn't) in a way pure math doesn't. Vectorization (VTracer)
is lower priority than these two per Haiku's follow-up research
(2026-08-05) into streamer pain points — see §6. Build the ML-based
features once Harvey has run Scene Composer for real and Playwright MCP
(connected 2026-08-04) is available in a live session to actually
screenshot and iterate, rather than shipping visually-unverifiable
features back to back.

---

## 6. Product-direction research (2026-08-05)

Harvey asked for a broader pain-point sweep (what streamers/creators
struggle with) and floated two bigger ideas: an OBS Studio rival, and
built-in chat text-to-speech. Haiku research findings, taken seriously
rather than just enthusiastically pursued:

- **OBS-rival: not recommended.** OBS is free, open-source, deeply
  entrenched (15+ years of community trust), and actively improving
  (redesigned audio mixer, plugin manager, WebRTC simulcast as of
  mid-2026). Streamlabs already tried "OBS but easier," and its resource
  overhead pushed users back to plain OBS once they outgrew beginner
  mode. Building a broadcast-app competitor is a massive engineering
  lift with no clear unique angle against a free, entrenched incumbent.
- **Built-in chat TTS: not recommended.** Already well-served by mature
  free/freemium tools (Blerp, Sound Alerts) and native platform Channel
  Points TTS. No differentiation from building it in-house; it would be
  scope creep away from the actual value proposition.
- **The validated opportunity**: overlay/asset creation workflow is a
  real, repeatedly-cited pain point — template staleness, no integrated
  design→export→OBS pipeline, PSD/XCF-to-PNG export friction. A
  **stinger/transition builder that exports WebM with transparency** was
  specifically called out as high-value and directly matches Harvey's
  own stated interest in video/GIF/WebM support for chroma-keyed
  transition stingers and animated webcam/stream frames — this is the
  strongest signal for what to build toward next, once the still-image
  feature set (chroma-key, crop, pad, and the still-pending background
  removal/masking) is solid.
- Also validated as worth keeping: an asset library/reuse system (save
  a configured item as a reusable component across projects) and a
  template-personalization flow (re-color/re-text a template without a
  full re-edit) — both fit naturally on top of the existing Module/
  Project model in §4, not architectural changes.

---

## 7. Scene Composer — a second, separate app

Harvey asked (2026-08-04) for a genuinely different kind of tool than
`app/`'s form-based popup-slide editor: an OBS/Streamlabs-style canvas
where you drag, resize, and arrange whole overlay layouts — a webcam
positioning frame, a popup badge, borders, whatever else — sized to your
real stream resolution, then "bake" the arrangement into one real OBS
Browser Source. He explicitly wants this as a **second, separate app**
(`scene-composer/`), not merged into `app/`.

This is the first real implementation of the Module/Project model from
§4 above: a Project is a flat list of `{id, type, x, y, width, height,
rotation, zIndex, props}` placed items on a Fabric.js canvas — exactly
what §4 specified, just built now with 3 concrete item types (`frame`,
`image`, `popup-slide`) instead of a fully open plugin registry. Full
design (data model, bake format, why the webcam element is a positioning
guide and not live camera capture) lives in the plan this was built
from — see the project's session history / `RESTART HERE.md` for detail
not worth duplicating here.

---

## Suggested build order (updated 2026-08-05)

1. ~~Minimal Tauri shell~~ — **done**, shipped as `app/` ("Popup Slide Editor").
2. ~~Generalize to a real Module/schema system~~ — **done**, built directly
   as `scene-composer/` (§7) rather than as a prerequisite step inside
   `app/` first.
3. ~~Deterministic image-editing features~~ — **done**: chroma-key (v0.2.0),
   crop + pad (v0.3.0). All three ship inside `scene-composer/`.
4. **Next**: background removal (§3, BiRefNet_lite) and masking (§5,
   MobileSAM) — need real visual judgment to verify, so wait for Harvey to
   confirm Scene Composer's foundation works and for Playwright MCP to be
   live in-session before starting.
5. Additional item types (borders, more webcam-frame variants, etc.) —
   additive once needed, no architecture change required.
6. Stinger/transition builder (export WebM with transparency) — validated
   by product-direction research (§6) as the strongest next-direction
   signal, ties directly into Harvey's video/GIF/WebM chroma-key interest.
   Bigger scope than the still-image features; its own planning pass.
7. Vectorization (§5, VTracer) — lower priority than the above per §6.
8. Export targets beyond local OBS browser source (StreamElements/
   StreamLabs) — separate scoping effort, later.
9. Eventual: merge `app/` and `scene-composer/` into one suite (Harvey's
   stated long-term goal) — revisit once several more modules exist and
   the shared Module/Project model (§4) has proven itself across them.
