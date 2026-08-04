# Stream Popup Overlay — Setup & Customization Guide

## New: more transition options, plaintext editing, and a visual editor

Three additions this round:

**More transition styles.** `transitionStyle` in `settings.js` now
accepts `"fade"`, `"slide"`, `"slide-up"`, `"slide-down"`, `"zoom"`,
`"none"` (instant cut), or `"random"` (picks a different one every single
time a slide changes, not just once). Your real `settings.js` still
defaults to `"fade"`.

**Plaintext slide editing.** Instead of a JS array of `{ tag, text }`
objects, `settings.js` now defines slides as `messagesText` — literally
just a tag on one line, the text on the next, and a blank line between
slides:
```
WEB
TheNerdyBox.com

GAMES
We build indie games
```
No quotes, commas, or braces to get right. This only works for simple
text slides — if you ever want per-slide icons/images again, switch back
to the commented-out `messages` array method right below it in the file
(only one of the two should be active; if both are present, `messagesText`
wins).

**A visual editor — `editor.html`.** Open this file in Chrome or Edge
(not inside OBS — it's an editing tool, not part of the overlay) for a
form: add/remove slides, edit tag/text, pick a transition style, adjust
both timing values, and assign each slide its own icon — either a real
image file you provide, or one of the built-in placeholder platform icons
(Twitch, YouTube, TikTok, Kick, Trovo, X, Discord, Steam, Instagram,
Facebook).

Two things worth knowing about that last part:
- Those platform icons are generic placeholders (a colored circle with
  initials) — not the real logos. Recreating actual trademarked brand
  marks isn't something I'll do, even simplified. If you want the real
  Twitch/YouTube/etc. logo, download the official asset from that
  platform's own brand/press page and pick "Custom image file" in the
  editor instead, pointing at that file. Either way it renders at the
  same fixed size as your actual logo, so nothing breaks visually.
- Clicking "Save" can't silently overwrite `settings.js` — no local
  webpage can do that in any browser, for security reasons, regardless of
  how it's built. In Chrome or Edge, Save opens a save dialog you can
  point at your existing `settings.js` for what functions like a direct
  overwrite. In any other browser, Save downloads a new `settings.js`
  instead, which you then move into your popup folder yourself,
  replacing the old one — either way, you'll see which one happened.

I ran the editor through an actual functional test (not just a syntax
check) before sending it over: loaded your real settings.js into it,
added a slide, assigned it a placeholder Discord icon, removed a slide,
regenerated the file, and confirmed the result is valid and that
re-opening it in the editor correctly recognized the Discord icon it had
just saved.

## Bugfix: first slide wasn't showing its text

You caught a real bug — the WEB slide was blinking the logo and skipping
straight to GAMES. Here's what was actually happening, since you're
tracking the code:

The text panel's width starts at `0px` (so it's invisible during the
slide-in animation) and gets set to the *real* width once a message
opens — that's what `setMessage()` does, alongside setting the tag/text.
When I added the icon-swap feature, I accidentally changed the "open the
first message" step to call `setIcon()` instead of `setMessage()` — which
updates the icon, but never re-opens the panel's width. So the WEB text
was technically there, faded in and everything, just sitting inside a box
that was still `0px` wide. GAMES and SERVERS worked fine because the loop
that steps through them does call `setMessage()`, which was never broken.

Fixed by calling `setMessage()` for the first message too, in
`stream-popup-overlay.html`, `example-separate-images/`, and the skill's
`overlay-template.html` — all three had the same bug, since they all came
from the same code.

## What changed once you sent the brand kit

Your `brand.zip` had a README with real color and font tokens pulled from
your actual site's code — so this isn't guesswork anymore:

- **Logo:** using `logo.png` (the "monogram" mark from your kit), because
  your own README specifically flags it as the most legible option at
  small sizes. Your kit has four other directions (escape, breakout,
  bracket, scale) if you'd rather use one of those instead — just drop a
  different file into the folder and rename it to `logo.png`.
- **Colors:** violet `#7c5cff`, void `#0a0a12`, ink `#f2f1f9`, and a soft
  violet `#a594ff` for the small tag label — all straight from your
  README's token table.
- **Fonts:** Bricolage Grotesque (your display face) for the big message
  line, JetBrains Mono (your labels/status face) for the small tag.
- **Two colors on purpose left out:** your README says coral is
  "reserved for the escaping block, never decorative" — so it only shows
  up inside `logo.png` itself, nowhere else. And "live" green means "a
  server is actually up, and nothing else" — since this badge doesn't
  check real server status, using that green for a decorative pulse would
  misuse it, so the pulsing ring stayed violet instead.

I also didn't see an exact website domain in the brand kit, so I used
`TheNerdyBox.com` as a placeholder in the first message — double check that's
actually your domain and update `settings.js` if not (see below for where).

## Back to a static logo (this campaign only promotes NerdyBox)

The per-slide icon swapping from the last round has been removed from
`settings.js` — none of the three messages have an `icon` field anymore,
which is genuinely the entire change needed. The engine
(`stream-popup-overlay.html`) already falls back to showing the logo
whenever a message doesn't specify its own icon/image, so removing those
fields was enough to make the logo static across all three slides again.
No HTML editing was needed for this.

## Exactly which settings control the two delays you asked about

Both live in the `timing` block in `settings.js`:

| What you want to control | Field |
|---|---|
| **Each slide's own pause** — how long a single slide stays fully visible before the next one takes over | `perMessageHold` |
| **The delay at the end before it repeats** — the blank gap after the badge has fully slid off-screen, before it slides back in and starts the loop over | `slideOutPause` |

One nuance worth knowing: there's also `holdBeforeSlideOut` (a short beat
after the last slide closes but *before* the slide-out motion starts) —
that's technically part of the "ending" sequence too, but it's a small
fixed beat rather than the actual repeat delay. If you want a longer
pause specifically once everything is gone and blank, `slideOutPause` is
the one to change.

## Two more things from this round

**Static logo vs. per-slide images/thumbnails example**: since this
campaign uses one static logo, I put together a separate example showing
the other approach — each slide with its own image — in its own folder
(`example-separate-images/`) so it doesn't touch your real files. It uses
three other logo directions from your brand kit as stand-in thumbnails.
Swap in your own PNGs and it works the same way.

**The reusable skill**: everything above (interview questions, generation
rules, the 640×220 sizing convention, the timing-field reference table)
is now packaged as a Claude skill called `pop-up-slide`
(`pop-up-slide-skill.zip`). Running it again for a future campaign will
walk through the same setup questions you asked for, generate a fresh
two-file overlay, and keep every future one the same size as this one.

## The icon-sheet.png + dataValues.js you sent later

Once you sent those two files, the original mechanic became clear: the
Nerd or Die popup steps through a matched pair — icon #1 with value #1,
icon #2 with value #2, etc. — then goes blank and repeats. Your
`icon-sheet.png` was a 120×480 sprite sheet (four 120×120 icons stacked:
Twitch, Twitter, YouTube, Steam), sliced via CSS and stepped in lockstep
with the four `"example"` entries in `dataValues.js`.

I built the same pairing into `settings.js`, but as small inline icons
written directly in that file instead of a separate sprite-sheet image —
one less file, and it keeps with the "all built in together" style you
said you liked. Each message now has its own `icon`, and the badge shows
that icon while the message is on screen, then reverts to your logo while
it's closed/idle between loops.

If you'd rather use actual platform icons (like the ones in the sheet you
sent) instead of the generic web/games/servers icons I wrote, that's a
straightforward swap — say which platforms and I'll build those into
`settings.js` the same way.

## What this actually is (vs. the Nerd or Die pack)

Worth clearing up first: the Nerd or Die zip you sent isn't actually PNG
frames + a JSON timing file. It's an **HTML/CSS/JavaScript page** that OBS
loads as a "Browser Source" — the animation (a shape morphing and sliding)
is drawn live by code using a library called GSAP, not played back from
images. The `settings-and-images` folder was empty because that's normally
generated by Nerd or Die's own online configurator tool, not included in
a template you download standalone.

I built `stream-popup-overlay.html` the same way — one self-contained file,
no external image sequence to manage — which is genuinely the better
approach for a stream overlay:

| | HTML/CSS overlay (what you have now) | PNG sequence / GIF |
|---|---|---|
| Sharpness | Perfect at any resolution | Blurs if scaled |
| Transparency | Real alpha transparency | Needs care to avoid a background box |
| Editing text/colors | Change a couple of lines | Re-export every frame |
| File size | ~2 KB | Can be several MB |

That's also why I didn't reach for the Slack GIF-maker skill you mentioned —
that tool is built for Slack's specific size/frame-count limits and outputs
a baked GIF, which would give up the crispness and easy editing above for
no benefit on a stream.

If you *do* want an actual exported video/GIF of this (e.g., to post as a
clip on TikTok separately from your live overlay), tell me and I can render
one — just flagging that for the live stream overlay itself, the HTML
version is the right tool.

## One thing I still need from you

You mentioned a logo was attached, but only the Nerd or Die zip came
through — no image file. I used a placeholder gamepad icon so you have
something working right now. Send the logo (PNG with a transparent
background works best) and I'll swap it in, or you can do it yourself —
instructions below.

## Two files now, like the Nerd or Die setup

There are two files:
- **`stream-popup-overlay.html`** — the animation code. You shouldn't need
  to open this one.
- **`settings.js`** — your messages, colors, and timing. This is the one
  you'll edit, the same way you'd edit Nerd or Die's `settings.js`/
  `dataValues.js` files.

**They must stay in the same folder together** — the HTML file loads
settings.js by name, so if you move one without the other, the overlay
won't know what to display.

(Quick technical note if you're curious why it's `.js` and not `.json`:
Nerd or Die's pack also uses `.js`, not `.json`, for the same reason I did —
a browser loading local files directly, like OBS does, is often blocked
from *fetching* a `.json` file via JavaScript for security reasons. Loading
a `.js` file as a `<script>` tag avoids that restriction entirely, so it's
the more reliable choice here, not just a style preference.)

## How to use this in OBS (step by step)

1. Save both `stream-popup-overlay.html` **and** `settings.js` in the same
   folder somewhere permanent — e.g. inside your `Stream Projects` folder
   on your PC.
2. In OBS: **Sources → + → Browser Source**.
3. Check **"Local file"**, then click **Browse** and select the `.html` file.
4. Set **Width: 640**, **Height: 220** (a little bigger than the badge
   itself is fine — it needs room to slide across).
5. Leave **"Shutdown source when not visible"** unchecked and **"Refresh
   browser when scene becomes active"** unchecked, so the animation loop
   doesn't restart every time you switch scenes.
6. Click OK. It'll immediately start looping: slide in → cycle through your
   three messages → slide out → pause → repeat.

Since this is just a Browser Source inside OBS, it works identically no
matter which platform you're pushing the OBS output to (Twitch, TikTok LIVE
via OBS, Kick, Trovo, YouTube) — the overlay doesn't know or care which
platform it's streaming to.

## How to customize it yourself

Open **`settings.js`** in any text editor (Notepad is fine, or VS Code if
you have it) — that's the whole file, no need to hunt through code, it's
just your messages, timing, and colors with comments explaining each one.

**Change the messages:**
```js
messages: [
  { tag: "WEB",     text: "TheNerdyBox.com",                icon: "..." },
  { tag: "GAMES",   text: "We build indie games",         icon: "..." },
  { tag: "SERVERS", text: "Game servers, always online",  icon: "..." }
]
```
Edit the `tag`/`text` between the quotes freely — `tag` is the small caps
label above the message (keep it short, 1-2 words); `text` is the big
line underneath. You can add a fourth message by copying one of these
lines and adding a comma, or delete one — the animation automatically
adjusts to however many messages are in the list.

**Changing an icon** takes a bit more care since `icon` is a snippet of
SVG code, not plain text. Safest approach: leave the actual icon shapes
alone and just reorder which icon goes with which message — copy an
entire `icon: '...'` line from one message to another. If you want a
genuinely different icon, tell me what you want it to look like and I'll
write the SVG for that message rather than you hand-editing path code. If
you delete `icon` from a message entirely (or set it to `null`), that
message will just show your logo instead — no icon swap, always safe.

**Change the timing** (how long things stay on screen), a bit further down
in the same `CONFIG` block:
```js
timing: {
  perMessageHold: 2600,   // milliseconds each message is fully visible
  ...
}
```
1000 = 1 second. Bump `perMessageHold` up if you want people more time to
read each line.

**Change the colors:** still in `settings.js`, find the `colors` block near
the bottom:
```js
colors: {
  bgCharcoal:    "#15161c",
  accentViolet:  "#7c5cff",
  accentCyan:    "#35e6c4",
  textLight:     "#f5f5fa",
  textDim:       "#9a9bab",
}
```
These five hex codes control the whole badge's palette. If you want to
match your brand colors exactly, just replace the hex values — a color
picker tool (search "hex color picker") will help you find the exact code
for a color you already use in your logo.

**Using a different logo direction:** your real logo is already wired in
(that's `logo.png`, sitting next to the HTML file) — this section is only
if you want to swap it for one of the other four directions in your brand
kit. Just rename whichever file you want (e.g.
`logos/escape/nerdybox-escape-mark-on-dark.png`) to `logo.png` and drop it
in the same folder, replacing the current one. No code editing needed —
the `<img src="logo.png">` tag in the HTML just points at that filename.

## A note on the file location you mentioned

I don't have direct access to your Windows machine or that
`Stream Projects` folder — I built these files in my own workspace here.
Once you download them from this chat, move or save them into that folder
yourself and OBS will pick them up from there.
