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

export function buildPngtuberScript(instanceId, assets, props) {
  const style = props.style || 'swap';
  return `
(function () {
  const STYLE = ${JSON.stringify(style)};
  const THRESHOLD = ${JSON.stringify(Math.max(0, Math.min(1, (props.micThreshold ?? 15) / 100)))};
  const HOLD_MS = ${JSON.stringify(props.holdMs ?? 200)};
  const IDLE_SRC = ${JSON.stringify(assets.idle || '')};
  const TALKING_SRC = ${JSON.stringify(assets.talking || '')};
  const MOUTH_OPEN_SRC = ${JSON.stringify(assets.mouthOpen || '')};
  const MOUTH_CLOSED_SRC = ${JSON.stringify(assets.mouthClosed || '')};
  const FLAP_INTERVAL_MS = ${JSON.stringify(props.flapIntervalMs ?? 120)};

  const imgEl = document.getElementById('${instanceId}-img');
  const mouthEl = document.getElementById('${instanceId}-mouth');
  const statusEl = document.getElementById('${instanceId}-status');

  let audioCtx = null;
  let analyser = null;
  let dataArray = null;
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

    const now = performance.now();
    if (rms > THRESHOLD) {
      lastLoudAt = now;
      setTalking(true);
    } else if (now - lastLoudAt > HOLD_MS) {
      // HOLD_MS keeps the talking state up briefly through short gaps
      // (mid-sentence pauses, plosive dips) instead of flickering back to
      // idle on every micro-silence - same "recency/stability over raw
      // instantaneous accuracy" choice the TTS queue cap made earlier.
      setTalking(false);
    }

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
})();`;
}
