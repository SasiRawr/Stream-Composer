// ============================================================================
// COUNTDOWN TIMER — pure time math, shared source of truth for the
// Countdown Timer overlay item. countdown-timer-engine.js's baked runtime
// re-implements this same math inline (baked scene.html has no module
// imports available), same pattern chat-tts-engine.js already uses for
// chat-message-parsing.js.
// ============================================================================

export function computeRemaining(targetMs, nowMs) {
  const totalMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    isComplete: totalMs <= 0,
  };
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

// When "show days" is off, days fold into the hours figure instead of
// being silently dropped — so a target 2 days away reads as "48" hours,
// not a truncated "0".
export function hoursIncludingDays(remaining, showDays) {
  return showDays ? remaining.hours : remaining.hours + remaining.days * 24;
}
