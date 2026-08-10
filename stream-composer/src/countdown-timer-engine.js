// ============================================================================
// COUNTDOWN TIMER ENGINE — the actual runtime behavior baked into
// scene.html's <script> block for a countdown-timer item: ticks down to a
// target date/time once a second, swapping to a "complete" message at zero.
// One instance per item, scoped by instanceId, same discipline as
// popup-slide-engine.js/chat-tts-engine.js.
//
// No network, no live-connection risk at all — pure client-side clock math
// against a target the streamer set at edit time. Re-implements
// countdown-timer.js's math inline (baked output has no module imports
// available) — see that file's header comment for why.
// ============================================================================

export function buildCountdownTimerScript(instanceId, props) {
  const targetMs = props.targetDateTime ? new Date(props.targetDateTime).getTime() : NaN;

  return `
(function () {
  const TARGET_MS = ${JSON.stringify(Number.isNaN(targetMs) ? null : targetMs)};
  const SHOW_DAYS = ${JSON.stringify(!!props.showDays)};
  const COMPLETED_TEXT = ${JSON.stringify(props.completedText || '')};

  const gridEl = document.getElementById('${instanceId}-grid');
  const completeEl = document.getElementById('${instanceId}-complete');
  const daysWrapEl = document.getElementById('${instanceId}-days-wrap');
  const daysEl = document.getElementById('${instanceId}-days');
  const hoursEl = document.getElementById('${instanceId}-hours');
  const minutesEl = document.getElementById('${instanceId}-minutes');
  const secondsEl = document.getElementById('${instanceId}-seconds');

  function pad2(n) { return String(n).padStart(2, '0'); }

  let handle = null;

  function tick() {
    if (TARGET_MS === null) return;
    const totalMs = Math.max(0, TARGET_MS - Date.now());
    const totalSeconds = Math.floor(totalMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (totalMs <= 0) {
      gridEl.style.display = 'none';
      completeEl.style.display = 'block';
      completeEl.textContent = COMPLETED_TEXT;
      if (handle !== null) clearInterval(handle);
      return;
    }

    if (daysWrapEl) daysWrapEl.style.display = SHOW_DAYS ? '' : 'none';
    if (daysEl) daysEl.textContent = pad2(days);
    hoursEl.textContent = pad2(SHOW_DAYS ? hours : hours + days * 24);
    minutesEl.textContent = pad2(minutes);
    secondsEl.textContent = pad2(seconds);
  }

  tick();
  handle = setInterval(tick, 1000);
})();`;
}
