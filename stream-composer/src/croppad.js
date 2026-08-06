// ============================================================================
// CROP / PAD — the other two image-editing basics from the original v1
// scope ("cropping, padding, adding transparency"). Same spirit as
// chromakey.js: plain pixel/array math, no library, no browser/GPU needed,
// so both are directly unit-testable in Node.
// ============================================================================

/**
 * Extracts a rectangular sub-region of an image. Coordinates/size are
 * clamped to the image bounds, so an out-of-range crop box never throws —
 * it just gets clipped to whatever actually exists.
 *
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {{x:number, y:number, width:number, height:number}} rect - crop box, in image pixels
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function cropImageData(imageData, rect) {
  const srcW = imageData.width;
  const srcH = imageData.height;

  const x0 = Math.max(0, Math.min(Math.round(rect.x), srcW));
  const y0 = Math.max(0, Math.min(Math.round(rect.y), srcH));
  const x1 = Math.max(x0, Math.min(Math.round(rect.x + rect.width), srcW));
  const y1 = Math.max(y0, Math.min(Math.round(rect.y + rect.height), srcH));

  const outW = x1 - x0;
  const outH = y1 - y0;
  const out = new Uint8ClampedArray(Math.max(0, outW * outH * 4));

  for (let row = 0; row < outH; row++) {
    const srcRowStart = ((y0 + row) * srcW + x0) * 4;
    const destRowStart = row * outW * 4;
    for (let i = 0; i < outW * 4; i++) {
      out[destRowStart + i] = imageData.data[srcRowStart + i];
    }
  }

  return { width: outW, height: outH, data: out };
}

/**
 * Grows the canvas around an image, filling the new border area with a
 * solid color (or leaving it transparent — the default, and the common
 * case: giving an image breathing room without a hard-edged box behind it).
 *
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {{top:number, right:number, bottom:number, left:number, fillColor?:{r:number,g:number,b:number,a:number}}} options
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function padImageData(imageData, options) {
  const top = Math.max(0, Math.round(options.top || 0));
  const right = Math.max(0, Math.round(options.right || 0));
  const bottom = Math.max(0, Math.round(options.bottom || 0));
  const left = Math.max(0, Math.round(options.left || 0));
  const fill = options.fillColor || { r: 0, g: 0, b: 0, a: 0 }; // transparent by default

  const srcW = imageData.width;
  const srcH = imageData.height;
  const outW = srcW + left + right;
  const outH = srcH + top + bottom;
  const out = new Uint8ClampedArray(outW * outH * 4);

  // Fill the whole canvas with the pad color first...
  for (let i = 0; i < outW * outH; i++) {
    out[i * 4] = fill.r;
    out[i * 4 + 1] = fill.g;
    out[i * 4 + 2] = fill.b;
    out[i * 4 + 3] = fill.a;
  }

  // ...then copy the original image into place, offset by the new margins.
  for (let row = 0; row < srcH; row++) {
    const srcRowStart = row * srcW * 4;
    const destRowStart = ((row + top) * outW + left) * 4;
    for (let i = 0; i < srcW * 4; i++) {
      out[destRowStart + i] = imageData.data[srcRowStart + i];
    }
  }

  return { width: outW, height: outH, data: out };
}
