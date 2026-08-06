// ============================================================================
// POPUP-SLIDE ANIMATION ENGINE — the actual runtime behavior baked into
// scene.html's <script> block for every popup-slide item: slide in, cycle
// through messages, slide out, repeat. One instance of this per popup-slide
// item, scoped to that item's own element ids so multiple items in one scene
// don't collide (see bake.js's renderPopupSlideItem for the matching HTML).
//
// This is the ONE source of truth for the popup-slide animation as of the
// v1.0.0 merge — it replaces the standalone Popup Slide Editor's
// stream-popup-overlay.html engine, which is now kept only as a legacy
// IMPORT input (see popup-slide-import.js), not maintained as an output
// format. Previously this logic lived inline as a template-literal string
// inside bake.js; extracted here as real, readable, parameterized code.
//
// Pure string-building only (no DOM here — this function generates code
// that runs inside the baked scene.html later; it doesn't touch the
// editor's own DOM).
// ============================================================================

/**
 * @param {string} instanceId - unique per-item element id prefix.
 * @param {Array<{tag:string, text:string, iconType:'none'|'svg'|'image', iconSvg?:string, iconSrc?:string}>} slides
 * @param {{holdBeforeOpening:number, textOpenDuration:number, perMessageHold:number, swapFade:number, holdBeforeSlideOut:number, slideOutPause:number}} timing
 * @param {string} transitionStyle - fade | slide | slide-up | slide-down | zoom | none | random
 * @returns {string} a self-executing <script> body, ready to inline into scene.html.
 */
export function buildPopupSlideScript(instanceId, slides, timing, transitionStyle) {
  return `
(function () {
  const SLIDES = ${JSON.stringify(slides)};
  const TIMING = ${JSON.stringify(timing)};
  const TRANSITION_STYLES = {
    'fade': { transform: 'translate(0px, 4px)' },
    'slide': { transform: 'translate(22px, 0px)' },
    'slide-up': { transform: 'translate(0px, 22px)' },
    'slide-down': { transform: 'translate(0px, -22px)' },
    'zoom': { transform: 'scale(0.82)' },
    'none': { transform: 'translate(0px, 0px)', instant: true },
  };
  const RANDOMIZABLE_STYLES = Object.keys(TRANSITION_STYLES);
  const wrap = document.getElementById('${instanceId}');
  const iconBox = document.getElementById('${instanceId}-icon');
  const textPanel = document.getElementById('${instanceId}-panel');
  const textInner = document.getElementById('${instanceId}-inner');
  const msgTag = document.getElementById('${instanceId}-tag');
  const msgText = document.getElementById('${instanceId}-text');
  const root = wrap.style;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function applyTransitionStyle() {
    let key = ${JSON.stringify(transitionStyle)};
    if (key === 'random') key = RANDOMIZABLE_STYLES[Math.floor(Math.random() * RANDOMIZABLE_STYLES.length)];
    const style = TRANSITION_STYLES[key] || TRANSITION_STYLES.fade;
    root.setProperty('--swap-transform', style.transform);
    root.setProperty('--swap-duration', style.instant ? '0s' : '0.3s');
  }

  // One atomic entry point for "show this message" — tag, text, AND icon all
  // update together here, never as separate steps, so they can't desync
  // (see PROJECT_NOTES.md §3.8: the exact bug class this avoids).
  function setMessage(message) {
    applyTransitionStyle();
    msgTag.textContent = message.tag;
    msgText.textContent = message.text;
    if (message.iconType === 'svg') {
      iconBox.innerHTML = '<svg viewBox="0 0 24 24">' + message.iconSvg + '</svg>';
    } else if (message.iconType === 'image') {
      iconBox.innerHTML = '<img src="' + message.iconSrc + '" alt="" style="width:38px;height:38px;border-radius:8px;object-fit:cover;">';
    } else {
      iconBox.innerHTML = '<div style="width:38px;height:38px;border-radius:8px;background:var(--violet);"></div>';
    }
    textPanel.style.maxWidth = textInner.scrollWidth + 46 + 'px';
  }

  async function runCycle() {
    setMessage(SLIDES[0]);
    textPanel.style.maxWidth = '0px';
    wrap.classList.add('is-visible');
    await sleep(TIMING.holdBeforeOpening + 700);

    setMessage(SLIDES[0]);
    await sleep(50);
    textInner.classList.add('is-shown');
    await sleep(TIMING.textOpenDuration + TIMING.perMessageHold);

    for (let i = 1; i < SLIDES.length; i++) {
      textInner.classList.remove('is-shown');
      await sleep(TIMING.swapFade);
      setMessage(SLIDES[i]);
      textInner.classList.add('is-shown');
      await sleep(TIMING.perMessageHold);
    }

    textInner.classList.remove('is-shown');
    textPanel.style.maxWidth = '0px';
    await sleep(TIMING.holdBeforeSlideOut);
    wrap.classList.remove('is-visible');
    await sleep(700 + TIMING.slideOutPause);
  }

  (async function loopForever() { while (true) { await runCycle(); } })();
})();`;
}
