// ============================================================================
// POPUP SLIDE — "Classic" motion style. The original slide-in badge: a
// sliding icon box, a text panel that opens out of it, and a short text
// transition between messages. The runtime itself lives in
// popup-slide-engine.js; this module just supplies the matching CSS + HTML
// and wires the two together behind the shared motion-style interface:
//
//   render({ instanceId, slides, timing, colors, transitionStyle })
//     -> { css, markup, script }
//
// The CSS and markup below are kept character-for-character identical to
// what bake.js emitted before motion styles existed, so projects that never
// pick a style bake exactly the same output as before.
// ============================================================================

import { buildPopupSlideScript } from '../popup-slide-engine.js';

export const popupSlideClassic = {
  id: 'classic',
  label: 'Classic',
  // Classic honours the "Text transition style" control.
  usesTransitionStyle: true,

  render({ instanceId, slides, timing, colors, transitionStyle }) {
    const css = `    #${instanceId} {
      --void:${colors.void}; --violet:${colors.violet}; --violet-soft:${colors.violetSoft};
      --ink:${colors.ink}; --mute:${colors.mute};
      position: absolute; right: 40px; bottom: 40px;
      display: flex; align-items: center; height: 64px;
      transform: translateX(140%); opacity: 0;
      transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease;
    }
    #${instanceId}.is-visible { transform: translateX(0); opacity: 1; }
    #${instanceId} .icon-box {
      position: relative; width: 64px; height: 64px; flex-shrink: 0; border-radius: 16px;
      background: linear-gradient(145deg, var(--void), #14141f);
      box-shadow: 0 0 0 1.5px rgba(124,92,255,0.35), 0 8px 24px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center; z-index: 2;
    }
    #${instanceId} .icon-box::after {
      content: ""; position: absolute; inset: -1.5px; border-radius: 17.5px;
      border: 1.5px solid var(--violet); opacity: 0; animation: ${instanceId}-ping 2.6s ease-out infinite;
    }
    @keyframes ${instanceId}-ping {
      0% { transform: scale(1); opacity: 0.55; } 70% { transform: scale(1.25); opacity: 0; } 100% { transform: scale(1.25); opacity: 0; }
    }
    #${instanceId} .icon-box svg { width: 28px; height: 28px; fill: none; stroke: var(--ink); stroke-width: 1.6; }
    #${instanceId} .text-panel {
      height: 64px; max-width: 0; overflow: hidden; white-space: nowrap; background: var(--void);
      border-radius: 0 14px 14px 0; margin-left: -14px; padding-left: 26px;
      display: flex; align-items: center; box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      transition: max-width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
    }
    #${instanceId} .text-inner {
      display: flex; flex-direction: column; gap: 3px; padding-right: 28px; opacity: 0;
      transform: var(--swap-transform, translate(0px, 4px));
      transition: opacity var(--swap-duration, 0.3s) ease, transform var(--swap-duration, 0.3s) ease;
    }
    #${instanceId} .text-inner.is-shown { opacity: 1; transform: none; }
    #${instanceId} .msg-tag {
      font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
      letter-spacing: 0.14em; color: var(--violet-soft);
    }
    #${instanceId} .msg-text {
      font-family: 'Bricolage Grotesque', sans-serif; font-size: 20px; font-weight: 800;
      color: var(--ink); letter-spacing: 0.01em;
    }`;

    const markup = `  <div class="badge-wrap" id="${instanceId}">
    <div class="icon-box" id="${instanceId}-icon"><div style="width:38px;height:38px;border-radius:8px;background:var(--violet);"></div></div>
    <div class="text-panel" id="${instanceId}-panel">
      <div class="text-inner" id="${instanceId}-inner">
        <span class="msg-tag" id="${instanceId}-tag"></span>
        <span class="msg-text" id="${instanceId}-text"></span>
      </div>
    </div>
  </div>`;

    return { css, markup, script: buildPopupSlideScript(instanceId, slides, timing, transitionStyle) };
  },
};
