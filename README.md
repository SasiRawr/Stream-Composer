# Stream Overlay Creation Suite

Two things live in this repo:

## `v1-pop-up-slide/`

A working, tested slide-popup overlay generator for OBS Browser Source —
a small animated badge that cycles through promotional slides on a loop.
Includes a finished example campaign (TheNerdyBox), a reference example
for per-slide images, and a packaged Claude Skill that generates new
campaigns from an interview. Fully functional today — open
`v1-pop-up-slide/campaign-thenerdybox/stream-popup-overlay.html` in OBS
as a Browser Source (640×220, local file) to see it running.

## `HANDOFF_FOR_CLAUDE_CODE.md`

The real reason this repo exists in its current form: a detailed brief
for building v2 — a full standalone WYSIWYG app for creating stream
overlays *and* editing the images that go into them (crop, pad,
background removal, masking), as a free/local alternative to Photoshop
or GIMP for streamers. v1 turned out to need a real desktop app rather
than a webpage for one concrete, unavoidable reason (browsers can't save
files in place) — that document explains why, along with everything else
worth knowing before starting v2: decisions made, constraints discovered,
bugs hit and fixed, and a concrete technical starting point.

**Read that file first if you're picking this up to build v2.** It's
written for exactly that handoff, in more detail than this README.

## Repo structure

```
.
├── README.md                        (this file)
├── HANDOFF_FOR_CLAUDE_CODE.md        the v2 brief — read this first
└── v1-pop-up-slide/
    ├── campaign-thenerdybox/         finished, working example campaign
    ├── example-separate-images/      reference for per-slide images
    └── pop-up-slide-skill/           the packaged Claude Skill
```
