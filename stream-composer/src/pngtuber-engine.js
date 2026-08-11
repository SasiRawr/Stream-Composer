// ============================================================================
// PNGTUBER ENGINE — the actual runtime behavior baked into scene.html's
// <script> block for a pngtuber item: swaps between an "idle" and a
// "talking" image based on the streamer's own live mic volume, the same
// mechanism Veadotube Mini and similar free tools use (confirmed via
// research, ROADMAP.md's PNGTuber section). One instance per item, scoped
// by instanceId, same discipline as every other engine module here.
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
// ============================================================================

export function buildPngtuberScript(instanceId, idleAssetPath, talkingAssetPath, props) {
  return `
(function () {
  const THRESHOLD = ${JSON.stringify(Math.max(0, Math.min(1, (props.micThreshold ?? 15) / 100)))};
  const HOLD_MS = ${JSON.stringify(props.holdMs ?? 200)};
  const IDLE_SRC = ${JSON.stringify(idleAssetPath)};
  const TALKING_SRC = ${JSON.stringify(talkingAssetPath)};

  const imgEl = document.getElementById('${instanceId}-img');
  const statusEl = document.getElementById('${instanceId}-status');

  let audioCtx = null;
  let analyser = null;
  let dataArray = null;
  let isTalking = false;
  let lastLoudAt = 0;
  let rafHandle = null;

  function setTalking(talking) {
    if (talking === isTalking) return;
    isTalking = talking;
    imgEl.src = talking ? TALKING_SRC : IDLE_SRC;
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
      // HOLD_MS keeps the talking image up briefly through short gaps
      // (mid-sentence pauses, plosive dips) instead of flickering back to
      // idle on every micro-silence - same "recency/stability over raw
      // instantaneous accuracy" choice the TTS queue cap made earlier.
      setTalking(false);
    }

    rafHandle = requestAnimationFrame(frame);
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
