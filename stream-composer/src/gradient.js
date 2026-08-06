// ============================================================================
// GRADIENT MATH — converts a CSS-style linear-gradient angle (0deg = to top,
// 90deg = to right, clockwise, same convention CSS uses) into normalized
// (0..1) start/end coordinates for a linear gradient spanning a box.
//
// Used so the live Fabric canvas preview (main.js, percentage-unit Gradient
// coords) and the baked CSS output (bake.js, a real `linear-gradient()`)
// agree on what a given angle looks like — one shared formula instead of
// two independent guesses that could drift apart.
//
// Pure math only — directly unit-testable in Node.
// ============================================================================

export function gradientCoordsForAngle(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad) * 0.5;
  const dy = -Math.cos(rad) * 0.5;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}
