// ============================================================================
// OUTLINE — traces a solid-color border around an image's visible (non-
// transparent) content. The "sticker" look: pairs naturally with an image
// that's already been chroma-keyed or cropped down to a cutout, since it
// needs real transparency to trace an edge against.
//
// Same spirit as the other image-editing modules here: plain per-pixel
// math, no library, no browser/GPU needed, directly unit-testable in Node.
// ============================================================================

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {object} options
 * @param {number} [options.strokeWidth] - outline thickness in pixels. Default 4.
 * @param {{r:number,g:number,b:number}} [options.strokeColor] - default white.
 * @param {number} [options.alphaThreshold] - alpha above this counts as "visible content." Default 10.
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function applyOutline(imageData, options = {}) {
  const { width, height, data } = imageData;
  const strokeWidth = Math.max(1, Math.round(options.strokeWidth ?? 4));
  const color = options.strokeColor || { r: 255, g: 255, b: 255 };
  const alphaThreshold = options.alphaThreshold ?? 10;

  // 1. Which pixels count as "visible content" (not background transparency)?
  const hasContent = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    hasContent[p] = data[p * 4 + 3] > alphaThreshold ? 1 : 0;
  }

  // 2. Original pixels pass through unchanged...
  const out = new Uint8ClampedArray(data.length);
  out.set(data);

  // 3. ...and every currently-transparent pixel within strokeWidth of any
  // content pixel gets painted with the stroke color (a circular
  // neighborhood check, not a square one, so the outline looks like a
  // rounded border rather than a blocky one).
  const radiusSq = strokeWidth * strokeWidth;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (hasContent[idx]) continue; // never overwrite real content

      let withinRange = false;
      for (let dy = -strokeWidth; dy <= strokeWidth && !withinRange; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const dySq = dy * dy;
        for (let dx = -strokeWidth; dx <= strokeWidth; dx++) {
          if (dx * dx + dySq > radiusSq) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (hasContent[ny * width + nx]) { withinRange = true; break; }
        }
      }

      if (withinRange) {
        const o = idx * 4;
        out[o] = color.r;
        out[o + 1] = color.g;
        out[o + 2] = color.b;
        out[o + 3] = 255;
      }
    }
  }

  return { width, height, data: out };
}
