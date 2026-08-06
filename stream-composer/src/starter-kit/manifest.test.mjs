// ============================================================================
// Tests for starter-kit/manifest.js. Runs in plain Node.
//
// Run with: node src/starter-kit/manifest.test.mjs
// ============================================================================

import { buildSceneHtml } from '../bake.js';
import { STARTER_TEMPLATES } from './manifest.js';

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

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
