// ============================================================================
// PNGTUBER ENGINE — the actual runtime behavior baked into scene.html's
// <script> block for a pngtuber item: reacts to the streamer's own live mic
// volume, the same core mechanism Veadotube Mini and similar free tools use
// (confirmed via research, ROADMAP.md's PNGTuber section). One instance per
// item, scoped by instanceId, same discipline as every other engine module
// here. All four styles below share the exact same mic-volume-detection core
// (RMS + threshold + hold-time debounce) - only what happens on a talking-
// state change differs per style.
//
// Needs a live mic (getUserMedia) inside OBS's Browser Source - this is
// the first item type in the app asking for a media permission, not just
// network access like the Chat + TTS Overlay. OBS (27+) supports this,
// but the Browser Source has to actually be granted mic access once
// (right-click the source -> Interact, or OBS's own permission prompt) -
// this is a real one-time setup step, not something this script can
// bypass - flagged in the properties panel and the testing checklist,
// not glossed over.
//
// No network, no live-connection risk - pure client-side audio analysis
// against the streamer's own mic, same "no live-connection risk" category
// as the countdown timer, just reading a media stream instead of a clock.
//
// Four selectable styles (props.style), one per item - not combinable in
// this pass, matching every other item type's "pick one behavior" UX:
//   'swap'       - the original v1.10.0 behavior: swaps between an idle
//                  and a talking image outright.
//   'bounce'     - a single image that bobs/bounces (via a looping CSS
//                  keyframe animation) for as long as you're talking.
//   'brightness' - a single image that lightens while you talk and dims
//                  back down while you're quiet (a CSS filter transition,
//                  not a src swap).
//   'mouthFlap'  - a static body image plus a separate mouth layer
//                  overlaid on top, alternating between an open and closed
//                  mouth image on a fixed interval for as long as you're
//                  talking (bake.js positions the mouth layer via
//                  mouthTopPercent/mouthLeftPercent/mouthWidthPercent).
// ============================================================================

// Shared trigger state machine - RMS/level above THRESHOLD means talking;
// once quiet, HOLD_MS keeps the talking state up briefly through short gaps
// (mid-sentence pauses, plosive dips) instead of flickering back to idle on
// every micro-silence, same "recency/stability over raw instantaneous
// accuracy" choice the TTS queue cap made elsewhere. Pulled out of frame()
// as a real, independently-testable pure function (see
// pngtuber-engine.test.mjs) AND inlined verbatim into the baked script via
// evaluateTalking.toString() below - both the getUserMedia mic mode and the
// OBS-source poll mode call this exact same function, so the two can never
// drift out of sync with each other or with what's tested here.
export function evaluateTalking(level01, threshold, holdMs, now, lastLoudAt, isTalking) {
  if (level01 > threshold) {
    return { talking: true, lastLoudAt: now };
  }
  if (now - lastLoudAt > holdMs) {
    return { talking: false, lastLoudAt };
  }
  return { talking: isTalking, lastLoudAt };
}

// OBS's InputVolumeMeters event already reports a linear amplitude value
// (obws's own "Mul" level, not dBFS) - the same 0-1-ish scale THRESHOLD/RMS
// already use, so the OBS-source poll loop only needs to clamp it, not
// convert it. Clamped because OBS's linear level can exceed 1 while
// clipping. Also inlined verbatim into the baked script, same reasoning
// as every other shared function here.
export function clampObsLevel01(level) {
  return Math.max(0, Math.min(1, level));
}

// itemId is the item's RAW, unsanitized `id` field (main.js's `uid()`, e.g.
// "item-a1b2c3d4") - deliberately distinct from `instanceId` above, which
// is a SANITIZED + index-suffixed DOM id (e.g. "pngtuber-itema1b2c3d4-0")
// safe to use as an HTML element id but useless for looking this item back
// up in project.json (the two strings can never be equal). Only needed for
// 'obs' mode, where it's baked into the polling URL as `itemId=` so the
// local relay (src-tauri/src/lib.rs's find_obs_item_settings) can re-read
// this item's live obsInputName/micThreshold/holdMs props from the
// CURRENTLY OPEN project file on every poll - the relay itself already
// knows which project that is (main.js mirrors its `projectFolder` into
// Rust app state, see set_current_project_path), it just needs to know
// which item within it. The project file itself might not exist yet (an
// unsaved project) or might not contain a matching id (a stale bake) - in
// either case the relay falls back to the baked micThreshold/holdMs/
// obsInputName query params below, per-field, same graceful-degrade
// discipline the fully-unreachable-relay catch block below already has.
export function buildPngtuberScript(instanceId, assets, props, itemId) {
  const style = props.style || 'swap';
  const audioSource = props.audioSource === 'obs' ? 'obs' : 'mic';
  const micThreshold = props.micThreshold ?? 15;
  const holdMs = props.holdMs ?? 200;
  const obsInputName = props.obsInputName || '';

  // Bake-time fallback query params for the local relay - it re-reads live
  // obsInputName/micThreshold/holdMs from the current project file (via
  // itemId) on every poll and only falls back to these, field by field, if
  // that read fails. Deliberately does NOT send the project's file path -
  // the relay already knows it, and trusting a client-supplied path over
  // this unauthenticated HTTP endpoint was the whole security hole this
  // wire contract was rebuilt to close.
  const obsPollUrl = 'http://127.0.0.1:5760/?' +
    'itemId=' + encodeURIComponent(itemId || '') +
    '&micThreshold=' + encodeURIComponent(micThreshold) +
    '&holdMs=' + encodeURIComponent(holdMs) +
    '&obsInputName=' + encodeURIComponent(obsInputName);

  const audioSourceScript = audioSource === 'obs' ? `
  const OBS_POLL_URL = ${JSON.stringify(obsPollUrl)};
  const OBS_INPUT_NAME = ${JSON.stringify(obsInputName)};
  const OBS_POLL_INTERVAL_MS = 100;

  ${clampObsLevel01.toString()}

  async function pollObsInput() {
    try {
      const res = await fetch(OBS_POLL_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      let level01 = 0;
      if (data && data.obsConnected && data.inputFound) {
        level01 = clampObsLevel01(data.level);
        if (statusEl) statusEl.style.display = 'none';
      } else if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = (!data || !data.obsConnected)
          ? 'PNGTuber needs OBS connected in Stream Composer Suite to react to "' + OBS_INPUT_NAME + '".'
          : 'PNGTuber cannot find the OBS input "' + OBS_INPUT_NAME + '" - check the name in the properties panel.';
      }
      // The relay re-reads live micThreshold/holdMs from the project file
      // on every poll (see find_obs_item_settings in lib.rs) so a changed
      // sensitivity slider takes effect without a re-bake - this is the
      // whole point of 'obs' mode, unlike the default mic mode below, which
      // has no live connection to the properties panel at all and keeps
      // using its own baked THRESHOLD/HOLD_MS forever. Same 0-100 -> 0-1
      // conversion as the baked THRESHOLD constant below. Falls back to
      // that baked constant only if this particular response is missing/
      // malformed for some reason (e.g. an older relay build).
      const liveThreshold = typeof data?.micThreshold === 'number'
        ? Math.max(0, Math.min(1, data.micThreshold / 100))
        : THRESHOLD;
      const liveHoldMs = typeof data?.holdMs === 'number' ? data.holdMs : HOLD_MS;
      applyLevel(level01, performance.now(), liveThreshold, liveHoldMs);
    } catch (e) {
      // Local relay isn't reachable - almost always means Stream Composer
      // Suite itself isn't running on this PC right now, same "needs the
      // sidecar alive" status pattern now-playing-engine.js uses. Feed a
      // silent level through the SAME state machine rather than special-
      // casing this into a different code path. No live response to read
      // a threshold/hold from here, so this falls back to the baked
      // constants same as every other item type already does when its
      // sidecar is unreachable.
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = 'PNGTuber needs Stream Composer Suite running on this PC to react to OBS audio.';
      }
      applyLevel(0, performance.now(), THRESHOLD, HOLD_MS);
    }
  }

  pollObsInput();
  setInterval(pollObsInput, OBS_POLL_INTERVAL_MS);
` : `
  let audioCtx = null;
  let analyser = null;
  let dataArray = null;

  function frame() {
    analyser.getByteTimeDomainData(dataArray);
    // RMS of the time-domain samples (centered on 128 for 8-bit unsigned
    // PCM) - a standard, cheap "how loud is this right now" measure, the
    // same approach Veadotube-style tools use rather than anything
    // frequency-domain (no need for pitch/timbre detection here, just
    // "is someone making noise").
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const centered = (dataArray[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    applyLevel(rms, performance.now());
    requestAnimationFrame(frame);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      dataArray = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      if (statusEl) statusEl.style.display = 'none';
      frame();
    } catch (e) {
      console.warn('PNGTuber: could not access the microphone - grant mic permission to this Browser Source (right-click it in OBS -> Interact, then allow) and refresh.', e);
      if (statusEl) statusEl.textContent = 'Mic access needed - right-click this source in OBS, choose Interact, then allow microphone access and refresh.';
    }
  }

  start();
`;

  return `
(function () {
  const STYLE = ${JSON.stringify(style)};
  const THRESHOLD = ${JSON.stringify(Math.max(0, Math.min(1, micThreshold / 100)))};
  const HOLD_MS = ${JSON.stringify(holdMs)};
  const IDLE_SRC = ${JSON.stringify(assets.idle || '')};
  const TALKING_SRC = ${JSON.stringify(assets.talking || '')};
  const MOUTH_OPEN_SRC = ${JSON.stringify(assets.mouthOpen || '')};
  const MOUTH_CLOSED_SRC = ${JSON.stringify(assets.mouthClosed || '')};
  const FLAP_INTERVAL_MS = ${JSON.stringify(props.flapIntervalMs ?? 120)};

  const imgEl = document.getElementById('${instanceId}-img');
  const mouthEl = document.getElementById('${instanceId}-mouth');
  const statusEl = document.getElementById('${instanceId}-status');

  let isTalking = false;
  let lastLoudAt = 0;
  let flapHandle = null;
  let flapOpen = false;

  function startFlap() {
    if (flapHandle || !mouthEl) return;
    flapOpen = false;
    flapHandle = setInterval(() => {
      flapOpen = !flapOpen;
      mouthEl.src = flapOpen ? MOUTH_OPEN_SRC : MOUTH_CLOSED_SRC;
    }, FLAP_INTERVAL_MS);
  }

  function stopFlap() {
    if (flapHandle) {
      clearInterval(flapHandle);
      flapHandle = null;
    }
    if (mouthEl) mouthEl.src = MOUTH_CLOSED_SRC;
  }

  function setTalking(talking) {
    if (talking === isTalking) return;
    isTalking = talking;
    if (STYLE === 'swap') {
      imgEl.src = talking ? TALKING_SRC : IDLE_SRC;
    } else if (STYLE === 'mouthFlap') {
      if (talking) startFlap(); else stopFlap();
    } else {
      // 'bounce' and 'brightness' - both driven entirely by a CSS class
      // toggle, the animation/filter itself lives in bake.js's scoped
      // <style> block for this instance.
      imgEl.classList.toggle('is-talking', talking);
    }
  }

  ${evaluateTalking.toString()}

  // threshold/holdMs are optional overrides - 'obs' mode's pollObsInput()
  // passes the live values it just read from the relay so a changed
  // sensitivity slider takes effect without a re-bake (the whole point of
  // that mode); every other caller (the default mic mode's frame() below,
  // and pollObsInput()'s own unreachable-relay fallback) omits them and
  // gets the baked THRESHOLD/HOLD_MS constants, UNCHANGED from before this
  // parameter existed.
  function applyLevel(level01, now, threshold, holdMs) {
    const result = evaluateTalking(level01, threshold ?? THRESHOLD, holdMs ?? HOLD_MS, now, lastLoudAt, isTalking);
    lastLoudAt = result.lastLoudAt;
    setTalking(result.talking);
  }
${audioSourceScript}
})();`;
}

// Minimum gap (in the same 0-1 RMS units as THRESHOLD above) between a
// measured silence floor and a measured speaking level for auto-calibration
// to trust the result. Below this, the mic/room can't reliably tell "quiet"
// from "talking" (bad mic, room noise as loud as the voice, or the user
// didn't actually talk during the sampling window) - safer to ask for a
// retry than bake in a threshold that will either never fire or never let go.
const MIN_CALIBRATION_GAP = 0.015;

// Editor-side auto-calibrate: given an averaged silence-floor RMS and an
// averaged speaking RMS (both 0-1, same units as THRESHOLD/micThreshold),
// pick a sensible mic sensitivity. Sits close to the silence floor rather
// than the midpoint so quieter talkers still trigger reliably, while still
// clearing typical room-noise/mic-hiss picked up during the silence sample -
// a judgment call in the same spirit as HOLD_MS above, not a precise science.
// Returns a 1-80 percent (matching the properties panel slider's range), or
// null if the two levels are too close together to calibrate from.
export function computeCalibratedThreshold(silenceRms, speakingRms) {
  const gap = speakingRms - silenceRms;
  if (!(gap > MIN_CALIBRATION_GAP)) return null;
  const rms = silenceRms + gap * 0.35;
  const percent = Math.round(rms * 100);
  return Math.max(1, Math.min(80, percent));
}
