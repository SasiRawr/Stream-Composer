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

// ---- buildSceneHtml: countdown-timer item ----
const countdownProject = baseProject([{
  id: 'd1', type: 'countdown-timer', x: 0, y: 0, width: 420, height: 160, rotation: 0, zIndex: 0,
  props: {
    targetDateTime: '2026-12-31T18:00', label: 'Starting in', completedText: "We're live!",
    showDays: true, fontColor: '#f2f1f9', accentColor: '#7c5cff', backgroundColor: '#0a0a12', backgroundOpacity: 0.75,
  },
}]);
const countdownHtml = buildSceneHtml(countdownProject, {});
assert(countdownHtml.includes('item-countdown-timer'), 'the countdown-timer item is rendered');
assert(countdownHtml.includes('countdown-d1-0-grid'), "the countdown-timer item's grid element uses an instance-scoped id (got a match)");
assert(countdownHtml.includes('Starting in'), "the item's label text reaches the baked output");
assert(countdownHtml.includes('rgba(10, 10, 18, 0.75)'), 'the background color/opacity are converted to a real rgba() value');
assert(countdownHtml.includes('setInterval'), "the countdown-timer's tick script is inlined");

// ---- collectAssetCopies: pngtuber idle + talking images ----
const pngtuberProject = baseProject([{
  id: 'p1', type: 'pngtuber', x: 0, y: 0, width: 300, height: 300, rotation: 0, zIndex: 0,
  props: { idleImagePath: 'C:/art/idle.png', talkingImagePath: 'C:/art/talking.png', micThreshold: 15, holdMs: 200 },
}]);
const pngtuberCopies = collectAssetCopies(pngtuberProject);
assert(pngtuberCopies.length === 2, `a pngtuber item with both images set produces exactly 2 asset copies (got ${pngtuberCopies.length})`);
assert(pngtuberCopies.some((c) => c.itemId === 'p1::idle' && c.destRelativePath === 'assets/p1-idle.png'), 'the idle image gets its own compound-keyed copy entry');
assert(pngtuberCopies.some((c) => c.itemId === 'p1::talking' && c.destRelativePath === 'assets/p1-talking.png'), 'the talking image gets its own compound-keyed copy entry');

const pngtuberNoImagesProject = baseProject([{
  id: 'p2', type: 'pngtuber', x: 0, y: 0, width: 300, height: 300, rotation: 0, zIndex: 0,
  props: { idleImagePath: '', talkingImagePath: '', micThreshold: 15, holdMs: 200 },
}]);
assert(collectAssetCopies(pngtuberNoImagesProject).length === 0, 'a pngtuber item with no images set yet produces no asset copies (not a crash)');

// ---- buildSceneHtml: pngtuber item ----
const pngtuberHtml = buildSceneHtml(pngtuberProject, { 'p1::idle': 'assets/p1-idle.png', 'p1::talking': 'assets/p1-talking.png' });
assert(pngtuberHtml.includes('item-pngtuber'), 'the pngtuber item is rendered');
assert(pngtuberHtml.includes('pngtuber-p1-0-img'), "the pngtuber item's image element uses an instance-scoped id (got a match)");
assert(pngtuberHtml.includes('src="assets/p1-idle.png"'), 'the img tag starts pointed at the idle image');
assert(pngtuberHtml.includes('IDLE_SRC = "assets/p1-idle.png"'), 'the idle asset path reaches the inlined script');
assert(pngtuberHtml.includes('TALKING_SRC = "assets/p1-talking.png"'), 'the talking asset path reaches the inlined script');
assert(pngtuberHtml.includes('getUserMedia'), "the pngtuber item's mic-detection script is inlined");

// ---- collectAssetCopies + buildSceneHtml: pngtuber 'bounce' style ----
const pngtuberBounceProject = baseProject([{
  id: 'p3', type: 'pngtuber', x: 0, y: 0, width: 300, height: 300, rotation: 0, zIndex: 0,
  props: { style: 'bounce', idleImagePath: 'C:/art/char.png', micThreshold: 15, holdMs: 200 },
}]);
const pngtuberBounceCopies = collectAssetCopies(pngtuberBounceProject);
assert(pngtuberBounceCopies.length === 1, `a bounce-style pngtuber item with only an idle image produces exactly 1 asset copy (got ${pngtuberBounceCopies.length})`);
const pngtuberBounceHtml = buildSceneHtml(pngtuberBounceProject, { 'p3::idle': 'assets/p3-idle.png' });
assert(pngtuberBounceHtml.includes('is-talking { animation:'), 'bounce style: emits a looping CSS animation rule gated on the is-talking class');
assert(pngtuberBounceHtml.includes("classList.toggle('is-talking'"), 'bounce style: the inlined script toggles the is-talking class');

// ---- collectAssetCopies + buildSceneHtml: pngtuber 'brightness' style ----
const pngtuberBrightnessProject = baseProject([{
  id: 'p4', type: 'pngtuber', x: 0, y: 0, width: 300, height: 300, rotation: 0, zIndex: 0,
  props: { style: 'brightness', idleImagePath: 'C:/art/char.png', micThreshold: 15, holdMs: 200 },
}]);
const pngtuberBrightnessHtml = buildSceneHtml(pngtuberBrightnessProject, { 'p4::idle': 'assets/p4-idle.png' });
assert(pngtuberBrightnessHtml.includes('filter: brightness(0.72)'), 'brightness style: the idle state is dimmed via a CSS filter');
assert(pngtuberBrightnessHtml.includes('is-talking { filter: brightness(1.25)'), 'brightness style: the talking state lightens via a CSS filter on the is-talking class');

// ---- collectAssetCopies + buildSceneHtml: pngtuber 'mouthFlap' style ----
const pngtuberMouthFlapProject = baseProject([{
  id: 'p5', type: 'pngtuber', x: 0, y: 0, width: 300, height: 300, rotation: 0, zIndex: 0,
  props: {
    style: 'mouthFlap',
    bodyImagePath: 'C:/art/body.png',
    mouthOpenImagePath: 'C:/art/mouth-open.png',
    mouthClosedImagePath: 'C:/art/mouth-closed.png',
    mouthWidthPercent: 25, mouthTopPercent: 60, mouthLeftPercent: 50,
    micThreshold: 15, holdMs: 200, flapIntervalMs: 90,
  },
}]);
const pngtuberMouthFlapCopies = collectAssetCopies(pngtuberMouthFlapProject);
assert(pngtuberMouthFlapCopies.length === 3, `a mouthFlap-style pngtuber item with body+mouth images set produces exactly 3 asset copies (got ${pngtuberMouthFlapCopies.length})`);
assert(pngtuberMouthFlapCopies.some((c) => c.itemId === 'p5::body' && c.destRelativePath === 'assets/p5-body.png'), 'the body image gets its own compound-keyed copy entry');
assert(pngtuberMouthFlapCopies.some((c) => c.itemId === 'p5::mouthOpen' && c.destRelativePath === 'assets/p5-mouth-open.png'), 'the mouth-open image gets its own compound-keyed copy entry');
assert(pngtuberMouthFlapCopies.some((c) => c.itemId === 'p5::mouthClosed' && c.destRelativePath === 'assets/p5-mouth-closed.png'), 'the mouth-closed image gets its own compound-keyed copy entry');

const pngtuberMouthFlapHtml = buildSceneHtml(pngtuberMouthFlapProject, {
  'p5::body': 'assets/p5-body.png',
  'p5::mouthOpen': 'assets/p5-mouth-open.png',
  'p5::mouthClosed': 'assets/p5-mouth-closed.png',
});
assert(pngtuberMouthFlapHtml.includes('pngtuber-p5-0-body'), "the mouthFlap item's body element uses an instance-scoped id");
assert(pngtuberMouthFlapHtml.includes('pngtuber-p5-0-mouth'), "the mouthFlap item's mouth element uses an instance-scoped id");
assert(pngtuberMouthFlapHtml.includes('src="assets/p5-body.png"'), 'the body img tag points at the copied body asset');
assert(pngtuberMouthFlapHtml.includes('src="assets/p5-mouth-closed.png"'), 'the mouth img tag starts on the closed mouth image');
assert(pngtuberMouthFlapHtml.includes('width: 25%') && pngtuberMouthFlapHtml.includes('left: 50%') && pngtuberMouthFlapHtml.includes('top: 60%'), 'the mouth layer is positioned using the configured width/left/top percentages');
assert(pngtuberMouthFlapHtml.includes('FLAP_INTERVAL_MS = 90'), 'the configured flap interval reaches the inlined script');

// ---- switching styles later never drops an already-picked image (all 5 slots always collected if set) ----
const pngtuberAllSlotsProject = baseProject([{
  id: 'p6', type: 'pngtuber', x: 0, y: 0, width: 300, height: 300, rotation: 0, zIndex: 0,
  props: {
    style: 'swap',
    idleImagePath: 'a.png', talkingImagePath: 'b.png',
    bodyImagePath: 'c.png', mouthOpenImagePath: 'd.png', mouthClosedImagePath: 'e.png',
  },
}]);
assert(collectAssetCopies(pngtuberAllSlotsProject).length === 5, 'all 5 pngtuber image slots are collected whenever set, regardless of the currently-selected style');

// ---- collectAssetCopies + buildSceneHtml: viewer-pet item ----
const petProject = baseProject([{
  id: 'v1', type: 'viewer-pet', x: 0, y: 0, width: 200, height: 200, rotation: 0, zIndex: 0,
  props: { petImagePath: 'C:/art/pet.png', platformKey: 'twitch', channelName: 'somestreamer' },
}]);
const petCopies = collectAssetCopies(petProject);
assert(petCopies.length === 1 && petCopies[0].destRelativePath === 'assets/v1.png', 'a viewer-pet item with an image set produces exactly 1 asset copy');

const petHtml = buildSceneHtml(petProject, { v1: 'assets/v1.png' });
assert(petHtml.includes('item-viewer-pet'), 'the viewer-pet item is rendered');
assert(petHtml.includes('pet-v1-0-img'), "the viewer-pet item's image element uses an instance-scoped id (got a match)");
assert(petHtml.includes('src="assets/v1.png"'), 'the img tag points at the copied pet asset');
assert(petHtml.includes('connectTwitch("somestreamer")'), "the viewer-pet item's Twitch connect call reaches the baked output");
assert(petHtml.includes('is-reacting'), 'the bounce-reaction CSS class is present');

// ---- collectAssetCopies + buildSceneHtml: pet-roster item ----
const rosterProject = baseProject([{
  id: 'r1', type: 'pet-roster', x: 0, y: 0, width: 300, height: 200, rotation: 0, zIndex: 0,
  props: { petImagePath: 'C:/art/roster-pet.png', platformKey: 'twitch', channelName: 'somestreamer', maxPets: 5 },
}]);
const rosterCopies = collectAssetCopies(rosterProject);
assert(rosterCopies.length === 1 && rosterCopies[0].destRelativePath === 'assets/r1.png', 'a pet-roster item with an image set produces exactly 1 asset copy (one shared image, not per-chatter)');

const rosterHtml = buildSceneHtml(rosterProject, { r1: 'assets/r1.png' });
assert(rosterHtml.includes('item-pet-roster'), 'the pet-roster item is rendered');
assert(rosterHtml.includes('roster-r1-0-stage'), "the pet-roster item's stage container uses an instance-scoped id");
assert(!rosterHtml.includes('<img'), 'unlike viewer-pet, the static HTML has no baked <img> tag at all - pets are created entirely at runtime');
assert(rosterHtml.includes('PET_SRC = "assets/r1.png"'), 'the shared pet image asset path reaches the inlined script');
assert(rosterHtml.includes('MAX_PETS = 5'), 'the configured roster cap reaches the inlined script');
assert(rosterHtml.includes('connectTwitch("somestreamer")'), "the pet-roster item's Twitch connect call reaches the baked output");
assert(rosterHtml.includes('pet-roster-wrapper') && rosterHtml.includes('pet-roster-pet'), 'position (wrapper) and bounce (inner img) CSS classes are both present');

const rosterNoImageProject = baseProject([{
  id: 'r2', type: 'pet-roster', x: 0, y: 0, width: 300, height: 200, rotation: 0, zIndex: 0,
  props: { platformKey: 'twitch', channelName: '' },
}]);
assert(collectAssetCopies(rosterNoImageProject).length === 0, 'a pet-roster item with no image set yet produces no asset copies (not a crash)');

// ---- buildSceneHtml: now-playing item ----
const nowPlayingProject = baseProject([{
  id: 'np1', type: 'now-playing', x: 0, y: 0, width: 320, height: 90, rotation: 0, zIndex: 0,
  props: { refreshIntervalMs: 2500, showAlbum: true },
}]);
assert(collectAssetCopies(nowPlayingProject).length === 0, 'a now-playing item never produces any asset copies (text only, no image)');

const nowPlayingHtml = buildSceneHtml(nowPlayingProject, {});
assert(nowPlayingHtml.includes('item-now-playing'), 'the now-playing item is rendered');
assert(nowPlayingHtml.includes('nowplaying-np1-0-title') && nowPlayingHtml.includes('nowplaying-np1-0-artist'), "the now-playing item's title/artist elements use instance-scoped ids");
assert(nowPlayingHtml.includes('opacity: 0'), 'starts hidden until the inlined script confirms something is actually playing');
assert(nowPlayingHtml.includes('REFRESH_MS = 2500'), 'the configured refresh interval reaches the inlined script');
assert(nowPlayingHtml.includes('127.0.0.1:5759'), "the now-playing item's script polls the local now-playing server");

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
