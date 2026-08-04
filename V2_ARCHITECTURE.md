# v2 Architecture Decisions

This document records the technical decisions made for v2 — the standalone
Stream Overlay Creation Suite — and why. Read `HANDOFF_FOR_CLAUDE_CODE.md`
first for the full background; this picks up where that document leaves
open questions and answers them.

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
place — see §3.5 of the handoff doc for why that matters). The frontend
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
mechanism — this keeps §3.3 of the handoff doc (plaintext editing as a
first-class option) true for every module, forever, not just the first one.

### Avoiding the bug class from §3.8 of the handoff doc

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

---

## Suggested build order (unchanged from the handoff doc's §4.3, still right)

1. Minimal Tauri shell: open a folder, load `campaign-thenerdybox/` as a
   Project, edit it through a real UI with actual file save.
2. Generalize: introduce the Module/schema system, migrate Popup Slide to
   be a Module rather than a special case, build the generic form editor.
3. Canvas/masking work (Fabric.js integration, arbitrary masks, image
   crop/pad).
4. Background removal (BiRefNet_lite, in-webview).
5. Additional modules (borders, webcam frames, etc.) — should now be
   additive, not architectural work, if steps 1-2 were done right.
6. Export targets beyond local OBS browser source (StreamElements/
   StreamLabs) — separate scoping effort, later.
