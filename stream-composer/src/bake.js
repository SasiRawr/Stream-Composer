// ============================================================================
// BAKE — turns a Project (canvas size + placed items) into a real, standalone
// OBS Browser Source: one scene.html plus an assets/ folder of copied images.
// ============================================================================
// Pure functions only (no Fabric, no Tauri invoke) — this module just builds
// strings and a list of "copy this file to that path" instructions. main.js
// is responsible for actually writing the files via invoke().
//
// The baked scene.html is a BUILD ARTIFACT, not something meant for
// hand-editing — the editable source of truth is always project.json,
// re-opened in Stream Composer to make changes and re-bake. That's why a
// popup-slide item's content gets inlined directly into scene.html instead
// of written out as its own separate settings.js.
// ============================================================================

// Escapes text for safe use inside an HTML attribute or text node.
function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Every item gets wrapped in one of these — position/size/rotation is
// identical logic regardless of item type, so it lives in one place.
function wrapperStyle(item) {
  return `position:absolute; left:${item.x}px; top:${item.y}px; width:${item.width}px; height:${item.height}px; ` +
    `transform:rotate(${item.rotation || 0}deg); z-index:${item.zIndex};`;
}

// ---- FRAME ------------------------------------------------------------
// A plain positioning guide / decorative border. Renders as a styled div,
// nothing more — see props for what's configurable.
function renderFrameItem(item) {
  const p = item.props;
  const fill = p.fillEnabled ? p.fillColor : 'transparent';
  const style = wrapperStyle(item) +
    `border:${p.strokeWidth}px solid ${p.strokeColor}; border-radius:${p.cornerRadius}px; background:${fill}; box-sizing:border-box;`;
  return { html: `<div class="item item-frame" style="${style}"></div>`, script: '' };
}

// ---- IMAGE --------------------------------------------------------------
// assetPath is the path (relative to scene.html) this item's image was
// copied to during the bake — see collectAssetCopies() below.
function renderImageItem(item, assetPath) {
  const style = wrapperStyle(item) + 'object-fit:contain;';
  return {
    html: `<img class="item item-image" src="${escapeHtml(assetPath)}" alt="" style="${style}">`,
    script: '',
  };
}

// ---- POPUP-SLIDE ----------------------------------------------------------
// Reuses v1-pop-up-slide's proven engine almost verbatim (see
// v1-pop-up-slide/campaign-thenerdybox/stream-popup-overlay.html) — the
// only structural change is `position: fixed` -> `position: absolute`, so
// the badge anchors to ITS OWN wrapper box (this item's x/y/width/height)
// instead of the whole browser viewport. Everything else — the slide-in/
// out animation, the transition styles, the message cycling loop — is the
// same engine logic, just scoped with a unique id prefix so multiple
// popup-slide items in one scene don't collide.
function renderPopupSlideItem(item, instanceId) {
  const p = item.props;
  const colors = p.colors;
  const slidesJs = JSON.stringify(p.slides.map((s) => ({ tag: s.tag, text: s.text })));

  const html = `
<div class="item item-popup-slide" style="${wrapperStyle(item)} overflow:visible;">
  <style>
    #${instanceId} {
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
    }
  </style>
  <div class="badge-wrap" id="${instanceId}">
    <div class="icon-box" id="${instanceId}-icon"><div style="width:38px;height:38px;border-radius:8px;background:var(--violet);"></div></div>
    <div class="text-panel" id="${instanceId}-panel">
      <div class="text-inner" id="${instanceId}-inner">
        <span class="msg-tag" id="${instanceId}-tag"></span>
        <span class="msg-text" id="${instanceId}-text"></span>
      </div>
    </div>
  </div>
</div>`;

  // Same engine logic as stream-popup-overlay.html's <script> block,
  // ported to run against this instance's own scoped element ids instead
  // of one fixed set of global ids.
  const script = `
(function () {
  const SLIDES = ${slidesJs};
  const TIMING = { holdBeforeOpening: 350, textOpenDuration: 450, perMessageHold: ${p.perSlideMs}, swapFade: 260, holdBeforeSlideOut: 400, slideOutPause: ${p.pauseMs} };
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
  const textPanel = document.getElementById('${instanceId}-panel');
  const textInner = document.getElementById('${instanceId}-inner');
  const msgTag = document.getElementById('${instanceId}-tag');
  const msgText = document.getElementById('${instanceId}-text');
  const root = wrap.style;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function applyTransitionStyle() {
    let key = ${JSON.stringify(p.transitionStyle)};
    if (key === 'random') key = RANDOMIZABLE_STYLES[Math.floor(Math.random() * RANDOMIZABLE_STYLES.length)];
    const style = TRANSITION_STYLES[key] || TRANSITION_STYLES.fade;
    root.setProperty('--swap-transform', style.transform);
    root.setProperty('--swap-duration', style.instant ? '0s' : '0.3s');
  }

  function setMessage(message) {
    applyTransitionStyle();
    msgTag.textContent = message.tag;
    msgText.textContent = message.text;
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

  return { html, script };
}

// ---- ASSET COLLECTION -------------------------------------------------
// Every `image` item needs its source file copied into the output's
// assets/ folder. Returns [{ itemId, sourcePath, destRelativePath }].
export function collectAssetCopies(project) {
  return project.items
    .filter((item) => item.type === 'image' && item.props.sourcePath)
    .map((item) => {
      const ext = (item.props.sourcePath.split('.').pop() || 'png').toLowerCase();
      return {
        itemId: item.id,
        sourcePath: item.props.sourcePath,
        destRelativePath: `assets/${item.id}.${ext}`,
      };
    });
}

// ---- MAIN BUILD FUNCTION -----------------------------------------------
// Returns the full scene.html text for the given project. assetPathsById
// maps image item id -> its destRelativePath (from collectAssetCopies),
// so this function doesn't need to know about the filesystem at all.
export function buildSceneHtml(project, assetPathsById) {
  const sorted = [...project.items].sort((a, b) => a.zIndex - b.zIndex);
  const parts = sorted.map((item, index) => {
    if (item.type === 'frame') return renderFrameItem(item);
    if (item.type === 'image') return renderImageItem(item, assetPathsById[item.id] || '');
    if (item.type === 'popup-slide') return renderPopupSlideItem(item, `popup-${item.id.replace(/[^a-zA-Z0-9]/g, '')}-${index}`);
    return { html: '', script: '' };
  });

  const bodyHtml = parts.map((p) => p.html).join('\n');
  const scripts = parts.map((p) => p.script).filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Stream Composer — baked output</title>
<!--
  Generated by Stream Composer. This is a BUILD ARTIFACT — to make changes,
  reopen the project this came from in Stream Composer and re-bake, don't
  hand-edit this file (see project.json in the Stream Composer project
  folder for the editable source).

  Add this to OBS as a Browser Source: check "Local file", browse to this
  file, and set Width=${project.canvasWidth} Height=${project.canvasHeight} to match.
-->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=JetBrains+Mono:wght@600&family=Inter:wght@500;600&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:transparent; overflow:hidden; font-family:'Inter',sans-serif; }
  .scene { position:relative; width:${project.canvasWidth}px; height:${project.canvasHeight}px; }
  .item { position:absolute; }
</style>
</head>
<body>
<div class="scene">
${bodyHtml}
</div>
<script>
${scripts}
</script>
</body>
</html>
`;
}
