// ============================================================================
// VIGNETTE — darkens (or tints) an image toward its edges, based on distance
// from center. Same spirit as the rest of this folder: plain per-pixel math,
// no library, directly unit-testable in Node.
//
// Only RGB is touched — alpha is left completely untouched, same convention
// as sharpen.js and blur.js, since a vignette is a color effect, not a
// transparency effect.
// ============================================================================

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {object} options
 * @param {number} [options.strength] - 0 = no effect, 1 = corners fully reach `color`. Default 0.5.
 * @param {number} [options.radius] - 0-1, fraction of the center-to-corner distance where the falloff starts. Default 0.75.
 * @param {number} [options.softness] - 0-1, how gradual the falloff band is (as a fraction of center-to-corner distance). Default 0.5.
 * @param {{r:number,g:number,b:number}} [options.color] - the tint color edges fade toward. Default black.
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function applyVignette(imageData, options = {}) {
  const strength = options.strength ?? 0.5;
  const radius = options.radius ?? 0.75;
  const softness = options.softness ?? 0.5;
  const color = options.color ?? { r: 0, g: 0, b: 0 };
  const { width, height, data } = imageData;

  if (strength === 0) {
    return { width, height, data: new Uint8ClampedArray(data) };
  }

  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const innerRadius = radius * maxDist;
  const outerRadius = Math.max(innerRadius + 1e-6, innerRadius + softness * maxDist);

  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let falloff = 0;
      if (dist > innerRadius) {
        falloff = Math.min(1, (dist - innerRadius) / (outerRadius - innerRadius));
      }
      const mix = falloff * strength;

      const i = (y * width + x) * 4;
      out[i] = data[i] * (1 - mix) + color.r * mix;
      out[i + 1] = data[i + 1] * (1 - mix) + color.g * mix;
      out[i + 2] = data[i + 2] * (1 - mix) + color.b * mix;
      out[i + 3] = data[i + 3];
    }
  }

  return { width, height, data: out };
}
