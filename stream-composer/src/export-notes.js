// ============================================================================
// EXPORT NOTES - what each exported item needs before it works in OBS
// ============================================================================
// Baked output never draws setup, permission or error text (it would sit in
// front of viewers), so those instructions live here instead: the app shows
// them in a popup after a bake/export and writes them into the README that
// ships alongside. Every requirement below mirrors what the matching
// *-engine.js actually does at runtime. Plain data in, plain data out - no
// DOM, no Tauri - so it is directly unit-testable.
//
// Each note is { itemId, type, label, problems: string[], steps: string[] }:
//   problems - things that are visibly broken as configured (the item will be
//              invisible, never connect, etc.)
//   steps    - what the streamer has to do/keep running for it to work
// Items with nothing to say produce no note at all.
// ============================================================================

const TYPE_LABELS = {
  frame: 'Frame / Border',
  image: 'Image',
  'popup-slide': 'Popup Slide',
  'chat-overlay': 'Chat + TTS Overlay',
  'countdown-timer': 'Countdown Timer',
  pngtuber: 'PNGTuber',
  'viewer-pet': 'Viewer Pet',
  'pet-roster': 'Chat Pet Roster',
  'now-playing': 'Now Playing',
  'twitch-alerts': 'Twitch Alerts',
};

const has = (v) => typeof v === 'string' && v.trim() !== '';

// Which image props a PNGTuber style cannot work without (see pngtuber-engine.js).
function pngtuberMissingImages(p) {
  const style = p.style || 'swap';
  if (style === 'mouthFlap') {
    const missing = [];
    if (!has(p.bodyImagePath)) missing.push('body image');
    if (!has(p.mouthOpenImagePath)) missing.push('open-mouth image');
    if (!has(p.mouthClosedImagePath)) missing.push('closed-mouth image');
    return missing;
  }
  if (style === 'swap') {
    const missing = [];
    if (!has(p.idleImagePath)) missing.push('idle image');
    if (!has(p.talkingImagePath)) missing.push('talking image');
    return missing;
  }
  return has(p.idleImagePath) ? [] : ['character image'];
}

function pngtuberNote(p) {
  const problems = [];
  const steps = [];
  const missing = pngtuberMissingImages(p);
  const style = p.style || 'swap';
  const hasAnyImage = style === 'mouthFlap'
    ? has(p.bodyImagePath)
    : has(p.idleImagePath);
  if (!hasAnyImage) {
    problems.push('This PNGTuber has no image - it will be invisible.');
  } else if (missing.length > 0) {
    problems.push(`This PNGTuber is missing its ${missing.join(' and ')} - it will not animate correctly.`);
  }
  if (p.audioSource === 'mic') {
    problems.push('Microphone mode is experimental: OBS usually blocks microphone access for browser sources, so this PNGTuber may never react. Switching it to OBS audio is recommended.');
    steps.push('Microphone mode only: launching OBS with the --enable-media-stream option may allow it, but that is not guaranteed on current OBS versions.');
  } else {
    if (!has(p.obsInputName)) problems.push('No OBS audio input is chosen for this PNGTuber - it will never react.');
    steps.push('Keep Stream Composer Suite running while you stream - it reads the live audio level from OBS.');
    steps.push('In OBS, open Tools > WebSocket Server Settings and enable the WebSocket server, then connect to it from this PNGTuber\'s properties panel (host, port and password).');
  }
  return { problems, steps };
}

function chatOverlayNote(p) {
  const problems = [];
  const steps = [];
  const platforms = (p.platforms || []).filter((pl) => pl.enabled);
  const usable = platforms.filter((pl) => has(pl.channelName) && (pl.key !== 'tiktok' || has(pl.apiKey)));
  if (usable.length === 0) {
    problems.push('No chat platform is enabled with a channel name - this overlay will never connect or show messages.');
  }
  for (const pl of platforms) {
    if (!has(pl.channelName)) problems.push(`${pl.key} is enabled but has no channel name, so it is skipped.`);
    else if (pl.key === 'tiktok' && !has(pl.apiKey)) problems.push('TikTok is enabled but has no API key, so it is skipped.');
  }
  if (p.ttsEnabled) {
    const provider = p.ttsProvider || 'browser';
    if (provider === 'polly') {
      if (!has(p.pollyAccessKeyId) || !has(p.pollySecretAccessKey)) problems.push('Amazon Polly is selected but its AWS credentials are not filled in, so there will be no spoken audio.');
    } else if (provider === 'kokoro' || provider === 'chatterbox') {
      steps.push(`Start the ${provider === 'kokoro' ? 'Kokoro' : 'Chatterbox'} voice service from this item's properties panel and keep Stream Composer Suite running while you stream, or messages will not be spoken.`);
    }
  }
  return { problems, steps };
}

function alertsNote(p) {
  const problems = [];
  const steps = [];
  if (!has(p.accessToken) || !has(p.broadcasterUserId)) {
    problems.push('Twitch is not connected for this item - sign in from its properties panel, or no alerts will fire.');
  }
  const enabledRules = (p.rules || []).filter((r) => r.enabled);
  if (enabledRules.length === 0) problems.push('No alert is switched on - nothing will ever be shown.');
  else if (!enabledRules.some((r) => has(r.mediaPath) || has(r.soundPath))) problems.push('The enabled alerts have no media or sound file - they will show nothing.');
  steps.push('Alerts run inside the OBS browser source and need an internet connection; Stream Composer Suite does not need to stay open.');
  return { problems, steps };
}

/**
 * @param {Array} items - project items (or the single item being exported)
 * @returns {Array<{itemId:string,type:string,label:string,problems:string[],steps:string[]}>}
 */
export function buildExportNotes(items) {
  const notes = [];
  for (const item of items || []) {
    const p = item.props || {};
    let problems = [];
    let steps = [];
    let result = null;

    if (item.type === 'pngtuber') result = pngtuberNote(p);
    else if (item.type === 'chat-overlay') result = chatOverlayNote(p);
    else if (item.type === 'twitch-alerts') result = alertsNote(p);
    else if (item.type === 'now-playing') {
      steps.push('Keep Stream Composer Suite running while you stream - this card reads the currently playing track from it. It stays hidden whenever nothing is playing or the app is closed.');
    } else if (item.type === 'viewer-pet' || item.type === 'pet-roster') {
      if (!has(p.petImagePath)) problems.push('No pet image is set - nothing will be visible.');
      if (!has(p.channelName)) problems.push('No channel name is set - this item will never connect to chat.');
      steps.push('Needs an internet connection to read chat. Stream Composer Suite does not need to stay open.');
    } else if (item.type === 'countdown-timer') {
      if (!has(p.targetDateTime) || Number.isNaN(new Date(p.targetDateTime).getTime())) problems.push('No target date and time is set - the countdown will not run.');
    } else if (item.type === 'image') {
      if (!has(p.sourcePath)) problems.push('This image item has no source file - it will be empty.');
    }

    if (result) ({ problems, steps } = result);
    if (problems.length === 0 && steps.length === 0) continue;
    notes.push({ itemId: item.id, type: item.type, label: TYPE_LABELS[item.type] || item.type, problems, steps });
  }
  return notes;
}

/** Plain-text version for README.txt (CRLF, to match the other READMEs this app writes). */
export function exportNotesToText(notes) {
  if (!notes || notes.length === 0) return '';
  const out = ['SETUP NOTES', '', 'Nothing below is ever drawn into your stream. These are the things to check before going live:', ''];
  for (const note of notes) {
    out.push(`${note.label}`);
    for (const problem of note.problems) out.push(`  ! ${problem}`);
    for (const step of note.steps) out.push(`  - ${step}`);
    out.push('');
  }
  return out.join('\r\n');
}
