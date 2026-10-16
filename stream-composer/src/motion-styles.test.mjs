// ============================================================================
// Tests for the motion-style registry, the Deluxe popup-slide style, and the
// guarantee that Classic output is unchanged. String output only; real
// animation behaviour is checked in a headless browser.
//
// Run with: node src/motion-styles.test.mjs
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getMotionStyle, resolveMotionStyleId, listMotionStyles } from './motion-styles/index.js';
import { buildSceneHtml } from './bake.js';
import { sampleProject, sampleAssets } from './fixtures/popup-slide-sample.mjs';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const here = dirname(fileURLToPath(import.meta.url));

// ---- registry ----
assert(resolveMotionStyleId('popup-slide', 'deluxe') === 'deluxe', 'deluxe resolves to itself');
assert(resolveMotionStyleId('popup-slide', 'classic') === 'classic', 'classic resolves to itself');
assert(resolveMotionStyleId('popup-slide', undefined) === 'classic', 'a missing style falls back to classic');
assert(resolveMotionStyleId('popup-slide', 'nonsense') === 'classic', 'an unknown style falls back to classic');
assert(resolveMotionStyleId('popup-slide', 'toString') === 'classic', 'inherited object keys are not treated as styles');
assert(getMotionStyle('popup-slide', 'deluxe').id === 'deluxe', 'getMotionStyle returns the deluxe module');
assert(getMotionStyle('popup-slide', 'bogus').id === 'classic', 'getMotionStyle falls back to classic');
assert(getMotionStyle('frame', 'deluxe') === null, 'an item type with no styles returns null');
const listed = listMotionStyles('popup-slide');
assert(listed.length === 2 && listed[0].id === 'classic' && listed[1].id === 'deluxe', 'listMotionStyles lists Classic first, then Deluxe');
assert(listed[0].usesTransitionStyle === true && listed[1].usesTransitionStyle === false, 'only Classic uses the text transition style');

// ---- Classic unchanged ----
const golden = readFileSync(join(here, 'fixtures', 'popup-slide-classic.golden.html'), 'utf8');
assert(buildSceneHtml(sampleProject, sampleAssets) === golden, 'a Classic sample item bakes byte-for-byte the same as before motion styles');
{
  const explicit = structuredClone(sampleProject);
  explicit.items[0].props.animationStyle = 'classic';
  assert(buildSceneHtml(explicit, sampleAssets) === golden, 'animationStyle "classic" bakes identically to no animationStyle');
  const unknown = structuredClone(sampleProject);
  unknown.items[0].props.animationStyle = 'mystery';
  assert(buildSceneHtml(unknown, sampleAssets) === golden, 'an unknown animationStyle bakes identically to Classic');
}

// ---- Deluxe output ----
const colors = { void: '#101820', violet: '#ff3366', violetSoft: '#ffaabb', ink: '#eeeeee', mute: '#999999' };
const slides = [
  { tag: 'WEB', text: 'TheNerdyBox.com', iconType: 'none' },
  { tag: 'TWITCH', text: 'Follow us', iconType: 'svg', iconSvg: '<circle fill="#9146FF"/>' },
  { tag: 'PIC', text: 'Custom icon', iconType: 'image', iconSrc: 'assets/item-1-slide2.png' },
];
const timing = { holdBeforeOpening: 350, textOpenDuration: 450, perMessageHold: 3000, swapFade: 260, holdBeforeSlideOut: 400, slideOutPause: 900000 };
const deluxe = getMotionStyle('popup-slide', 'deluxe');
const out = deluxe.render({ instanceId: 'popup-a1-0', slides, timing, colors, transitionStyle: 'fade' });

assert(typeof out.css === 'string' && typeof out.markup === 'string' && typeof out.script === 'string', 'render returns css, markup and script strings');
assert(out.markup.includes('id="popup-a1-0"') && out.markup.includes('id="popup-a1-0-panel"'), 'markup ids are scoped to the instance');
assert(out.script.includes('"popup-a1-0"'), 'script targets the instance id');
assert(out.css.includes('@keyframes popup-a1-0-float') && out.css.includes('@keyframes popup-a1-0-ping') && out.css.includes('@keyframes popup-a1-0-breathe'), 'keyframe names are scoped to the instance');
assert(!/@keyframes (float|ping|breathe)\b/.test(out.css), 'no unscoped keyframe names');
assert(!/^\s*\.(wrap|panel|glow|shine|sheen|progress|icon-box)\b/m.test(out.css), 'no unscoped top-level class selectors');
assert(out.css.includes('--void:#101820') && out.css.includes('--violet:#ff3366') && out.css.includes('--violet-soft:#ffaabb') && out.css.includes('--ink:#eeeeee') && out.css.includes('--mute:#999999'), 'the item colors are serialized');
assert(out.css.includes('rgba(255,51,102,0.55)'), 'glow colors are derived from the item violet');
assert(out.script.includes('TheNerdyBox.com') && out.script.includes('9146FF') && out.script.includes('item-1-slide2.png'), 'slides (text, svg, image) are serialized');
assert(out.script.includes('"perSlideMs":3000') && out.script.includes('"pauseBetweenRunsMs":900000') && out.script.includes('"startDelayMs":350'), 'per-slide hold and replay pause come from the item timing');
assert(out.script.includes("addEventListener('obsSourceVisibleChanged'"), 'restart listener is present');
assert(out.script.includes('cancelEverything') && out.script.includes('generation++'), 'a restart cancels the running animation');
assert(out.script.includes("slide.iconType === 'svg'") && out.script.includes("slide.iconType === 'image'") && out.script.includes('icon-blank'), 'svg, image and none icon branches are present');
assert(!/https?:\/\//.test(out.css + out.markup.replace(/xmlns="[^"]*"/g, '') + out.script), 'no remote URLs (fully offline)');
assert(!/@import|googleapis|<link/i.test(out.css + out.markup + out.script), 'no web font or CDN loading');
assert(!out.script.includes('document.getAnimations'), 'animation cleanup is scoped to this slider, not the whole page');

// Slide text that tries to break out of the inline script stays inert.
const evil = deluxe.render({ instanceId: 'x', slides: [{ tag: '</script><b>', text: 'a', iconType: 'none' }], timing, colors });
assert(!evil.script.includes('</script>'), 'slide text cannot close the inline script tag');

// A non-hex color does not break the output.
const odd = deluxe.render({ instanceId: 'x', slides, timing, colors: { ...colors, void: 'rebeccapurple', violet: 'red' } });
assert(odd.css.includes('rgba(124,92,255,0.55)'), 'a non-hex violet falls back to the default glow tone');

// ---- Deluxe through the bake: two Deluxe sliders + a Classic in one scene ----
{
  const mk = (id, style) => ({
    id, type: 'popup-slide', x: 0, y: 0, width: 640, height: 220, zIndex: 1, rotation: 0,
    props: { ...structuredClone(sampleProject.items[0].props), animationStyle: style },
  });
  const project = { canvasWidth: 640, canvasHeight: 220, items: [mk('a', 'deluxe'), mk('b', 'deluxe'), mk('c', 'classic')] };
  const html = buildSceneHtml(project, {});
  assert(html.includes('id="popup-a-0"') && html.includes('id="popup-b-1"') && html.includes('id="popup-c-2"'), 'three sliders get three distinct instance ids');
  assert((html.match(/@keyframes popup-a-0-float/g) || []).length === 1 && (html.match(/@keyframes popup-b-1-float/g) || []).length === 1, 'each Deluxe slider has its own keyframes');
  assert(html.includes('item-popup-slide'), 'the item wrapper is still emitted');
}

if (failures) { console.error(failures + ' test(s) failed'); process.exit(1); }
console.log('all motion-style tests passed');
