// ============================================================================
// POPUP SLIDE — "Deluxe" motion style. A more polished take on the same
// badge: springy fly-in with overshoot, icon pop with glow and a shine
// sweep, the text panel unfurling, letter-by-letter text, a sheen across the
// panel, a slim progress bar per slide, an edge-on icon flip between slides,
// gentle idle float/glow breathing, and a graceful exit.
//
// Everything is driven by the item's own data (slides, colors, timing).
// Element ids, classes and keyframe names are all scoped to the instance id,
// so several sliders (of any style) can share one scene. Fully offline: no
// web fonts or CDN links of its own.
//
// Pure string-building only; the returned script runs later inside the
// baked scene.
// ============================================================================

// Parses #rgb / #rrggbb into [r, g, b]; null when it isn't a plain hex color.
function parseHex(color) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgba(color, alpha, fallback) {
  const rgb = parseHex(color) || fallback;
  return 'rgba(' + rgb.join(',') + ',' + alpha + ')';
}

// Mixes a color toward white by `amount` (0..1) - used to derive the subtle
// second tone of the icon box and panel gradients from the item's void color.
function lighten(color, amount, fallbackHex) {
  const rgb = parseHex(color) || parseHex(fallbackHex);
  const out = rgb.map((c) => Math.min(255, Math.round(c + (255 - c) * amount)));
  return '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('');
}

// Safe to embed inside an inline <script>: JSON, with anything that could
// close the tag or break a line escaped.
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export const popupSlideDeluxe = {
  id: 'deluxe',
  label: 'Deluxe',
  // Deluxe has its own built-in text animation, so the "Text transition
  // style" control does not apply.
  usesTransitionStyle: false,

  render({ instanceId, slides, timing, colors }) {
    const id = instanceId;
    const glowRgb = [124, 92, 255];
    const violetGlow = (a) => rgba(colors.violet, a, glowRgb);
    const void2 = lighten(colors.void, 0.045, '#0a0a12');
    const panelTop = lighten(colors.void, 0.02, '#0a0a12');

    const css = `    #${id} {
      --void:${colors.void}; --void-2:${void2}; --violet:${colors.violet}; --violet-soft:${colors.violetSoft};
      --ink:${colors.ink}; --mute:${colors.mute};
      position: absolute; right: 40px; bottom: 40px;
      display: flex; align-items: center; height: 64px;
      opacity: 0; visibility: hidden;
      will-change: transform, opacity;
    }
    #${id}.live { visibility: visible; }
    #${id}:not(.live) * { animation-play-state: paused !important; }
    #${id} .icon-wrap {
      position: relative; width: 64px; height: 64px; flex-shrink: 0; z-index: 2;
      animation: ${id}-float 3.6s ease-in-out infinite;
    }
    @keyframes ${id}-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
    #${id} .glow { position: absolute; inset: -20px; pointer-events: none; opacity: 0; }
    #${id} .glow-core {
      position: absolute; inset: 0; border-radius: 50%;
      background: radial-gradient(circle, ${violetGlow(0.55)} 0%, ${violetGlow(0.18)} 42%, ${violetGlow(0)} 68%);
      animation: ${id}-breathe 3.6s ease-in-out infinite;
    }
    @keyframes ${id}-breathe {
      0%, 100% { opacity: 0.75; transform: scale(0.96); }
      50% { opacity: 1; transform: scale(1.04); }
    }
    #${id} .icon-box {
      position: absolute; inset: 0; border-radius: 16px;
      background: linear-gradient(145deg, var(--void), var(--void-2));
      box-shadow: 0 0 0 1.5px ${violetGlow(0.35)}, 0 8px 24px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
      perspective: 260px;
    }
    #${id} .icon-box::after {
      content: ""; position: absolute; inset: -1.5px; border-radius: 17.5px;
      border: 1.5px solid var(--violet); opacity: 0;
      animation: ${id}-ping 2.6s ease-out infinite;
    }
    @keyframes ${id}-ping {
      0% { transform: scale(1); opacity: 0.55; }
      70% { transform: scale(1.25); opacity: 0; }
      100% { transform: scale(1.25); opacity: 0; }
    }
    #${id} .icon-face {
      width: 38px; height: 38px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      transform-style: preserve-3d; backface-visibility: hidden;
    }
    #${id} .icon-face img { display: block; width: 38px; height: 38px; border-radius: 8px; object-fit: cover; }
    #${id} .icon-face svg { width: 28px; height: 28px; fill: none; stroke: var(--ink); stroke-width: 1.6; }
    #${id} .icon-face .icon-blank { width: 38px; height: 38px; border-radius: 8px; background: var(--violet); }
    #${id} .icon-clip { position: absolute; inset: 0; border-radius: 16px; overflow: hidden; pointer-events: none; }
    #${id} .shine {
      position: absolute; top: -30px; left: 0; width: 26px; height: 124px;
      background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.28), rgba(255,255,255,0));
      transform: translateX(-60px) rotate(22deg); opacity: 0;
    }
    #${id} .panel {
      position: relative; height: 64px; width: 0; margin-left: -14px; overflow: hidden;
      border-radius: 0 14px 14px 0;
      background: linear-gradient(180deg, ${panelTop} 0%, var(--void) 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.045), inset 0 0 0 1px ${violetGlow(0.10)}, 0 8px 24px rgba(0,0,0,0.35);
    }
    #${id} .text-inner {
      position: absolute; left: 26px; top: 0; bottom: 2px;
      display: flex; flex-direction: column; justify-content: center; gap: 3px;
      white-space: nowrap;
    }
    #${id} .msg-tag {
      font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
      font-size: 11px; font-weight: 600; letter-spacing: 0.14em; line-height: 13px;
      color: var(--violet-soft);
    }
    #${id} .msg-text {
      font-family: 'Bricolage Grotesque', 'Inter', 'Segoe UI', system-ui, sans-serif;
      font-size: 20px; font-weight: 800; letter-spacing: 0.01em; line-height: 24px;
      color: var(--ink);
    }
    #${id} .ch { display: inline-block; white-space: pre; }
    #${id} .sheen {
      position: absolute; top: -20px; left: 0; width: 70px; height: 104px; pointer-events: none;
      background: linear-gradient(90deg, rgba(255,255,255,0), ${rgba(colors.violetSoft, 0.10, [190, 176, 255])}, rgba(255,255,255,0));
      transform: translateX(-120px) rotate(18deg); opacity: 0;
    }
    #${id} .progress {
      position: absolute; left: 26px; right: 22px; bottom: 7px; height: 2px;
      border-radius: 2px; background: ${rgba(colors.violetSoft, 0.12, [165, 148, 255])}; overflow: hidden; opacity: 0;
    }
    #${id} .progress-fill {
      position: absolute; inset: 0; border-radius: 2px;
      background: linear-gradient(90deg, var(--violet), var(--violet-soft));
      transform-origin: left center; transform: scaleX(0);
    }
    #${id}-measure { position: absolute; left: -9999px; top: 0; visibility: hidden; }
    #${id}-measure .text-inner { position: static; display: inline-flex; flex-direction: column; gap: 3px; white-space: nowrap; }
    #${id}-measure .msg-tag { font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.14em; line-height: 13px; }
    #${id}-measure .msg-text { font-family: 'Bricolage Grotesque', 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 20px; font-weight: 800; letter-spacing: 0.01em; line-height: 24px; }
    #${id}-measure .ch { display: inline-block; white-space: pre; }`;

    const markup = `  <div class="deluxe-wrap" id="${id}">
    <div class="icon-wrap">
      <div class="glow" id="${id}-glow"><div class="glow-core"></div></div>
      <div class="icon-box" id="${id}-iconbox">
        <div class="icon-face" id="${id}-iconface"><div class="icon-blank"></div></div>
        <div class="icon-clip"><div class="shine" id="${id}-shine"></div></div>
      </div>
    </div>
    <div class="panel" id="${id}-panel">
      <div class="sheen" id="${id}-sheen"></div>
      <div class="text-inner" id="${id}-inner">
        <span class="msg-tag" id="${id}-tag"></span>
        <span class="msg-text" id="${id}-text"></span>
      </div>
      <div class="progress" id="${id}-progress"><div class="progress-fill" id="${id}-fill"></div></div>
    </div>
  </div>
  <div id="${id}-measure"><div class="text-inner"><span class="msg-tag" id="${id}-mtag"></span><span class="msg-text" id="${id}-mtext"></span></div></div>`;

    const config = {
      perSlideMs: timing.perMessageHold,
      pauseBetweenRunsMs: timing.slideOutPause,
      startDelayMs: timing.holdBeforeOpening,
    };

    const script = `
(function () {
  'use strict';
  const SLIDES = ${jsonForScript(slides)};
  const CONFIG = ${jsonForScript(config)};
  const ID = ${jsonForScript(id)};

  const $ = (suffix) => document.getElementById(suffix ? ID + '-' + suffix : ID);
  const wrap = $(''), glow = $('glow'), iconBox = $('iconbox'), iconFace = $('iconface'),
        shine = $('shine'), panel = $('panel'), sheen = $('sheen'), inner = $('inner'),
        tag = $('tag'), text = $('text'), progress = $('progress'), fill = $('fill'),
        mTag = $('mtag'), mText = $('mtext');
  if (!wrap) return;
  const mInner = mTag.parentNode;

  // Preload image icons so a swap never shows a blank frame.
  SLIDES.forEach(function (s) { if (s.iconType === 'image' && s.iconSrc) { new Image().src = s.iconSrc; } });

  // ===== Cancellable timing =====
  // A restart bumps the generation and rejects every pending wait, so an old
  // run stops at once and two runs never overlap.
  let generation = 0;
  const pending = new Map();
  const CANCELLED = { cancelled: true };

  function wait(ms, gen) {
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        pending.delete(timer);
        if (gen === generation) resolve(); else reject(CANCELLED);
      }, Math.max(0, ms));
      pending.set(timer, reject);
    });
  }

  function anim(el, frames, opts) {
    return el.animate(frames, Object.assign({ fill: 'both' }, opts));
  }

  // Stops this slider's scripted animations; its CSS idle loops (ping, float,
  // glow breathing) are left alone. Scoped to this instance only.
  function cancelScripted() {
    wrap.getAnimations({ subtree: true }).forEach(function (a) {
      const isCss = (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) ||
                    (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition);
      if (!isCss) a.cancel();
    });
  }

  function cancelEverything() {
    generation++;
    pending.forEach(function (reject, timer) { clearTimeout(timer); reject(CANCELLED); });
    pending.clear();
    cancelScripted();
    wrap.classList.remove('live');
  }

  // ===== Spring keyframes (damped harmonic oscillator, pre-sampled) =====
  function spring(from, to, stiffness, damping) {
    const dt = 1 / 240, range = Math.abs(to - from) || 1;
    let x = from, v = 0, t = 0;
    const samples = [from];
    while (t < 2.5) {
      const a = -stiffness * (x - to) - damping * v;
      v += a * dt; x += v * dt; t += dt;
      samples.push(x);
      if (Math.abs(x - to) < range * 0.002 && Math.abs(v) < range * 0.05) break;
    }
    samples[samples.length - 1] = to;
    const n = 48, out = [];
    for (let i = 0; i <= n; i++) out.push(samples[Math.round(i / n * (samples.length - 1))]);
    return { values: out, duration: Math.round(t * 1000) };
  }

  // ===== Text + icon helpers =====
  function fillChars(el, str, hidden) {
    el.textContent = '';
    for (const c of String(str == null ? '' : str)) {
      const s = document.createElement('span');
      s.className = 'ch'; s.textContent = c;
      if (hidden) s.style.opacity = '0';
      el.appendChild(s);
    }
  }

  function panelWidthFor(slide) {
    fillChars(mTag, slide.tag); fillChars(mText, slide.text);
    return Math.ceil(mInner.getBoundingClientRect().width) + 26 + 28;
  }

  function setIcon(slide) {
    if (slide.iconType === 'svg') {
      iconFace.innerHTML = '<svg viewBox="0 0 24 24">' + slide.iconSvg + '</svg>';
    } else if (slide.iconType === 'image' && slide.iconSrc) {
      const img = document.createElement('img');
      img.alt = ''; img.src = slide.iconSrc;
      iconFace.textContent = '';
      iconFace.appendChild(img);
    } else {
      iconFace.innerHTML = '<div class="icon-blank"></div>';
    }
  }

  function setSlide(slide) {
    fillChars(tag, slide.tag, true); fillChars(text, slide.text, true);
    setIcon(slide);
  }

  function charsIn() {
    const tagChars = tag.querySelectorAll('.ch'), textChars = text.querySelectorAll('.ch');
    inner.getAnimations().forEach(function (a) { a.cancel(); });
    const tagStep = Math.min(14, 260 / Math.max(1, tagChars.length));
    const textStep = Math.min(22, 300 / Math.max(1, textChars.length));
    tagChars.forEach(function (c, i) {
      anim(c, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 360, delay: i * tagStep, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
    textChars.forEach(function (c, i) {
      anim(c, [{ opacity: 0, transform: 'translateY(11px) scale(0.92)', filter: 'blur(3px)' },
               { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
        { duration: 460, delay: 70 + i * textStep, easing: 'cubic-bezier(0.18, 1.25, 0.4, 1)' });
    });
  }

  function textOut() {
    anim(inner, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-7px)' }],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)' });
    anim(progress, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' });
  }

  function sweepShine() {
    anim(shine, [
      { opacity: 0, transform: 'translateX(-60px) rotate(22deg)' },
      { opacity: 1, transform: 'translateX(-20px) rotate(22deg)', offset: 0.25 },
      { opacity: 1, transform: 'translateX(60px) rotate(22deg)', offset: 0.8 },
      { opacity: 0, transform: 'translateX(90px) rotate(22deg)' }
    ], { duration: 720, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' });
  }

  function sweepSheen(width) {
    anim(sheen, [
      { opacity: 0, transform: 'translateX(-90px) rotate(18deg)' },
      { opacity: 1, transform: 'translateX(' + Math.round(width * 0.3) + 'px) rotate(18deg)', offset: 0.3 },
      { opacity: 1, transform: 'translateX(' + Math.round(width * 0.8) + 'px) rotate(18deg)', offset: 0.75 },
      { opacity: 0, transform: 'translateX(' + (width + 20) + 'px) rotate(18deg)' }
    ], { duration: 1100, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' });
  }

  function glowTo(from, peak, rest, duration) {
    anim(glow, [{ opacity: from }, { opacity: peak, offset: 0.35 }, { opacity: rest }],
      { duration: duration, easing: 'ease-in-out' });
  }

  function runProgress(ms) {
    anim(progress, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    anim(fill, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: ms, easing: 'linear' });
  }

  let currentWidth = 0;
  function widthTo(w, duration, easing) {
    anim(panel, [{ width: currentWidth + 'px' }, { width: w + 'px' }], { duration: duration, easing: easing });
    currentWidth = w;
  }

  // ===== One full run =====
  async function enter(first, gen) {
    wrap.classList.add('live');
    currentWidth = 0;
    setSlide(first);

    const s = spring(170, 0, 190, 18);
    anim(wrap, s.values.map(function (x, i) {
      return { transform: 'translateX(' + x.toFixed(2) + 'px)', opacity: Math.min(1, i / 12) };
    }), { duration: s.duration, easing: 'linear' });

    const p = spring(0.55, 1, 260, 15);
    anim(iconBox, p.values.map(function (v) {
      return { transform: 'scale(' + v.toFixed(4) + ') rotate(' + ((1 - v) * -26).toFixed(2) + 'deg)' };
    }), { duration: p.duration, delay: 60, easing: 'linear' });
    glowTo(0, 1, 0.45, 1100);
    await wait(380, gen);
    sweepShine();
    await wait(260, gen);

    const w = panelWidthFor(first);
    widthTo(w, 620, 'cubic-bezier(0.16, 1, 0.3, 1)');
    await wait(240, gen);
    return w;
  }

  async function holdSlide(width, gen) {
    charsIn();
    sweepSheen(width);
    runProgress(CONFIG.perSlideMs + 300);
    await wait(CONFIG.perSlideMs + 300, gen);
  }

  async function swapTo(slide, gen) {
    textOut();
    await wait(110, gen);
    anim(iconFace, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }],
      { duration: 190, easing: 'cubic-bezier(0.5, 0, 1, 0.6)' });
    glowTo(0.45, 1, 0.45, 760);
    await wait(110, gen);
    const w = panelWidthFor(slide);
    widthTo(w, 480, 'cubic-bezier(0.22, 1, 0.36, 1)');
    await wait(80, gen);
    setSlide(slide);
    const f = spring(-90, 0, 230, 17);
    anim(iconFace, f.values.map(function (d) { return { transform: 'rotateY(' + d.toFixed(2) + 'deg)' }; }),
      { duration: f.duration, easing: 'linear' });
    sweepShine();
    await wait(90, gen);
    return w;
  }

  async function exit(gen) {
    textOut();
    await wait(200, gen);
    widthTo(0, 460, 'cubic-bezier(0.65, 0, 0.35, 1)');
    await wait(380, gen);
    anim(glow, [{ opacity: 0.45 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' });
    anim(iconBox, [{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.35 }, { transform: 'scale(0.9)' }],
      { duration: 560, easing: 'ease-in-out' });
    anim(wrap, [
      { transform: 'translateX(0px)', opacity: 1 },
      { transform: 'translateX(-8px)', opacity: 1, offset: 0.28, easing: 'cubic-bezier(0.55, 0, 0.85, 0.3)' },
      { transform: 'translateX(170px)', opacity: 0 }
    ], { duration: 640 });
    await wait(660, gen);
    cancelScripted();
    wrap.classList.remove('live');
  }

  async function loop() {
    const gen = generation;
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      if (gen !== generation) return;
      await wait(CONFIG.startDelayMs, gen);
      for (;;) {
        let width = await enter(SLIDES[0], gen);
        await holdSlide(width, gen);
        for (let i = 1; i < SLIDES.length; i++) {
          width = await swapTo(SLIDES[i], gen);
          await holdSlide(width, gen);
        }
        await exit(gen);
        await wait(CONFIG.pauseBetweenRunsMs, gen);
      }
    } catch (e) {
      if (e !== CANCELLED) throw e;
    }
  }

  function restart() { cancelEverything(); loop(); }

  // Turning the source's eye on in OBS replays from the first slide; turning
  // it off cancels the run and hides the badge.
  window.addEventListener('obsSourceVisibleChanged', function (event) {
    const visible = !!(event && event.detail && event.detail.visible);
    if (visible) restart(); else cancelEverything();
  });

  restart();
})();`;

    return { css, markup, script };
  },
};
