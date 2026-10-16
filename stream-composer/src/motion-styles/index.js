// ============================================================================
// MOTION STYLES — a small registry of interchangeable animation styles per
// item type. A style is a module exposing:
//
//   { id, label, usesTransitionStyle, render(opts) -> { css, markup, script } }
//
// where opts = { instanceId, slides, timing, colors, transitionStyle }.
// bake.js asks this registry for the style an item picked and drops the
// returned css / markup / script into the scene; it never needs to know how
// a given style works. To add a style (or a style for another item type),
// write the module and add it to REGISTRY below.
//
// Unknown or missing style ids resolve to 'classic', which is what every
// project saved before motion styles existed gets.
// ============================================================================

import { popupSlideClassic } from './popup-slide-classic.js';
import { popupSlideDeluxe } from './popup-slide-deluxe.js';

const DEFAULT_STYLE = 'classic';

const REGISTRY = {
  'popup-slide': {
    classic: popupSlideClassic,
    deluxe: popupSlideDeluxe,
  },
};

/** Returns the style id actually used for an item: the requested one if registered, otherwise 'classic'. */
export function resolveMotionStyleId(itemType, styleId) {
  const styles = REGISTRY[itemType];
  if (!styles) return DEFAULT_STYLE;
  return Object.prototype.hasOwnProperty.call(styles, styleId) ? styleId : DEFAULT_STYLE;
}

/** Returns the style module for an item type + requested id (falling back to classic). */
export function getMotionStyle(itemType, styleId) {
  const styles = REGISTRY[itemType];
  if (!styles) return null;
  return styles[resolveMotionStyleId(itemType, styleId)];
}

/** Lists the styles available for an item type, for building a dropdown. */
export function listMotionStyles(itemType) {
  const styles = REGISTRY[itemType] || {};
  return Object.values(styles).map((s) => ({ id: s.id, label: s.label, usesTransitionStyle: s.usesTransitionStyle }));
}
