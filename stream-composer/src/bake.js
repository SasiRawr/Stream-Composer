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

import { platformIconSvg } from './popup-slide-icons.js';
import { buildPopupSlideScript } from './popup-slide-engine.js';
import { buildChatOverlayScript } from './chat-tts-engine.js';

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
// nothing more — see props for what's configurable. Gradient angle uses
// the same convention CSS linear-gradient() already does (0deg = to top,
// 90deg = to right, clockwise) — main.js's Fabric preview computes
// matching coordinates from the same angle, so the editor and the baked
// output agree on what a given angle looks like.
function renderFrameItem(item) {
  const p = item.props;
  const fill = !p.fillEnabled
    ? 'transparent'
    : p.fillType === 'gradient'
      ? `linear-gradient(${p.gradientAngle}deg, ${p.gradientFrom}, ${p.gradientTo})`
      : p.fillColor;
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
// The HTML/CSS structure below descends from v1-pop-up-slide's proven
// design — the only structural change is `position: fixed` ->
// `position: absolute`, so the badge anchors to ITS OWN wrapper box (this
// item's x/y/width/height) instead of the whole browser viewport. The
// actual animation LOGIC (slide-in/out, transition styles, message
// cycling) lives in popup-slide-engine.js, scoped per-instance via a
// unique id prefix so multiple popup-slide items in one scene don't
// collide.
// Resolves each slide's iconMode into what the engine actually needs to
// render: either inline SVG markup (platform placeholder or a kept legacy
// icon) or a baked image path (custom icon, copied in via
// collectAssetCopies() below) or nothing at all. assetPathsById maps the
// compound key `${item.id}::slide${i}` (see collectAssetCopies) to that
// slide's copied-asset relative path.
function resolveSlideIcon(item, slide, index, assetPathsById) {
  if (slide.iconMode === 'platform' && slide.platformKey) {
    return { iconType: 'svg', iconSvg: platformIconSvg(slide.platformKey) };
  }
  if (slide.iconMode === 'keep' && slide.rawIcon) {
    return { iconType: 'svg', iconSvg: slide.rawIcon };
  }
  if (slide.iconMode === 'custom') {
    const assetPath = assetPathsById[`${item.id}::slide${index}`];
    if (assetPath) return { iconType: 'image', iconSrc: assetPath };
  }
  return { iconType: 'none' };
}

function renderPopupSlideItem(item, instanceId, assetPathsById) {
  const p = item.props;
  const colors = p.colors;
  const slidesForEngine = p.slides.map((s, i) => ({
    tag: s.tag,
    text: s.text,
    ...resolveSlideIcon(item, s, i, assetPathsById),
  }));

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

  const timing = {
    holdBeforeOpening: 350, textOpenDuration: 450, perMessageHold: p.perSlideMs,
    swapFade: 260, holdBeforeSlideOut: 400, slideOutPause: p.pauseMs,
  };
  const script = buildPopupSlideScript(instanceId, slidesForEngine, timing, p.transitionStyle);

  return { html, script };
}

// ---- CHAT + TTS OVERLAY -------------------------------------------------
// A live, continuously-running item — connects to whichever chat platforms
// are enabled and reads new messages aloud via TTS once baked. Unlike every
// other item type, this one makes real outbound network connections at
// runtime — see chat-tts-engine.js's header comment for the full
// verification caveats (Twitch's anonymous IRC login is a widely-used but
// undocumented convention; Kick's connector needs a real Pusher app key
// filled in before it will work at all).
function renderChatOverlayItem(item, instanceId) {
  const html = `
<div class="item item-chat-overlay" style="${wrapperStyle(item)} overflow:hidden;">
  <style>
    #${instanceId}-feed {
      display: flex; flex-direction: column-reverse; gap: 8px;
      width: 100%; height: 100%; padding: 8px; box-sizing: border-box;
      font-family: 'Inter', sans-serif;
    }
    #${instanceId}-feed .chat-message {
      display: flex; align-items: center; gap: 8px;
      background: rgba(10,10,18,0.75); border-radius: 10px;
      padding: 8px 12px; animation: ${instanceId}-fade-in 0.25s ease;
    }
    #${instanceId}-feed .chat-badge { width: 18px; height: 18px; flex-shrink: 0; }
    #${instanceId}-feed .chat-username { font-weight: 700; color: #a594ff; margin-right: 4px; }
    #${instanceId}-feed .chat-text { color: #f2f1f9; word-break: break-word; }
    @keyframes ${instanceId}-fade-in {
      from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; }
    }
  </style>
  <div id="${instanceId}-feed"></div>
</div>`;

  const script = buildChatOverlayScript(instanceId, item.props);
  return { html, script };
}

// ---- ASSET COLLECTION -------------------------------------------------
// Every `image` item needs its source file copied into the output's
// assets/ folder, and so does every popup-slide item's slide that uses a
// custom icon (iconMode: 'custom'). Returns
// [{ itemId, sourcePath, destRelativePath }] — a popup-slide slide's
// itemId is the compound key `${item.id}::slide${i}` (see
// resolveSlideIcon above, which looks entries back up by this same key).
export function collectAssetCopies(project) {
  const copies = [];
  for (const item of project.items) {
    if (item.type === 'image' && item.props.sourcePath) {
      const ext = (item.props.sourcePath.split('.').pop() || 'png').toLowerCase();
      copies.push({
        itemId: item.id,
        sourcePath: item.props.sourcePath,
        destRelativePath: `assets/${item.id}.${ext}`,
      });
    }
    if (item.type === 'popup-slide') {
      (item.props.slides || []).forEach((slide, i) => {
        if (slide.iconMode === 'custom' && slide.customAssetPath) {
          const ext = (slide.customAssetPath.split('.').pop() || 'png').toLowerCase();
          copies.push({
            itemId: `${item.id}::slide${i}`,
            sourcePath: slide.customAssetPath,
            destRelativePath: `assets/${item.id}-slide${i}.${ext}`,
          });
        }
      });
    }
  }
  return copies;
}

// ---- MAIN BUILD FUNCTION -----------------------------------------------
// Returns the full scene.html text for the given project. assetPathsById
// maps each collectAssetCopies() itemId (an image item's own id, or a
// popup-slide's compound `${item.id}::slide${i}` key) -> its
// destRelativePath (from collectAssetCopies),
// so this function doesn't need to know about the filesystem at all.
export function buildSceneHtml(project, assetPathsById) {
  const sorted = [...project.items].sort((a, b) => a.zIndex - b.zIndex);
  const parts = sorted.map((item, index) => {
    if (item.type === 'frame') return renderFrameItem(item);
    if (item.type === 'image') return renderImageItem(item, assetPathsById[item.id] || '');
    if (item.type === 'popup-slide') return renderPopupSlideItem(item, `popup-${item.id.replace(/[^a-zA-Z0-9]/g, '')}-${index}`, assetPathsById);
    if (item.type === 'chat-overlay') return renderChatOverlayItem(item, `chat-${item.id.replace(/[^a-zA-Z0-9]/g, '')}-${index}`);
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
