// ============================================================================
// Tests for now-playing-engine.js. Same discipline as every other engine
// module: checks the generated STRING output only (it's a string builder,
// not a browser/fetch API) - actual live behavior needs a real browser
// polling the real local server, see the WHAT_TO_TEST checklist for that.
//
// Run with: node src/now-playing-engine.test.mjs
// ============================================================================

import { buildNowPlayingScript } from './now-playing-engine.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

function checkSyntax(script, label) {
  let err = null;
  try { new Function(script); } catch (e) { err = e; }
  assert(err === null, `${label}: generated script is syntactically valid JS (got: ${err && err.message})`);
}

// ---- basic generation ----
const script = buildNowPlayingScript('nowplaying-item1-0', { refreshIntervalMs: 3000, showAlbum: true });
assert(script.includes("document.getElementById('nowplaying-item1-0-wrap')"), 'references the correct wrapper element id for this instance');
assert(script.includes("document.getElementById('nowplaying-item1-0-title')"), 'references the correct title element id for this instance');
assert(script.includes("document.getElementById('nowplaying-item1-0-artist')"), 'references the correct artist element id for this instance');
assert(script.includes("document.getElementById('nowplaying-item1-0-album')"), 'references the correct album element id for this instance');
assert(script.includes("document.getElementById('nowplaying-item1-0-status')"), 'references the correct status element id for this instance');
assert(script.includes("REFRESH_MS = 3000"), 'the configured refresh interval is baked into the output');
assert(script.includes('SHOW_ALBUM = true'), 'the configured show-album setting is baked into the output');
assert(script.includes("http://127.0.0.1:5759/"), 'polls the local now-playing server on the correct port');
assert(script.includes('setInterval(poll, REFRESH_MS)'), 'polls on a real interval, not just once at load');
assert(script.includes("fetch(NOW_PLAYING_URL"), 'uses fetch, not a hardcoded/static value');
checkSyntax(script, 'basic');

// ---- showAlbum: false is honored ----
const noAlbumScript = buildNowPlayingScript('nowplaying-item2-1', { showAlbum: false });
assert(noAlbumScript.includes('SHOW_ALBUM = false'), 'showAlbum: false is baked into the output correctly');
checkSyntax(noAlbumScript, 'no-album');

// ---- refresh interval clamping: never below a sane floor ----
const tooFastScript = buildNowPlayingScript('nowplaying-item3-2', { refreshIntervalMs: 10 });
assert(tooFastScript.includes('REFRESH_MS = 500'), 'an absurdly low refreshIntervalMs clamps up to a sane floor (500ms), never hammering the local server');

// ---- defaults: no props at all still produces a valid, sensible script ----
const defaultScript = buildNowPlayingScript('nowplaying-item4-3', {});
assert(defaultScript.includes('REFRESH_MS = 2000'), 'an unset refreshIntervalMs defaults to a reasonable 2000ms');
assert(defaultScript.includes('SHOW_ALBUM = true'), 'an unset showAlbum defaults to true (shown)');
checkSyntax(defaultScript, 'default');

// ---- visibility logic: hides when nothing is playing, shows only when actually playing ----
assert(script.includes("wrapEl.classList.remove('is-visible')"), 'hides the widget when the local server has no track info');
assert(script.includes("wrapEl.classList.toggle('is-visible', !!info.playing)"), 'only shows the widget when something is actually playing, not just when track info exists but is paused');

// ---- distinct instances don't leak each other's ids ----
const scriptA = buildNowPlayingScript('nowplaying-A', {});
const scriptB = buildNowPlayingScript('nowplaying-B', {});
assert(!scriptA.includes('nowplaying-B') && !scriptB.includes('nowplaying-A'), "two different instances' scripts don't reference each other's element ids");

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
