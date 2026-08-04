# pop-up-slide

A [Claude](https://claude.ai) skill that generates animated, transparent
slide-in popup overlays for livestreaming — built for OBS Browser Source,
so it works the same whether you're pushing to Twitch, TikTok, Kick,
Trovo, or YouTube.

Tell Claude what you want to advertise, answer a few setup questions, and
it hands you a ready-to-use overlay: a small badge that slides in from a
corner, cycles through your slides, slides back out, pauses, and repeats
— on loop, indefinitely.

## What it does

- **Interviews you first** — whether your logo/image stays the same
  across every slide or changes per slide, how each slide's text should
  transition in (fade, slide, slide-up, slide-down, zoom, none, or
  random), how long each slide should stay on screen, how long the pause
  should be before it loops again, what each slide should say, and your
  brand colors/fonts if you have them (it'll read a brand kit if you
  provide one, rather than guessing).
- **Generates three files** — a self-contained HTML "engine" (no external
  dependencies besides an optional Google Fonts import), a `settings.js`
  file holding your actual content (editable as plain text, or as a
  structured list if slides need their own icons/images), and
  `editor.html`, a visual form for editing slides, timing, and transition
  style without touching code at all.
- **Fixed 640×220 size** on every campaign, so overlays stay visually
  consistent with each other over time.
- **Truly transparent background** — drops straight into OBS as a
  Browser Source, no green-screen chroma key needed.

## Usage

1. Install this skill into your Claude setup (skills directory, or via
   the Claude skill catalog if you're using Claude.ai/Claude Code).
2. Ask Claude something like: *"build me a stream popup ad for
   [brand/game/server]"*.
3. Answer the setup questions it asks.
4. In OBS: **Sources → + → Browser Source → check "Local file"** → point
   it at the generated `.html` file → set **Width: 640, Height: 220**.
5. Edit `settings.js` any time afterward to change text, timing, or
   colors — the HTML engine file shouldn't need touching again.

## File structure

```
pop-up-slide/
├── SKILL.md                        # the skill itself — interview + generation rules
├── assets/
│   ├── overlay-template.html       # generalized animation engine
│   ├── settings-template.js        # generalized settings/content template
│   └── editor-template.html        # visual slide editor, copied as-is per campaign
└── references/
    └── nerdybox-example.md         # a full worked example this skill was built from
```

## Example

`references/nerdybox-example.md` walks through a real campaign end to
end — including how it handled a provided brand kit, respected a brand
color with a reserved meaning, and picked a logo variant for legibility
at small size.

## License

Add whatever license fits your use — MIT is a common choice for a skill
like this if you're open to others reusing or modifying it.
