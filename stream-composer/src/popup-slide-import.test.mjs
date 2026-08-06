// ============================================================================
// Tests for popup-slide-import.js. Runs in plain Node.
//
// Run with: node src/popup-slide-import.test.mjs
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSlidesText, slidesToPlaintext, evalConfig, legacyConfigToPopupSlideProps } from './popup-slide-import.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// ---- parseSlidesText ----
const basic = parseSlidesText('WEB\nTheNerdyBox.com\n\nGAMES\nWe build indie games');
assert(basic.length === 2, `basic two-slide text parses into 2 slides (got ${basic.length})`);
assert(basic[0].tag === 'WEB' && basic[0].text === 'TheNerdyBox.com', `first slide parsed correctly (got tag=${basic[0].tag} text=${basic[0].text})`);
assert(basic[1].tag === 'GAMES' && basic[1].text === 'We build indie games', `second slide parsed correctly (got tag=${basic[1].tag} text=${basic[1].text})`);

const multilineBody = parseSlidesText('TAG\nline one\nline two');
assert(multilineBody[0].text === 'line one line two', `extra lines in a block join into one text (got "${multilineBody[0].text}")`);

const withBlankPadding = parseSlidesText('\n\nWEB\nhello\n\n\n\nGAMES\nworld\n\n');
assert(withBlankPadding.length === 2, `leading/trailing/extra blank lines don't create empty slides (got ${withBlankPadding.length})`);

const emptyInput = parseSlidesText('   ');
assert(emptyInput.length === 0, `whitespace-only input parses to zero slides (got ${emptyInput.length})`);

const tagOnly = parseSlidesText('JUSTATAG');
assert(tagOnly.length === 1 && tagOnly[0].tag === 'JUSTATAG' && tagOnly[0].text === '', `a tag with no text line still parses (got tag=${tagOnly[0].tag} text="${tagOnly[0].text}")`);

// ---- slidesToPlaintext ----
const roundTrip = parseSlidesText(slidesToPlaintext([{ tag: 'WEB', text: 'TheNerdyBox.com' }, { tag: 'GAMES', text: 'We build indie games' }]));
assert(roundTrip.length === 2 && roundTrip[0].tag === 'WEB' && roundTrip[1].text === 'We build indie games', 'slidesToPlaintext -> parseSlidesText round-trips a two-slide array');

const droppedIcon = slidesToPlaintext([{ tag: 'WEB', text: 'x', iconMode: 'platform', platformKey: 'twitch' }]);
assert(!droppedIcon.includes('platform') && !droppedIcon.includes('twitch'), 'slidesToPlaintext never leaks icon fields into the text output');

// ---- evalConfig ----
const evaluated = evalConfig('const CONFIG = { transitionStyle: "zoom", messages: [{ tag: "A", text: "B" }] };');
assert(evaluated && evaluated.transitionStyle === 'zoom', `evalConfig extracts a real CONFIG object (got transitionStyle=${evaluated && evaluated.transitionStyle})`);
assert(evalConfig('const NOT_CONFIG = { x: 1 };') === undefined, 'evalConfig returns undefined when the text has no CONFIG variable');

// ---- legacyConfigToPopupSlideProps, fed the REAL text of the two v1 fixtures ----
const plaintextFixturePath = path.join(repoRoot, 'v1-pop-up-slide', 'campaign-thenerdybox', 'settings.js');
const plaintextFixtureText = fs.readFileSync(plaintextFixturePath, 'utf8');
const plaintextConfig = evalConfig(plaintextFixtureText);
assert(plaintextConfig !== undefined, 'the real campaign-thenerdybox/settings.js fixture evaluates to a CONFIG object');

const plaintextProps = legacyConfigToPopupSlideProps(plaintextConfig);
assert(plaintextProps.contentMode === 'plaintext', `campaign-thenerdybox uses the plaintext messagesText method (got contentMode=${plaintextProps.contentMode})`);
assert(plaintextProps.slides.length === 3, `campaign-thenerdybox's real settings.js has exactly 3 slides (got ${plaintextProps.slides.length})`);
assert(plaintextProps.slides[0].tag === 'WEB' && plaintextProps.slides[0].text === 'TheNerdyBox.com', `the first real slide is mapped correctly (got tag=${plaintextProps.slides[0].tag} text=${plaintextProps.slides[0].text})`);
assert(plaintextProps.slides.every((s) => s.iconMode === 'none'), 'plaintext-method slides always get iconMode:\'none\' (matches the real limitation)');
assert(plaintextProps.colors.violet === '#7c5cff', `the real brand colors are carried over from the fixture (got violet=${plaintextProps.colors.violet})`);

const structuredFixturePath = path.join(repoRoot, 'v1-pop-up-slide', 'example-separate-images', 'settings.js');
const structuredFixtureText = fs.readFileSync(structuredFixturePath, 'utf8');
const structuredConfig = evalConfig(structuredFixtureText);
assert(structuredConfig !== undefined, 'the real example-separate-images/settings.js fixture evaluates to a CONFIG object');

const structuredProps = legacyConfigToPopupSlideProps(structuredConfig);
assert(structuredProps.contentMode === 'structured', `example-separate-images uses the structured messages method (got contentMode=${structuredProps.contentMode})`);
assert(structuredProps.slides.length === 3, `example-separate-images's real settings.js has exactly 3 slides (got ${structuredProps.slides.length})`);
assert(structuredProps.slides.every((s) => s.iconMode === 'custom'), 'every slide in example-separate-images uses a custom per-slide image (got modes: ' + structuredProps.slides.map((s) => s.iconMode).join(',') + ')');
assert(structuredProps.slides[0].customAssetPath === 'thumb-web.png', `a real per-slide image filename is carried over exactly (got ${structuredProps.slides[0].customAssetPath})`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
