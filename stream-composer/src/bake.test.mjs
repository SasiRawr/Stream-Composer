// ============================================================================
// Tests for bake.js. Runs in plain Node — bake.js is pure functions only
// (no Fabric, no Tauri invoke), so this is genuinely checkable without any
// visual tooling, same as the image-editing modules.
//
// Run with: node src/bake.test.mjs
// ============================================================================

import { buildSceneHtml, collectAssetCopies } from './bake.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function baseProject(items) {
  return { canvasWidth: 1920, canvasHeight: 1080, items };
}

// ---- collectAssetCopies: image items ----
const imgProject = baseProject([
  { id: 'i1', type: 'image', x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, props: { sourcePath: '/fake/logo.PNG' } },
  { id: 'i2', type: 'image', x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 1, props: { sourcePath: '' } },
]);
const imgCopies = collectAssetCopies(imgProject);
assert(imgCopies.length === 1, `an image item with no sourcePath is skipped (got ${imgCopies.length} entries)`);
assert(imgCopies[0].itemId === 'i1' && imgCopies[0].destRelativePath === 'assets/i1.png', `an image item's extension is lowercased in the dest path (got ${imgCopies[0].destRelativePath})`);

// ---- collectAssetCopies: popup-slide custom icons ----
const slideProject = baseProject([{
  id: 'p1', type: 'popup-slide', x: 0, y: 0, width: 640, height: 220, rotation: 0, zIndex: 0,
  props: {
    slides: [
      { tag: 'A', text: 'none', iconMode: 'none' },
      { tag: 'B', text: 'platform', iconMode: 'platform', platformKey: 'twitch' },
      { tag: 'C', text: 'custom', iconMode: 'custom', customAssetPath: '/fake/icon.jpg' },
      { tag: 'D', text: 'custom no path', iconMode: 'custom' },
    ],
    transitionStyle: 'fade', perSlideMs: 2600, pauseMs: 500,
    colors: { void: '#0a0a12', violet: '#7c5cff', violetSoft: '#a594ff', ink: '#f2f1f9', mute: '#918eae' },
  },
}]);
const slideCopies = collectAssetCopies(slideProject);
assert(slideCopies.length === 1, `only the one slide with iconMode:'custom' AND a real path produces a copy (got ${slideCopies.length})`);
assert(slideCopies[0].itemId === 'p1::slide2', `the custom-icon slide's itemId uses the compound key (got ${slideCopies[0].itemId})`);
assert(slideCopies[0].destRelativePath === 'assets/p1-slide2.jpg', `the custom-icon slide's dest path is item-and-slide-scoped (got ${slideCopies[0].destRelativePath})`);

// ---- buildSceneHtml: a full mixed-type project bakes without throwing ----
const mixedProject = baseProject([
  { id: 'f1', type: 'frame', x: 10, y: 10, width: 480, height: 270, rotation: 0, zIndex: 0,
    props: { strokeColor: '#7c5cff', strokeWidth: 3, cornerRadius: 12, fillEnabled: false, fillColor: '#0a0a12' } },
  { id: 'i1', type: 'image', x: 100, y: 100, width: 300, height: 300, rotation: 15, zIndex: 1,
    props: { sourcePath: '/fake/logo.png' } },
  { id: 'p1', type: 'popup-slide', x: 500, y: 500, width: 640, height: 220, rotation: 0, zIndex: 2,
    props: {
      slides: [
        { tag: 'WEB', text: 'TheNerdyBox.com', iconMode: 'none' },
        { tag: 'TWITCH', text: 'Follow us', iconMode: 'platform', platformKey: 'twitch' },
        { tag: 'CUSTOM', text: 'Custom badge', iconMode: 'custom', customAssetPath: '/fake/icon.png' },
      ],
      transitionStyle: 'fade', perSlideMs: 2600, pauseMs: 500,
      colors: { void: '#0a0a12', violet: '#7c5cff', violetSoft: '#a594ff', ink: '#f2f1f9', mute: '#918eae' },
    } },
]);
const assetPathsById = { i1: 'assets/i1.png', 'p1::slide2': 'assets/p1-slide2.png' };
const html = buildSceneHtml(mixedProject, assetPathsById);

assert(html.startsWith('<!DOCTYPE html>'), 'buildSceneHtml produces a full HTML document');
assert(html.includes('Width=1920') && html.includes('Height=1080'), 'the OBS setup instructions reflect the project\'s real canvas size');
assert(html.includes('item-frame'), 'the frame item is rendered');
assert(html.includes('assets/i1.png'), "the image item's baked asset path is used");
assert(html.includes('9146FF'), "the popup-slide item's platform-icon color reaches the output");
assert(html.includes('assets/p1-slide2.png'), "the popup-slide item's custom-icon baked asset path reaches the output");
assert(html.includes('loopForever'), 'the popup-slide animation engine is inlined into the output');

// ---- buildSceneHtml: frame gradient fill ----
const gradientProject = baseProject([{
  id: 'g1', type: 'frame', x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0,
  props: { strokeColor: '#fff', strokeWidth: 1, cornerRadius: 0, fillEnabled: true, fillType: 'gradient', gradientFrom: '#7c5cff', gradientTo: '#0a0a12', gradientAngle: 135 },
}]);
const gradientHtml = buildSceneHtml(gradientProject, {});
assert(gradientHtml.includes('linear-gradient(135deg, #7c5cff, #0a0a12)'), `a gradient-filled frame emits a real CSS linear-gradient (got a match: ${gradientHtml.includes('linear-gradient(135deg, #7c5cff, #0a0a12)')})`);

const solidProject = baseProject([{
  id: 's1', type: 'frame', x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0,
  props: { strokeColor: '#fff', strokeWidth: 1, cornerRadius: 0, fillEnabled: true, fillType: 'solid', fillColor: '#123456' },
}]);
const solidHtml = buildSceneHtml(solidProject, {});
assert(solidHtml.includes('background:#123456;') && !solidHtml.includes('linear-gradient'), 'a solid-filled frame still emits a plain background color, not a gradient');

// ---- buildSceneHtml: chat-overlay item ----
const chatProject = baseProject([{
  id: 'c1', type: 'chat-overlay', x: 0, y: 0, width: 420, height: 600, rotation: 0, zIndex: 0,
  props: {
    platforms: [
      { key: 'twitch', enabled: true, channelName: 'somestreamer' },
      { key: 'kick', enabled: false, channelName: '' },
    ],
    ttsEnabled: true, ttsRate: 1, ttsVolume: 1,
    filterCommands: true, maxVisibleMessages: 3, messageDisplayMs: 6000,
  },
}]);
const chatHtml = buildSceneHtml(chatProject, {});
assert(chatHtml.includes('item-chat-overlay'), 'the chat-overlay item is rendered');
assert(chatHtml.includes('chat-c1-0-feed'), "the chat-overlay item's feed element uses an instance-scoped id (got a match)");
assert(chatHtml.includes('connectTwitch("somestreamer")'), "an enabled platform's connect call reaches the baked output");
assert(!chatHtml.includes('connectKick("'), 'a disabled platform does not get a connect call in the baked output');

// ---- buildSceneHtml: items sort by zIndex regardless of array order ----
const outOfOrder = baseProject([
  { id: 'top', type: 'frame', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 5,
    props: { strokeColor: '#fff', strokeWidth: 1, cornerRadius: 0, fillEnabled: false, fillColor: '#000' } },
  { id: 'bottom', type: 'frame', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1,
    props: { strokeColor: '#fff', strokeWidth: 1, cornerRadius: 0, fillEnabled: false, fillColor: '#000' } },
]);
const orderedHtml = buildSceneHtml(outOfOrder, {});
assert(orderedHtml.indexOf('z-index:1;') < orderedHtml.indexOf('z-index:5;'), 'items are emitted in zIndex order regardless of their order in project.items');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
