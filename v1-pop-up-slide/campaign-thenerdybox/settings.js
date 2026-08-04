/* ============================================================================
   OVERLAY SETTINGS
   ============================================================================
   This is the only file you should need to touch for day-to-day changes —
   your messages, icons, colors, and timing. The other file
   (stream-popup-overlay.html) has the animation code and shouldn't need
   editing.

   IMPORTANT: keep this file in the same folder as stream-popup-overlay.html,
   and keep the filename "settings.js" — the HTML file loads it by name.

   HOW THIS RELATES TO THE ORIGINAL NERD OR DIE FILES YOU SENT:
   Their icon-sheet.png + dataValues.js work as a matched pair — icon #1 in
   the sheet shows alongside value #1 in the array, and so on. The engine
   (stream-popup-overlay.html) supports that same per-message icon pairing —
   each message CAN carry its own "icon" or "image" field, using the
   "messages" array method (commented out below). This campaign doesn't
   use that: since every slide here is promoting the one brand, the logo
   should stay the same the whole time, so slides are defined with the
   simpler "messagesText" plaintext method instead — no icon/image field
   exists in that method at all, so the engine's fallback just keeps
   showing logo.png throughout automatically.
   (If you ever want per-slide icons back for THIS file, switch to the
   "messages" array method — see the SLIDES section below for both, and
   the separate example files for a working per-slide-image reference.)

   The colors below are pulled directly from your brand.zip README (the
   real tokens from your site's globals.css), not guesses. Two of them come
   with a rule attached, straight from that README:
     - coral (#ff6b4a) is "reserved for the escaping block, never decorative"
       — it only appears inside logo.png itself, nowhere else in this file.
     - live (#3ddc84) "means a server is up, and nothing else" — since this
       badge doesn't check real server status, it's included below but left
       unused in the overlay for now. Wire it up if you ever want the pulse
       ring to reflect an actual uptime check instead of just animating.
   ========================================================================= */

const CONFIG = {

  // ---- SLIDES -----------------------------------------------------------
  // Two ways to define your slides — use ONE of them, not both:
  //
  // METHOD 1: "messagesText" — plain text, no code syntax at all. Each
  // slide is just two lines (a short caps tag, then the main text), with
  // a BLANK LINE between slides. This is the easiest way to edit slides
  // by hand — no quotes, no commas, no curly braces to get right. The
  // trade-off: this method can't give a slide its own icon/image — every
  // slide just shows the logo. This is what's actually active below.
  //
  // METHOD 2: "messages" — the structured array (commented out below).
  // Use this instead if you want per-slide icons/images (like the
  // separate-images example), since plain text can't express that. If
  // you switch to this method, delete/comment out "messagesText" above
  // it — if both are present, messagesText always wins.
  messagesText: `
WEB
TheNerdyBox.com

GAMES
We build indie games

SERVERS
Game servers, always online
`,

  // messages: [
  //   { tag: "WEB",     text: "TheNerdyBox.com" },
  //   { tag: "GAMES",   text: "We build indie games" },
  //   { tag: "SERVERS", text: "Game servers, always online" }
  // ],

  // ---- MESSAGE TRANSITION STYLE -----------------------------------------
  // How each slide's text arrives when swapping to the next message
  // (this is separate from the badge's own slide-in/out at the very start
  // and end of the loop — this only affects swapping WHILE the badge is
  // already open). All available options — change the value below to
  // any ONE of these exact strings:
  //
  //   "fade"        -> text barely moves, just crossfades in place
  //   "slide"       -> text slides in sideways (from the right)
  //   "slide-up"    -> text slides in from below
  //   "slide-down"  -> text slides in from above
  //   "zoom"        -> text scales up from slightly smaller, while fading
  //   "none"        -> instant cut, no animation at all
  //   "random"      -> picks a different one of the above, at random,
  //                    every single time a slide changes
  //
  // Every option shares the same code — nothing else needs to change here
  // or in stream-popup-overlay.html. To fine-tune the distance/scale a
  // style uses, that's set in stream-popup-overlay.html — search for
  // "TRANSITION_STYLES".
  transitionStyle: "fade",   // <- change to "slide/slide-up/slide-down/zoom/none/random" to switch

  // ---- TIMING (all in milliseconds — 1000 = 1 second) -----------------
  timing: {
    holdBeforeOpening:  350,  // pause after sliding in, before text opens
    textOpenDuration:    450, // how long the text panel takes to open
    perMessageHold:      2600,// how long each message stays fully visible
    swapFade:            260,// fade time when switching between messages
    holdBeforeSlideOut:  400,// pause after last message, before sliding out
    slideOutPause:       500,// extra pause once hidden before it repeats
  },

  // ---- COLORS -----------------------------------------------------------
  // Pulled from your brand.zip README:
  colors: {
    void:        "#0a0a12", // background — the site's --void
    violet:      "#7c5cff", // the brand — frames, the mark, primary accent
    violetSoft:  "#a594ff", // secondary violet — used for the eyebrow/tag text
    ink:         "#f2f1f9", // primary text
    mute:        "#918eae", // supporting/secondary text
    // coral (#ff6b4a) and live (#3ddc84) intentionally not used here — see
    // the note at the top of this file for why.
  }

};
