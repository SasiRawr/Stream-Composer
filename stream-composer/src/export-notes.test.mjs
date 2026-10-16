// ============================================================================
// Tests for export-notes.js. Runs in plain Node - see chromakey.test.mjs for
// why that property matters.
//
// Run with: node src/export-notes.test.mjs
// ============================================================================

import { buildExportNotes, exportNotesToText } from './export-notes.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok:', msg);
}

const item = (id, type, props) => ({ id, type, x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 1, props });
const noteFor = (it) => buildExportNotes([it])[0];
const all = (note) => [...note.problems, ...note.steps].join(' | ');

// ---- items that need nothing stay out of the list ----
assert(buildExportNotes([item('f', 'frame', {}), item('s', 'popup-slide', { slides: [] })]).length === 0, 'frames and popup slides produce no notes');
assert(buildExportNotes([]).length === 0 && buildExportNotes(undefined).length === 0, 'empty/missing item lists are fine');
assert(buildExportNotes([item('i', 'image', { sourcePath: 'a.png' })]).length === 0, 'an image with a source file produces no note');
assert(noteFor(item('i', 'image', { sourcePath: '' })).problems.length === 1, 'an image with no source file is flagged');

// ---- PNGTuber ----
{
  const n = noteFor(item('p', 'pngtuber', { style: 'swap', audioSource: 'obs', obsInputName: 'Mic/Aux', idleImagePath: '', talkingImagePath: '' }));
  assert(n.problems.some((s) => s === 'This PNGTuber has no image - it will be invisible.'), 'imageless PNGTuber: flagged as invisible');
  assert(/Stream Composer Suite running/.test(all(n)) && /WebSocket Server Settings/.test(all(n)), 'OBS-audio PNGTuber: says to keep the app running and connect the OBS WebSocket server');
}
{
  const n = noteFor(item('p', 'pngtuber', { style: 'swap', audioSource: 'obs', obsInputName: 'Mic', idleImagePath: 'a.png', talkingImagePath: '' }));
  assert(n.problems.length === 1 && /talking image/.test(n.problems[0]), 'swap with no talking image: flagged specifically');
}
{
  const n = noteFor(item('p', 'pngtuber', { style: 'bounce', audioSource: 'obs', obsInputName: 'Mic', idleImagePath: 'a.png' }));
  assert(n.problems.length === 0, 'bounce with its one image and an input chosen: no problems');
}
{
  const n = noteFor(item('p', 'pngtuber', { style: 'mouthFlap', audioSource: 'obs', obsInputName: 'Mic', bodyImagePath: 'b.png', mouthOpenImagePath: 'o.png', mouthClosedImagePath: '' }));
  assert(n.problems.length === 1 && /closed-mouth image/.test(n.problems[0]), 'mouthFlap missing the closed-mouth image: flagged specifically');
}
{
  const n = noteFor(item('p', 'pngtuber', { style: 'swap', audioSource: 'obs', obsInputName: '', idleImagePath: 'a.png', talkingImagePath: 'b.png' }));
  assert(n.problems.some((s) => /No OBS audio input/.test(s)), 'OBS audio with no input chosen: flagged');
}
{
  const n = noteFor(item('p', 'pngtuber', { style: 'bounce', audioSource: 'mic', idleImagePath: 'a.png' }));
  assert(/experimental/i.test(all(n)) && /--enable-media-stream/.test(all(n)), 'mic mode: experimental note mentioning --enable-media-stream');
}

// ---- live chat items ----
{
  const n = noteFor(item('v', 'viewer-pet', { petImagePath: '', channelName: '' }));
  assert(n.problems.length === 2, 'viewer pet with no image and no channel: both flagged');
  assert(noteFor(item('r', 'pet-roster', { petImagePath: 'a.png', channelName: 'streamer' })).problems.length === 0, 'configured pet roster: no problems, still gets the internet note');
}
{
  const n = noteFor(item('c', 'chat-overlay', { platforms: [{ key: 'twitch', enabled: true, channelName: '' }], ttsEnabled: false }));
  assert(n.problems.some((s) => /never connect/.test(s)), 'chat overlay with no usable channel: flagged');
  const ok = buildExportNotes([item('c', 'chat-overlay', { platforms: [{ key: 'twitch', enabled: true, channelName: 'me' }], ttsEnabled: false })]);
  assert(ok.length === 0, 'chat overlay with a channel and no TTS: nothing to say');
  const polly = noteFor(item('c', 'chat-overlay', { platforms: [{ key: 'twitch', enabled: true, channelName: 'me' }], ttsEnabled: true, ttsProvider: 'polly' }));
  assert(polly.problems.some((s) => /Polly/.test(s)), 'Polly without credentials: flagged');
  const kokoro = noteFor(item('c', 'chat-overlay', { platforms: [{ key: 'twitch', enabled: true, channelName: 'me' }], ttsEnabled: true, ttsProvider: 'kokoro' }));
  assert(kokoro.steps.some((s) => /Kokoro/.test(s) && /running/.test(s)), 'Kokoro TTS: says the voice service and app must be running');
}

// ---- now playing / countdown / alerts ----
assert(/Stream Composer Suite running/.test(all(noteFor(item('n', 'now-playing', {})))), 'now playing: app must be running');
assert(noteFor(item('t', 'countdown-timer', { targetDateTime: '' })).problems.length === 1, 'countdown with no target: flagged');
assert(buildExportNotes([item('t', 'countdown-timer', { targetDateTime: '2030-01-01T10:00' })]).length === 0, 'countdown with a target: nothing to say');
{
  const n = noteFor(item('a', 'twitch-alerts', { accessToken: '', broadcasterUserId: '', rules: [{ eventType: 'follow', enabled: false }] }));
  assert(n.problems.length === 2, 'alerts not signed in and nothing enabled: both flagged');
  const ok = noteFor(item('a', 'twitch-alerts', { accessToken: 't', broadcasterUserId: '1', rules: [{ eventType: 'follow', enabled: true, mediaPath: 'a.png' }] }));
  assert(ok.problems.length === 0, 'configured alerts: no problems');
}

// ---- README text ----
{
  const notes = buildExportNotes([item('p', 'pngtuber', { style: 'bounce', audioSource: 'obs', obsInputName: 'Mic', idleImagePath: '' })]);
  const text = exportNotesToText(notes);
  assert(text.includes('PNGTuber') && text.includes('! This PNGTuber has no image - it will be invisible.') && text.includes('\r\n'), 'README text lists the item, its problem and uses CRLF');
  assert(exportNotesToText([]) === '', 'no notes: no README section');
}

if (failures > 0) { console.error(failures + ' test(s) failed'); process.exit(1); }
console.log('All tests passed.');
