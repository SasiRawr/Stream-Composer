// ============================================================================
// ITEM COORDINATES - where an item sits on the canvas
// ============================================================================
// Every item's x/y is the TOP-LEFT corner of its (unrotated) box, in real
// stream pixels, and rotation turns the box around its CENTER. That is the
// same thing bake.js emits as a CSS box with `transform: rotate()`, so the
// editor and the baked output only agree if the editor honors it too.
//
// Fabric 7 positions objects by their CENTER by default (originX/originY
// 'center'), so the editor converts explicitly in both directions instead of
// treating Fabric's left/top as a top-left corner. Plain math, no Fabric
// import, so it is directly unit-testable.
// ============================================================================

export const COORDINATE_ORIGIN = 'top-left';

/** Fabric left/top (a center point, display pixels) for an item. */
export function itemCenterForFabric(item, displayScale) {
  return {
    left: (item.x + item.width / 2) * displayScale,
    top: (item.y + item.height / 2) * displayScale,
  };
}

/**
 * Item x/y (top-left, real pixels) from a Fabric center point and the
 * object's CURRENT on-screen size (width * scaleX etc., display pixels).
 */
export function itemTopLeftFromFabric(centerX, centerY, scaledWidth, scaledHeight, displayScale) {
  return {
    x: Math.round((centerX - scaledWidth / 2) / displayScale),
    y: Math.round((centerY - scaledHeight / 2) / displayScale),
  };
}

/**
 * Projects saved before this fix were positioned in an editor that stored the
 * item's CENTER in x/y, so what the user saw there is x - width/2. Projects
 * that carry the marker are already top-left and are returned untouched.
 *
 * One exception per item: if the saved box already sits fully inside the
 * canvas and the shifted one would hang off it, the item is left alone. That
 * is an item nobody dragged (a Starter Kit item at 0,0, say) or one whose
 * baked output was already right, and shifting it would break a working
 * scene. Without canvas dimensions every item is shifted.
 * Mutates and returns the project.
 */
export function migrateProjectCoordinates(project) {
  if (!project || project.coordinateOrigin === COORDINATE_ORIGIN) return project;
  const cw = project.canvasWidth;
  const ch = project.canvasHeight;
  const fits = (x, y, w, h) => x >= 0 && y >= 0 && x + w <= cw && y + h <= ch;
  for (const item of project.items || []) {
    const w = item.width || 0;
    const h = item.height || 0;
    const oldX = item.x || 0;
    const oldY = item.y || 0;
    const newX = Math.round(oldX - w / 2);
    const newY = Math.round(oldY - h / 2);
    if (cw > 0 && ch > 0 && fits(oldX, oldY, w, h) && !fits(newX, newY, w, h)) continue;
    item.x = newX;
    item.y = newY;
  }
  project.coordinateOrigin = COORDINATE_ORIGIN;
  return project;
}

/** Stamps a project built in memory (already top-left) so it is never migrated. */
export function markCoordinatesCurrent(project) {
  if (project) project.coordinateOrigin = COORDINATE_ORIGIN;
  return project;
}

// ---- Layout actions (right-click menu) ------------------------------------
// Each returns the item fields to change; the caller applies them the same
// way a drag would.

export function centerPlacement(item, canvasWidth, canvasHeight) {
  return {
    x: Math.round((canvasWidth - item.width) / 2),
    y: Math.round((canvasHeight - item.height) / 2),
  };
}

export function centerHorizontalPlacement(item, canvasWidth) {
  return { x: Math.round((canvasWidth - item.width) / 2) };
}

export function centerVerticalPlacement(item, canvasHeight) {
  return { y: Math.round((canvasHeight - item.height) / 2) };
}

export function stretchPlacement(canvasWidth, canvasHeight) {
  return { x: 0, y: 0, width: canvasWidth, height: canvasHeight, rotation: 0 };
}

/** Largest size with the item's aspect ratio that fits the canvas, centered, unrotated. */
export function fitPlacement(item, canvasWidth, canvasHeight) {
  const ratio = Math.min(canvasWidth / item.width, canvasHeight / item.height);
  const width = Math.max(1, Math.round(item.width * ratio));
  const height = Math.max(1, Math.round(item.height * ratio));
  return {
    x: Math.round((canvasWidth - width) / 2),
    y: Math.round((canvasHeight - height) / 2),
    width,
    height,
    rotation: 0,
  };
}

/**
 * New zIndex for every item after moving one to the front / back / a step
 * either way, as Map(id -> zIndex). Renumbers densely 1..N so ties and gaps
 * can never leave an action a no-op. Null if the id isn't found.
 */
export function reorderZIndexes(items, itemId, mode) {
  const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex);
  const from = sorted.findIndex((i) => i.id === itemId);
  if (from < 0) return null;
  const [moved] = sorted.splice(from, 1);
  let to = from;
  if (mode === 'front') to = sorted.length;
  else if (mode === 'back') to = 0;
  else if (mode === 'forward') to = Math.min(sorted.length, from + 1);
  else if (mode === 'backward') to = Math.max(0, from - 1);
  sorted.splice(to, 0, moved);
  return new Map(sorted.map((item, idx) => [item.id, idx + 1]));
}
