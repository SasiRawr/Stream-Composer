/* ============================================================================
   SETTINGS TEMPLATE — for the "pop-up-slide" skill
   ============================================================================
   This is a template file. When generating a real campaign, replace every
   value below based on the interview answers, then save the result as
   "settings.js" alongside a copy of overlay-template.html (renamed to
   stream-popup-overlay.html) AND a copy of editor-template.html (renamed
   to editor.html, left unmodified) in the campaign's own output folder.

   REMINDERS FOR WHOEVER (Claude) IS FILLING THIS IN:
     - Three files per campaign, never merged: the engine (overlay html),
       this settings file, and editor.html.
     - Overlay size is always 640×220 in OBS — do not vary this by campaign.
     - Static logo across all slides → use "messagesText" (the plaintext
       block below). No icon/image is possible in this method, which is
       correct here — the engine's fallback already shows the logo
       throughout whenever a slide has no icon/image.
     - Different image/icon per slide → use "messages" (the structured
       array, commented out below) instead, and remove/comment out
       "messagesText" — if both are present, messagesText always wins, so
       don't leave a stray one active by accident. Give each message
       either an "image" (a real file path) or an "icon" (inline SVG path
       markup, viewBox 0 0 24 24, stroke drawn in currentColor) — not both.
       If the user picked one of editor-template.html's placeholder
       platform icons, reuse its exact PLATFORM_ICONS markup/colors rather
       than inventing different placeholder art.
     - If the user has real brand colors/fonts, use those exact values, not
       invented ones. If a color has a stated reserved meaning (e.g. "this
       green means the server is live, nothing else"), do not use that
       color for unrelated decoration — pick a neutral accent instead.
     - Double check every placeholder below has been replaced before
       delivering — no literal "REPLACE_ME" text should remain in output.
   ========================================================================= */

const CONFIG = {

  // ---- SLIDES -------------------------------------------------------
  // Use ONE of these two, matching the interview answer:
  //
  // Static logo across all slides -> messagesText (plaintext, active below):
  messagesText: `
REPLACE_ME_TAG_1
REPLACE_ME_TEXT_1

REPLACE_ME_TAG_2
REPLACE_ME_TEXT_2
`,

  // Different image/icon per slide -> messages (structured array instead):
  // messages: [
  //   { tag: "REPLACE_ME_TAG_1", text: "REPLACE_ME_TEXT_1" },
  //   { tag: "REPLACE_ME_TAG_2", text: "REPLACE_ME_TEXT_2" }
  // ],

  // ---- MESSAGE TRANSITION STYLE -----------------------------------------
  // How each slide's text arrives when swapping to the next message (not
  // the badge's own slide-in/out at the very start/end of the loop — this
  // is only the swap WHILE the badge is already open). Set from the
  // interview answer, one of these exact strings:
  //   "fade"        -> text barely moves, just crossfades in place
  //   "slide"       -> text slides in sideways (from the right)
  //   "slide-up"    -> text slides in from below
  //   "slide-down"  -> text slides in from above
  //   "zoom"        -> text scales up from slightly smaller, while fading
  //   "none"        -> instant cut, no animation at all
  //   "random"      -> picks a different one of the above every swap
  // All share the same code — only this string changes which runs.
  // Fine-tuning distances lives in stream-popup-overlay.html, under
  // "TRANSITION_STYLES" — leave that alone unless asked to adjust it.
  transitionStyle: "REPLACE_ME_transition_style",

  // ---- TIMING (all in milliseconds — 1000 = 1 second) -----------------
  // See the skill's SKILL.md for a full explanation of what each field
  // controls — the short version:
  //   perMessageHold     -> how long EACH slide stays visible
  //   slideOutPause      -> the blank gap AFTER sliding out, before repeat
  //   holdBeforeSlideOut -> short beat before the slide-out motion starts
  //   holdBeforeOpening  -> short beat before the first slide's text opens
  //   textOpenDuration / swapFade -> animation speeds, not pauses
  timing: {
    holdBeforeOpening:  350,
    textOpenDuration:    450,
    perMessageHold:      2600,  // <- set from interview answer: seconds per slide
    swapFade:            260,
    holdBeforeSlideOut:  400,
    slideOutPause:       500,   // <- set from interview answer: pause before repeat
  },

  // ---- COLORS -----------------------------------------------------------
  // Use real brand tokens if the user provided them. Otherwise pick a
  // deliberate, non-generic palette suited to the content — check
  // /mnt/skills/public/frontend-design/SKILL.md for guidance rather than
  // defaulting to a cliché AI palette.
  colors: {
    bg:          "#REPLACE_ME", // badge background
    accent:      "#REPLACE_ME", // primary accent (icon ring, tag label base)
    accentSoft:  "#REPLACE_ME", // secondary accent (tag label color)
    ink:         "#REPLACE_ME", // main text color
    mute:        "#REPLACE_ME", // supporting/secondary text
  }

};

