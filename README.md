# Stream Composer

Free, local tools for building and editing stream overlays — no
Photoshop, GIMP, or paywalled online editor required.

**[Download the latest release](https://github.com/SasiRawr/Stream-Composer/releases/latest)** — see [CHANGELOG.md](CHANGELOG.md) for what's new in each version.

## What's in this repo

### `app/` — Popup Slide Editor

A desktop app (Windows, Tauri) for building and editing the classic
"popup slide" overlay — a small animated badge that cycles through
promotional messages on a loop, used as an OBS Browser Source. Open a
project folder, edit slides/transition/timing through a real form, and
save changes straight back to disk.

### `scene-composer/` — Scene Composer

A desktop app (Windows, Tauri) for composing a whole stream layout on a
canvas sized to your real stream resolution — drag, resize, and rotate
items (a webcam positioning frame, images, popup-slide badges), then bake
the arrangement into a single OBS Browser Source. Includes chroma-key
(green-screen removal) for image items.

### `v1-pop-up-slide/`

The original, still fully working popup-slide overlay generator that
`app/` builds on — a finished example campaign, a reference example for
per-slide images, and an automated generator that creates new campaigns
from an interview. Open
`v1-pop-up-slide/campaign-thenerdybox/stream-popup-overlay.html` in OBS
as a Browser Source (640×220, local file) to see it running.

### `PROJECT_NOTES.md`, `V2_ARCHITECTURE.md`, and `ROADMAP.md`

Project history, decisions, and constraints (`PROJECT_NOTES.md`), the
technical architecture behind the current apps — canvas library,
background removal, the item/project data model (`V2_ARCHITECTURE.md`) —
and where the project is headed, including the v1.0.0 combined-suite
merge and beyond (`ROADMAP.md`). Worth reading before making changes.

## Repo structure

```
.
├── README.md                  (this file)
├── PROJECT_NOTES.md            history, decisions, constraints
├── V2_ARCHITECTURE.md          current technical architecture
├── ROADMAP.md                  where this is headed (v0.8.0 → v2.0.0+)
├── app/                        popup-slide editor (desktop app)
├── scene-composer/             stream layout composer (desktop app)
└── v1-pop-up-slide/
    ├── campaign-thenerdybox/   finished, working example campaign
    ├── example-separate-images/ reference for per-slide images
    └── pop-up-slide-skill/     automated campaign generator
```
