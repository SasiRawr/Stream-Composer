# Stream Composer Suite

Free, local tools for building, editing, and running stream overlays —
no Photoshop, GIMP, or paywalled online editor required.

**[Download the latest release](https://github.com/SasiRawr/Stream-Composer/releases/latest)** — see [CHANGELOG.md](CHANGELOG.md) for what's new in each version. Recent versions (v1.0.0–v1.2.0) are published as **pre-releases** pending a human testing pass — see [ROADMAP.md](ROADMAP.md)'s "Release process" section for what that means.

[![Donate via PayPal](https://raw.githubusercontent.com/SasiRawr/Stream-Composer/main/donate-button.svg)](https://www.paypal.com/donate/?hosted_button_id=4GXAKQT5XWVSW)

## What's in this repo

> **The v1.0.0 combined-suite merge is done.** `app/` (the old
> standalone Popup Slide Editor) has been folded into `stream-composer/`
> — its popup-slide editing became a real item type there, with more
> capability than the original. `app/` is kept in the repo only as a
> tested fallback until v1.0.0 is confirmed good, then it's removed.

### `stream-composer/` — Stream Composer Suite

A desktop app (Windows, Tauri) for building a whole stream layout on a
canvas sized to your real stream resolution — drag, resize, and rotate
items (a webcam positioning frame, images, popup-slide badges, a live
chat + TTS overlay), then bake the arrangement into a single OBS Browser
Source. Includes:
- 9 deterministic image-editing features (chroma-key, crop, pad, color
  adjust, outline, blur, flip/rotate, sharpen, vignette) for image items.
- A **Starter Kit** with ready-made templates instead of starting blank.
- A **Stinger Builder** for exporting short animated OBS transition clips.
- A **Chat + TTS Overlay** that connects to your live chat (Twitch and
  Kick) and reads new messages aloud, fully free and offline.
- **Import Legacy Project…**, for bringing an old `settings.js`-based
  popup-slide campaign in without losing anything.

Renamed from `scene-composer/` as part of the v1.0.0 merge.

#### PNGTuber and audio

PNGTuber items react to **OBS audio** by default: they read the live level
of an OBS input (your mic, Discord, game audio - your choice) through
Stream Composer Suite. To use it:

1. In OBS, open **Tools → WebSocket Server Settings** and enable the
   WebSocket server. If authentication is on, click **Show Connect Info**
   and copy the server password.
2. Select the PNGTuber item, and in its properties panel enter the host,
   port (4455 by default) and password under **OBS connection**, then
   press **Connect / Test**. The panel shows whether the audio relay is
   connected and lets you pick the OBS audio input.
3. Keep Stream Composer Suite running while you stream.

A **microphone** mode is still available but is experimental: OBS usually
blocks microphone access for browser sources (right-click → Interact offers
no permission prompt), so it often cannot work. Launching OBS with
`--enable-media-stream` may help on some versions but is not guaranteed.

Nothing about setup, permissions or connection problems is ever drawn into
the baked source - viewers never see it. Instead, Stream Composer Suite
shows a "Before you go live" popup after each bake/export listing what each
item needs, and writes the same notes into the README that ships with the
export.

### `app/` — Popup Slide Editor (retired, kept as a fallback for now)

The original standalone desktop app for the classic "popup slide"
overlay. Superseded by `stream-composer/`'s `popup-slide` item type,
which now supports everything this app did and more. Stays in the repo
only until v1.0.0 is confirmed good, then gets removed.

### `v1-pop-up-slide/`

The original, still fully working popup-slide overlay generator that
`app/` was built on — a finished example campaign, a reference example
for per-slide images, and an automated generator that creates new
campaigns from an interview. Also used as real test fixtures for
`stream-composer/`'s legacy-project-import feature.

### `PROJECT_NOTES.md`, `V2_ARCHITECTURE.md`, and `ROADMAP.md`

Project history, decisions, and constraints (`PROJECT_NOTES.md`), the
technical architecture behind the app — canvas library, item/project
data model, the reasoning behind every major feature
(`V2_ARCHITECTURE.md`) — and where the project is headed, including the
release process and the long-term direction (`ROADMAP.md`). Worth
reading before making changes.

## Repo structure

```
.
├── README.md                  (this file)
├── PROJECT_NOTES.md            history, decisions, constraints
├── V2_ARCHITECTURE.md          current technical architecture
├── ROADMAP.md                  where this is headed, release process
├── app/                        popup-slide editor (retired, kept as fallback)
├── stream-composer/             Stream Composer Suite (desktop app)
└── v1-pop-up-slide/
    ├── campaign-thenerdybox/   finished example campaign, also an import-test fixture
    ├── example-separate-images/ reference for per-slide images, also an import-test fixture
    └── pop-up-slide-skill/     automated campaign generator
```
