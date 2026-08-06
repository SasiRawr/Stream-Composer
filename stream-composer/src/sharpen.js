// ============================================================================
// SHARPEN — classic unsharp masking: blur a copy, then push each pixel
// further AWAY from its blurred neighbor, which reads as "more local
// contrast" / crisper edges. Same spirit as the rest of this folder: plain
// per-pixel math, no library, directly unit-testable in Node.
//
// Deliberately does NOT reuse blur.js's premultiplied-alpha blur pipeline:
// un-premultiplying near very-low-but-nonzero alpha can amplify small
// values into large swings (dividing by a small number), which would then
// get amplified further by the unsharp math itself. Sharpening only needs
// to affect visible color detail, not transparency, so this uses a plain
// RGB-only box blur internally and leaves alpha completely untouched.
// ============================================================================

function boxBlurRGBHorizontal(data, width, height, radius) {
  const out = new Float64Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const i = (y * width + nx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        count++;
      }
      const o = (y * width + x) * 4;
      out[o] = r / count; out[o + 1] = g / count; out[o + 2] = b / count;
    }
  }
  return out;
}

function boxBlurRGBVertical(data, width, height, radius) {
  const out = new Float64Array(data.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const i = (ny * width + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        count++;
      }
      const o = (y * width + x) * 4;
      out[o] = r / count; out[o + 1] = g / count; out[o + 2] = b / count;
    }
  }
  return out;
}

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {object} options
 * @param {number} [options.amount] - sharpening strength. 0 = no-op, 1 = standard. Default 1.
 * @param {number} [options.radius] - how large a neighborhood defines "local" for the contrast boost. Default 2.
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function applySharpen(imageData, options = {}) {
  const amount = options.amount ?? 1;
  const radius = Math.max(1, Math.round(options.radius ?? 2));
  const { width, height, data } = imageData;

  if (amount === 0) {
    return { width, height, data: new Uint8ClampedArray(data) };
  }

  const blurredH = boxBlurRGBHorizontal(data, width, height, radius);
  const blurred = boxBlurRGBVertical(blurredH, width, height, radius);

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i] + amount * (data[i] - blurred[i]);
    out[i + 1] = data[i + 1] + amount * (data[i + 1] - blurred[i + 1]);
    out[i + 2] = data[i + 2] + amount * (data[i + 2] - blurred[i + 2]);
    out[i + 3] = data[i + 3]; // alpha is never touched by sharpening
  }

  return { width, height, data: out };
}
