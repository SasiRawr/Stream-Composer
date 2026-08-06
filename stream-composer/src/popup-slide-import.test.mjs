// ============================================================================
// Tests for popup-slide-import.js. Runs in plain Node.
//
// Run with: node src/popup-slide-import.test.mjs
// ============================================================================

import { parseSlidesText, slidesToPlaintext } from './popup-slide-import.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

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

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
