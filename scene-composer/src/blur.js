// ============================================================================
// BLUR — a separable box blur, done correctly against transparency. Same
// spirit as the rest of this folder: plain per-pixel math, no library, no
// browser/GPU needed, directly unit-testable in Node.
//
// Useful for two different things: softening an image stylistically, or
// redacting/obscuring visible detail (an account name, a chat overlay,
// anything a streamer doesn't want readable on screen).
// ============================================================================

// A box blur naively applied to straight (non-premultiplied) RGBA produces
// dark fringing wherever opaque content sits next to transparent pixels —
// the transparent pixels' arbitrary RGB values (often 0,0,0) get averaged
// in as if they were real color. The standard fix: premultiply RGB by
// alpha before blurring, blur every channel (including alpha) the same
// way, then un-premultiply afterward. This is what real image editors do.
function premultiply(data) {
  const out = new Float64Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    out[i] = data[i] * a;
    out[i + 1] = data[i + 1] * a;
    out[i + 2] = data[i + 2] * a;
    out[i + 3] = data[i + 3];
  }
  return out;
}

function unpremultiply(premultData, width, height) {
  const out = new Uint8ClampedArray(premultData.length);
  for (let i = 0; i < premultData.length; i += 4) {
    const a = premultData[i + 3];
    if (a <= 0) {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
    } else {
      const factor = 255 / a;
      out[i] = premultData[i] * factor;
      out[i + 1] = premultData[i + 1] * factor;
      out[i + 2] = premultData[i + 2] * factor;
      out[i + 3] = a;
    }
  }
  return out;
}

// One-dimensional box average along a single axis, done as its own pass so
// a 2D blur becomes two cheap 1D passes (the standard "separable filter"
// trick) instead of one expensive 2D one.
function boxBlurHorizontal(src, width, height, radius) {
  const out = new Float64Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const i = (y * width + nx) * 4;
        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3];
        count++;
      }
      const o = (y * width + x) * 4;
      out[o] = r / count; out[o + 1] = g / count; out[o + 2] = b / count; out[o + 3] = a / count;
    }
  }
  return out;
}

function boxBlurVertical(src, width, height, radius) {
  const out = new Float64Array(src.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const i = (ny * width + x) * 4;
        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3];
        count++;
      }
      const o = (y * width + x) * 4;
      out[o] = r / count; out[o + 1] = g / count; out[o + 2] = b / count; out[o + 3] = a / count;
    }
  }
  return out;
}

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {object} options
 * @param {number} [options.radius] - blur radius in pixels. 0 = no-op. Default 4.
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function applyBlur(imageData, options = {}) {
  const radius = Math.max(0, Math.round(options.radius ?? 4));
  const { width, height, data } = imageData;

  if (radius === 0) {
    return { width, height, data: new Uint8ClampedArray(data) };
  }

  const premult = premultiply(data);
  const passH = boxBlurHorizontal(premult, width, height, radius);
  const passV = boxBlurVertical(passH, width, height, radius);
  const result = unpremultiply(passV, width, height);

  return { width, height, data: result };
}
