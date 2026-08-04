---
name: pop-up-slide
description: Creates an animated slide-in popup/badge overlay (self-contained HTML + settings.js, always sized 640x220 for OBS Browser Source) used to advertise a website, brand, game, server, or campaign on a livestream. Always use this skill whenever the user asks to build a "stream popup", "popup slide", "ad slide", "promo overlay", "badge overlay", "stinger-style ad", or any recurring campaign overlay meant for OBS, Twitch, TikTok, Kick, Trovo, or YouTube. Before writing any code, interview the user: whether the logo/image stays the same across every slide or changes per slide, how long each slide displays, how long the pause is before the loop repeats, what each slide should say, and whether real brand colors/fonts/logo files are available to use instead of invented ones.
---

# Pop Up Slide

Produces a small animated badge that slides in from a corner of the
screen, cycles through one or more "slides" (a short tag + a line of
text, optionally its own icon or image), then slides back out, goes
blank for a set pause, and repeats — forever, on loop, as an OBS Browser
Source.

This skill was built from a real campaign (see the worked example in
`references/nerdybox-example.md`) — read that file if you want to see
exactly what a finished settings.js/HTML pair looks like before
generating a new one.

## Fixed conventions — apply these silently, don't ask about them

- **Size: always 640×220.** Every campaign built with this skill uses
  this exact size, so overlays stay visually consistent with each other
  across campaigns. Never ask the user about dimensions; never vary this.
- **Always exactly three files per campaign**: the engine
  (`stream-popup-overlay.html`, copied from `assets/overlay-template.html`
  with minimal edits), the content file (`settings.js`, copied from
  `assets/settings-template.js` and fully filled in), and the visual
  editor (`editor.html`, copied from `assets/editor-template.html`
  **unmodified** — it reads `settings.js` at runtime, so it never needs
  per-campaign edits). Never merge these, and never split the content
  across more than one file.
- **Badge position: bottom-right corner** of the OBS scene, unless the
  user asks for a different corner.
- **Transparent background always** — never let `html`/`body` end up with
  a background color, or OBS will show a solid box instead of an overlay.
- **Don't redraw real platform logos.** `editor-template.html` ships with
  generic placeholder icons (colored circle + initials) for common
  platforms, clearly labeled as placeholders — never replace these with
  attempted recreations of actual trademarked logos (Twitch, YouTube,
  TikTok, Discord, etc.). If a user wants the real logo, tell them to
  download the official asset from that platform's own brand/press page
  and use the editor's "Custom image file" option instead.

## Step 1: Interview the user

Ask before writing any code. Batch the free-text/numeric questions
together in one message rather than one at a time. Use `ask_user_input_v0`
only for the one genuinely either/or question (logo behavior) — the rest
need actual text/number answers, which that tool isn't built for.

1. **Logo/image behavior, transition style, AND editing method** — ask
   together in a single `ask_user_input_v0` call (it supports up to 3
   questions at once; these are the genuinely either/or ones):
   - *Logo/image*: "Same image every slide" / "Different image per slide"
     - If "different per slide": ask what should appear on each slide —
       do they have real image files to use, a preference for the
       editor's built-in placeholder platform icons (Twitch, YouTube,
       TikTok, Kick, Trovo, X, Discord, Steam, Instagram, Facebook), or
       should Claude draw simple inline line-icons per slide instead?
   - *Text transition*: give 4 options that cover the space well —
     "Fade" / "Slide" / "Zoom" / "Random" (the full set also includes
     "slide-up", "slide-down", and "none" — mention in the question text
     that they can just ask by name for one of those instead if they
     want it, since the button only fits 4 choices).
   - *How they'd rather edit slides later*: "Plain text" (the
     `messagesText` method — quick to hand-edit, no per-slide
     icons/images possible) / "Use the visual editor" (the `editor.html`
     form — supports per-slide icons/images, no code editing at all).
     Note: if "different per slide" was chosen above, plain text isn't
     actually an option (it can't express icons/images) — skip asking
     this one and just use the structured `messages` array method,
     editable via `editor.html`.
2. **Slide content**: how many slides, and for each one, a short tag
   label (1-2 words, e.g. "WEB") and the main line of text.
3. **Timing**:
   - How long should each slide stay on screen? → sets `perMessageHold`
   - How long should the pause be after the badge fully disappears,
     before it slides back in and starts over? → sets `slideOutPause`
4. **Brand assets**: do they have brand colors/fonts, a logo file, or a
   brand kit (zip) to reference? If yes, ask them to send it and pull the
   *real* tokens from it (look for a README or a stylesheet with actual
   hex/font values — don't invent colors if real ones exist to find). If
   no brand kit exists, ask for at least a logo file, and choose a
   deliberate, non-generic color palette and font pairing suited to the
   content — check `/mnt/skills/public/frontend-design/SKILL.md` before
   picking colors/fonts from scratch, to avoid defaulting to a cliché
   AI-generated look.
5. **Anything else pertinent worth surfacing**:
   - A different corner than bottom-right?
   - Does any brand color have a reserved/specific meaning (the way one
     past campaign's green specifically meant "server is live, nothing
     else")? If so, don't use that color for unrelated decoration
     anywhere in the build — pick a neutral accent instead.
   - If this is a re-run for an existing brand already built with this
     skill before, ask whether to reuse that brand's existing
     colors/fonts/logo rather than re-deriving them.

Don't ask about overlay size — it's always 640×220, applied silently.

## Step 2: Generate the files

1. Copy `assets/overlay-template.html` → `stream-popup-overlay.html`,
   `assets/settings-template.js` → `settings.js`, and
   `assets/editor-template.html` → `editor.html` (unmodified) into a
   fresh output folder for this campaign.
2. Fill in `settings.js` completely from the interview answers:
   - **Static logo across all slides** → use the `messagesText` plaintext
     method: a simple template-literal block, tag on one line, text on
     the next, a blank line between slides. No icon/image is possible in
     this method, which is exactly right here — the engine's fallback
     already shows the logo throughout whenever a slide has no icon/image,
     and plaintext slides never have one.
   - **Different image per slide** → use the structured `messages` array
     method instead (comment out or omit `messagesText` — if both are
     present, `messagesText` wins, so don't leave a stray one behind).
     Give each message either an `image` field (a real file path, if the
     user supplied image files or picked a placeholder platform icon —
     see below) or an `icon` field (inline SVG path markup,
     `viewBox="0 0 24 24"`) if they want simple drawn icons instead.
     Don't mix both fields on the same message.
     - If the user picked one of the placeholder platform icons, use the
       exact same generic circle+initials SVG pattern
       `editor-template.html` generates (see its `PLATFORM_ICONS`/
       `platformIconSvg()` for the exact markup and colors per platform)
       so the result matches what the visual editor would also produce —
       don't invent different placeholder art.
   - `timing.perMessageHold`: from the "how long per slide" answer
     (convert seconds to milliseconds: seconds × 1000).
   - `timing.slideOutPause`: from the "pause before repeat" answer (same
     conversion). Leave `holdBeforeOpening`, `textOpenDuration`,
     `swapFade`, and `holdBeforeSlideOut` at the template's defaults
     unless the user specifically asks to change pacing beyond the two
     values above.
   - `transitionStyle`: one of `"fade"`, `"slide"`, `"slide-up"`,
     `"slide-down"`, `"zoom"`, `"none"`, or `"random"` — directly from the
     interview answer. Never leave the template's `REPLACE_ME` placeholder
     in delivered output.
   - `colors`: real brand tokens if available, otherwise a deliberately
     chosen palette (never leave `#REPLACE_ME` placeholders in delivered
     output).
3. In `stream-popup-overlay.html`, only the font `@import` line and the
   `font-family` values in `.msg-tag`/`.msg-text` typically need editing
   (to match real brand fonts) — the CSS variable *names* don't need to
   change, only their fallback hex values if you want the file to look
   right even before JS runs. The animation/engine JavaScript should not
   need edits.
4. Copy any logo/thumbnail image files the user provided into the same
   output folder as the three files above.
5. Before presenting: search the delivered files for leftover template
   placeholders (`REPLACE_ME`, `REPLACE_ME_TAG`, etc.) — none should
   remain. This skill's output is sometimes published publicly (e.g. to a
   GitHub repo), so double-check for clean, consistent comments and no
   template artifacts before calling this done.
6. Present the files with `present_files`. Briefly summarize what was set
   from the interview (slide count/content, timing values in seconds,
   logo behavior, transition style, whether real brand colors were used
   or chosen fresh), remind the user OBS Browser Source should be set to
   640×220 with "Local file" pointed at the `.html` file, and mention
   `editor.html` as a way to make future changes through a form instead
   of hand-editing `settings.js` (best opened in Chrome or Edge, not
   inside OBS itself).

## Reference: what each timing field actually controls

Be precise about this if the user asks — this exact distinction has
caused confusion before:

| Field | What it controls |
|---|---|
| `perMessageHold` | How long **each individual slide** stays fully visible before the next one swaps in. The "how long does each slide play" duration. |
| `slideOutPause` | The pure blank/idle gap **after the badge has fully slid off-screen**, before the next loop starts sliding back in. The "delay before it repeats." |
| `holdBeforeSlideOut` | A short beat after the last slide closes but before the slide-out motion itself begins — separate from `slideOutPause`, usually left at its default. |
| `holdBeforeOpening` | A short beat after sliding in but before the first slide's text opens — cosmetic pacing, usually left at its default. |
| `textOpenDuration` / `swapFade` | Animation speeds for the open/close and message-swap transitions themselves — not pauses at all. |

## Reference: editor.html's save behavior

Worth knowing if a user asks why "Save" doesn't just silently overwrite
the file: no local webpage can do that in any browser, for security
reasons — it's not a limitation specific to this tool. `editor.html`
does the best available thing: it tries the File System Access API
(`showSaveFilePicker`, supported in desktop Chrome/Edge) for something
that functions like a real overwrite via a save dialog, and falls back to
a plain download otherwise, which the user then moves into place
manually. Don't imply a more automatic mechanism exists than this.

## Reference files

- `references/nerdybox-example.md` — a real finished example (content,
  reasoning, and full file listing) from the campaign this skill was
  built from. Read it if you want a concrete before/after to model a new
  campaign on, especially for how to handle a provided brand kit.
- `assets/editor-template.html` — the visual slide editor, copied
  unmodified into every campaign. Contains `PLATFORM_ICONS`, the
  placeholder-icon generator, and the save logic described above.
