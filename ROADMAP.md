# Roadmap

The strategic plan for Stream Composer, agreed 2026-08-05. This is a
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

## Where things stand (2026-08-05)

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
- **v1.0.0 merge status:** in progress. Shell consolidation (rename,
  Tauri identity, Rust command port) done; `popup-slide` capability-gap
  closing (per-slide icons, plaintext mode, engine reconciliation into
  one source of truth) done. Legacy import, Overlay Asset Workflow,
  Starter Kit Wizard, and the performance/stability pass are still
  ahead. See the detailed phased plan for this merge if picking it back
  up mid-stream.
- Two apps, two separate version numbers — this ends once v1.0.0 ships
  (see below).

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

1. Stinger/transition builder (WebM export with transparency) — ties
   directly into the video/GIF/WebM chroma-key interest already noted.
2. Unified multi-platform chat + TTS overlay — the reframed idea from
   the research doc, using free browser-native `speechSynthesis`.
3. Asset library / reusable components.
4. Template personalization (re-color/re-text without a full re-edit).

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

## Standing rule, reconfirmed

Everything ships free. The optional hosting idea above is the one
explicitly-flagged exception under consideration for the future, and even
that stays opt-in on top of a fully-functional free local product — never
a paywall on something already free. See the free-tier directive.
