/* ============================================================================
   EXAMPLE: settings.js using a different IMAGE per slide (not the logo)
   ============================================================================
   This is a reference example, not something wired into your live campaign.
   To try it: copy this file into the same folder as stream-popup-overlay.html,
   rename it to "settings.js" (backing up your real one first), and make sure
   thumb-web.png / thumb-games.png / thumb-servers.png are in that same folder
   too. Reload the page and each slide will show its own thumbnail instead of
   the logo.

   HOW THIS WORKS:
   Each message below has an "image" field pointing at a real PNG file,
   instead of no icon field at all (which is what your real settings.js
   does, to keep the logo static). The engine checks for "image" first —
   see setIcon() in stream-popup-overlay.html — so as soon as a message
   has one, that file shows instead of the logo, for as long as that
   message is on screen. When the badge closes and goes blank, it always
   reverts to the logo either way, image or no image.

   These three thumbnails are just other directions from your own brand
   kit (escape, breakout, bracket) standing in as example thumbnails —
   swap them for your own PNGs whenever you actually have per-slide
   images to use, just keep the filenames matching what's below (or
   change the "image" paths to match your files).
   ========================================================================= */

const CONFIG = {

  // This example uses "random" so you can see multiple transition styles
  // in action without needing to keep changing this value yourself — it
  // picks a different one every time a slide changes. Your real
  // settings.js still defaults to "fade". All options (see
  // stream-popup-overlay.html's "TRANSITION STYLE" comment block for how
  // they work): "fade", "slide", "slide-up", "slide-down", "zoom",
  // "none", "random".
  transitionStyle: "random",

  messages: [
    { tag: "WEB",     text: "TheNerdyBox.com",                image: "thumb-web.png" },
    { tag: "GAMES",   text: "We build indie games",         image: "thumb-games.png" },
    { tag: "SERVERS", text: "Game servers, always online",  image: "thumb-servers.png" }
  ],

  timing: {
    holdBeforeOpening:  350,
    textOpenDuration:    450,
    perMessageHold:      2600,
    swapFade:            260,
    holdBeforeSlideOut:  400,
    slideOutPause:       500,
  },

  colors: {
    void:        "#0a0a12",
    violet:      "#7c5cff",
    violetSoft:  "#a594ff",
    ink:         "#f2f1f9",
    mute:        "#918eae",
  }

};
