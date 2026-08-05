// ============================================================================
// COLOR ADJUSTMENTS — brightness, contrast, saturation. Same spirit as
// chromakey.js/croppad.js: plain per-pixel math, no library, no browser/GPU
// needed, so it's directly unit-testable in Node.
// ============================================================================

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {object} options
 * @param {number} [options.brightness] - -1..1, additive. 0 = unchanged.
 * @param {number} [options.contrast] - -1..1, multiplicative around the midpoint. 0 = unchanged.
 * @param {number} [options.saturation] - -1..1. -1 = grayscale, 0 = unchanged, 1 = more saturated.
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function applyColorAdjustments(imageData, options) {
  const brightness = options.brightness || 0;
  const contrast = options.contrast || 0;
  const saturation = options.saturation || 0;

  const brightnessOffset = brightness * 255;
  const contrastFactor = 1 + contrast;

  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness: shift every channel by the same amount.
    r += brightnessOffset;
    g += brightnessOffset;
    b += brightnessOffset;

    // Contrast: scale each channel's distance from mid-gray (128).
    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    // Saturation: blend each channel toward (saturation<0) or away from
    // (saturation>0) this pixel's own grayscale luminance.
    if (saturation !== 0) {
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const satFactor = 1 + saturation;
      r = luminance + (r - luminance) * satFactor;
      g = luminance + (g - luminance) * satFactor;
      b = luminance + (b - luminance) * satFactor;
    }

    // Uint8ClampedArray clamps to 0..255 automatically on assignment.
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = data[i + 3]; // alpha untouched — never adjust transparency here
  }

  return { width, height, data: out };
}
