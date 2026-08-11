// ============================================================================
// Tests for starter-kit/manifest.js. Runs in plain Node.
//
// Run with: node src/starter-kit/manifest.test.mjs
// ============================================================================

import { buildSceneHtml } from '../bake.js';
import { STARTER_TEMPLATES, mergeStarterProjects, personalizeProject } from './manifest.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

assert(STARTER_TEMPLATES.length === 3, `there are exactly 3 starter templates (got ${STARTER_TEMPLATES.length})`);

const seenKeys = new Set();
for (const template of STARTER_TEMPLATES) {
  assert(!!template.key && !!template.label && !!template.description, `template has key/label/description (got key=${template.key})`);
  assert(!seenKeys.has(template.key), `template key '${template.key}' is unique`);
  seenKeys.add(template.key);

  const project = template.buildProject();
  assert(typeof project.canvasWidth === 'number' && project.canvasWidth > 0, `'${template.key}' has a valid canvasWidth (got ${project.canvasWidth})`);
  assert(typeof project.canvasHeight === 'number' && project.canvasHeight > 0, `'${template.key}' has a valid canvasHeight (got ${project.canvasHeight})`);
  assert(Array.isArray(project.items) && project.items.length > 0, `'${template.key}' has at least one item (got ${project.items.length})`);
  for (const item of project.items) {
    assert(!!item.id && !!item.type && !!item.props, `'${template.key}' item '${item.id}' has id/type/props`);
    assert(item.type === 'frame' || item.type === 'image' || item.type === 'popup-slide', `'${template.key}' item '${item.id}' has a real item type (got ${item.type})`);
  }

  // Every template must actually bake without throwing, through the real
  // bake.js pipeline (the same function the app itself calls).
  const html = buildSceneHtml(project, {});
  assert(html.includes('<!DOCTYPE html>'), `'${template.key}' bakes into a real HTML document`);
}

// ---- buildProject() is a factory, not a shared object ----
const template = STARTER_TEMPLATES[0];
const first = template.buildProject();
const second = template.buildProject();
first.items[0].props.slides[0].tag = 'MUTATED';
assert(second.items[0].props.slides[0].tag !== 'MUTATED', "mutating one buildProject() result doesn't affect the next pick of the same template");
assert(first.items !== second.items, 'two buildProject() calls return distinct item arrays, not the same reference');

// ---- mergeStarterProjects() — the "pick and choose" starter kit mode ----
assert(mergeStarterProjects([]) === null, 'merging zero projects returns null');

const single = mergeStarterProjects([STARTER_TEMPLATES[0].buildProject()]);
const soloBuilt = STARTER_TEMPLATES[0].buildProject();
assert(single.canvasWidth === soloBuilt.canvasWidth && single.canvasHeight === soloBuilt.canvasHeight,
  'merging exactly one template keeps its own canvas size');
assert(single.items.length === soloBuilt.items.length, 'merging exactly one template keeps its item count');

const badge = STARTER_TEMPLATES.find((t) => t.key === 'popup-badge').buildProject();   // 640x220
const webcam = STARTER_TEMPLATES.find((t) => t.key === 'webcam-scene').buildProject();  // 1920x1080
const merged = mergeStarterProjects([badge, webcam]);
assert(merged.canvasWidth === 1920 && merged.canvasHeight === 1080, `merged canvas is the largest of the selected templates (got ${merged.canvasWidth}x${merged.canvasHeight})`);
assert(merged.items.length === badge.items.length + webcam.items.length, 'merged project has every item from every selected template');
const ids = merged.items.map((i) => i.id);
assert(new Set(ids).size === ids.length, 'merged items keep unique ids (no collisions across templates)');
const zIndexes = merged.items.map((i) => i.zIndex);
assert(new Set(zIndexes).size === zIndexes.length, 'merged items get renumbered zIndex with no ties');
assert(JSON.stringify(zIndexes) === JSON.stringify([...zIndexes].sort((a, b) => a - b)), 'merged zIndex is sequential in template order');

// ---- personalizeProject: accent color + text overrides ----
const webcamScene = STARTER_TEMPLATES.find((t) => t.key === 'webcam-scene').buildProject();
const personalized = personalizeProject(webcamScene, { accentColor: '#ff6ec4', siteText: 'twitch.tv/example', socialText: 'Follow @example' });

const frameItem = personalized.items.find((i) => i.type === 'frame');
assert(frameItem.props.strokeColor === '#ff6ec4', 'a frame item\'s brand-violet stroke color gets replaced with the chosen accent');
assert(frameItem.props.gradientFrom === '#ff6ec4', 'a frame item\'s brand-violet gradient start also gets replaced with the chosen accent');

const slideItem = personalized.items.find((i) => i.type === 'popup-slide');
assert(slideItem.props.colors.violet === '#ff6ec4', 'a popup-slide item\'s violet color token gets replaced with the chosen accent');
assert(slideItem.props.colors.violetSoft !== '#a594ff', 'the derived violetSoft token changes too, not left as the old brand default');
assert(slideItem.props.slides[0].text === 'twitch.tv/example', 'the "YourSite.com" placeholder slide gets replaced with the custom site text');
assert(slideItem.props.slides[1].text === 'Follow @example', 'the "Follow @yourhandle" placeholder slide gets replaced with the custom social text');

// ---- personalizeProject: original template is never mutated ----
const originalAgain = STARTER_TEMPLATES.find((t) => t.key === 'webcam-scene').buildProject();
assert(originalAgain.items.find((i) => i.type === 'frame').props.strokeColor === '#7c5cff', 'calling personalizeProject on one project never mutates a freshly-built copy of the same template (buildProject() factories stay independent)');

// ---- personalizeProject: no options at all is a safe no-op ----
const untouched = personalizeProject(webcamScene, {});
assert(JSON.stringify(untouched) === JSON.stringify(webcamScene), 'calling personalizeProject with no options returns an unchanged copy, not a crash or partial mutation');

// ---- personalizeProject: only accent color set, text left as-is ----
const colorOnly = personalizeProject(webcamScene, { accentColor: '#35e6c4' });
const colorOnlySlide = colorOnly.items.find((i) => i.type === 'popup-slide');
assert(colorOnlySlide.props.colors.violet === '#35e6c4', 'accent color alone still applies');
assert(colorOnlySlide.props.slides[0].text === 'YourSite.com', 'text is left at its default when no text override is given, even though color changed');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
