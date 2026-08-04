# Worked example: NerdyBox

This is the campaign this skill was extracted from — a real finished
result, kept here as a concrete reference.

## Interview answers (reconstructed)

- **Logo behavior**: static logo across every slide (this campaign only
  ever promotes the one brand, so the logo never changes).
- **Slides** (3):
  1. tag `WEB`, text `TheNerdyBox.com`
  2. tag `GAMES`, text `We build indie games`
  3. tag `SERVERS`, text `Game servers, always online`
- **Timing**: ~2.6s per slide, ~0.5s pause before the loop repeats.
- **Brand assets**: a full brand kit was provided as a zip containing a
  README with real color tokens, font names, and five logo directions
  (escape, breakout, bracket, scale, monogram) each in multiple lockups
  and colorways.

## How the brand kit was handled

The README documented tokens straight from the brand's own site CSS:

| Token | Value | Role |
|---|---|---|
| violet | `#7c5cff` | Primary accent — frames, the mark |
| violet-soft | `#a594ff` | Secondary accent — eyebrow/label text |
| void | `#0a0a12` | Background |
| ink | `#f2f1f9` | Primary text |
| mute | `#918eae` | Supporting text |
| coral | `#ff6b4a` | **Reserved** — "the escaping block, never decorative" |
| live | `#3ddc84` | **Reserved** — "means a server is up, and nothing else" |

Two of those tokens (coral, live) had a stated reserved meaning. The
build respected that: coral only appears inside the logo file itself
(never used decoratively elsewhere), and the "live" green was left
entirely unused, since the overlay's pulsing ring is just ambient motion,
not a real uptime check — using that green for it would have misused a
color the brand explicitly reserved for something specific.

The README also explicitly said the "monogram" logo direction is "the
most legible when tiny" — so that's the one used for the icon box, over
the other four available directions. This was verified before committing
to it: all five directions were rendered at actual icon-box size (~64px)
side by side to confirm monogram was clearly the most readable at that
size before picking it.

Fonts came straight from the README too: Bricolage Grotesque (display) for
the message line, JetBrains Mono (labels/status) for the tag, Inter as
the base — not invented substitutes.

## Files delivered

- `stream-popup-overlay.html` — the engine (this skill's
  `overlay-template.html` is the generalized version of this file).
- `settings.js` — messages (no `icon`/`image` fields at all, since the
  logo stays static), timing, and the real brand colors above.
- `logo.png` — the monogram mark, extracted from the provided brand kit.

## A separate-images variant was also produced

For reference (not used in the live campaign, since this one uses a
static logo), an example was also built showing the *other* mode — each
slide with its own `image` field pointing at a distinct thumbnail file,
using three of the other logo directions from the same brand kit as
stand-in thumbnails. That's the pattern to reach for whenever an
interview answer comes back "different image per slide" instead of
"same image every slide."

## Lesson worth carrying forward

A sequencing bug showed up during development: the icon briefly flashed
the wrong image during the slide-in animation, because the code called
`setMessage()` (which sets the icon to match that message) and only
*afterward* called `setIcon(null)` to reset to the idle logo — meaning
the override arrived a beat too late. The fix was ordering it the other
way: set the message first, then immediately override the icon back to
idle, before anything becomes visible. Worth double-checking this exact
ordering any time the idle-state override logic is touched.

## Later additions to this campaign (now part of the skill)

After the initial build, this same campaign got three more features,
which is why the skill now includes them by default:

- **More transition styles** — `fade`/`slide` grew into `fade`, `slide`,
  `slide-up`, `slide-down`, `zoom`, `none`, and `random` (re-rolls a
  different style every single swap). All share the same underlying
  mechanism — one CSS variable holding a transform, one JS lookup table.
- **Plaintext slide editing** — realizing that hand-editing a JS array of
  objects is more syntax than someone should need for "just change what
  three lines of text say," `messagesText` was added as an alternative to
  the structured `messages` array: literally just tag/text pairs
  separated by blank lines, no braces or quotes required. This campaign's
  real `settings.js` uses this method, since it never needed per-slide
  icons anyway.
- **A visual editor (`editor.html`)** — a form-based alternative to
  editing either file format directly: add/remove slides, change text,
  pick a transition style, adjust timing, and assign a per-slide icon
  (including generic placeholder icons for common streaming/social
  platforms — not real trademarked logos, see the notice inside that file
  for why) — all through inputs and dropdowns. Saving either overwrites
  the existing settings.js directly (via the File System Access API,
  where the browser supports it) or downloads a replacement file to move
  into place manually — no browser can silently overwrite a local file
  for security reasons, so that fallback exists everywhere.
