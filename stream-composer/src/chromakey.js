// ============================================================================
// CHROMA KEY — green-screen removal, no library/model needed
// ============================================================================
// This is a classic color-distance algorithm, not AI: pick a key color
// (usually green or blue), and for every pixel, ask "how close is this to
// the key color?" — close pixels become transparent, far pixels stay
// opaque, and pixels in between fade smoothly (feathering) so the edge
// doesn't look jagged.
//
// Built as plain pixel math (no WebGL) on purpose: this only ever runs on
// a single still image (an `image` item's source file), not live video, so
// a per-pixel loop in JS is plenty fast, and — importantly — it means this
// whole module works in a bare Node environment for testing (no browser,
// no GPU context needed), unlike a WebGL shader would.
//
// Takes/returns a plain { width, height, data } object shaped like the
// browser's ImageData (a Uint8ClampedArray of R,G,B,A,R,G,B,A,...) so the
// same function works whether `data` came from a real ImageData or a
// plain test array.
// ============================================================================

// Converts sRGB (0-255 each) to YCbCr's chroma-only components (Cb, Cr).
// Deliberately ignoring luma (Y/brightness) — a green screen's actual
// brightness varies with lighting across the frame, but its HUE stays
// much more consistent, so comparing on Cb/Cr alone is far more robust
// than comparing raw RGB distance would be.
function rgbToCbCr(r, g, b) {
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
  return [cb, cr];
}

// Max possible distance between two points in Cb-Cr space (each axis
// spans ~255), used to normalize distance into a 0..1 range.
const MAX_CBCR_DISTANCE = Math.sqrt(255 * 255 + 255 * 255);

function cbCrDistance(a, b) {
  const dCb = a[0] - b[0];
  const dCr = a[1] - b[1];
  return Math.sqrt(dCb * dCb + dCr * dCr) / MAX_CBCR_DISTANCE;
}

/**
 * Applies chroma-key removal to an image.
 *
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {object} options
 * @param {{r:number,g:number,b:number}} options.keyColor - the color to key out (e.g. green screen green)
 * @param {number} options.similarity - 0..1, how close a pixel needs to be to the key color to be treated as pure background. Higher = more tolerant (keys out more).
 * @param {number} options.feather - 0..1, width of the soft transition band beyond `similarity`, for a smooth edge instead of a hard cutout.
 * @param {number} [options.spillSuppression] - 0..1, how strongly to desaturate key-color "spill" (a green tint bleeding onto the subject's edge). Defaults to 0.5.
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function applyChromaKey(imageData, options) {
  const { width, height, data } = imageData;
  const { keyColor, similarity, feather } = options;
  const spillSuppression = options.spillSuppression ?? 0.5;

  const keyCbCr = rgbToCbCr(keyColor.r, keyColor.g, keyColor.b);
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    const distance = cbCrDistance(rgbToCbCr(r, g, b), keyCbCr);

    // Below `similarity` => fully keyed out (transparent background).
    // Above `similarity + feather` => fully kept (opaque subject).
    // In between => linear fade, so edges don't look cut out with scissors.
    let alphaMultiplier;
    if (distance <= similarity) {
      alphaMultiplier = 0;
    } else if (distance >= similarity + feather) {
      alphaMultiplier = 1;
    } else {
      alphaMultiplier = (distance - similarity) / Math.max(feather, 1e-6);
    }

    // Spill suppression: pixels near the key color (but not keyed out
    // entirely — i.e. right at the edge of the subject) tend to have the
    // key color's hue bleeding into them (a green fringe around hair,
    // for example). Pull the dominant "key-ish" channel toward the
    // average of the other two, proportional to how close to the key
    // color this pixel still is and how visible it still is (alpha).
    let outR = r, outG = g, outB = b;
    if (alphaMultiplier > 0 && spillSuppression > 0) {
      // How much "spill influence" this pixel still carries — strongest
      // right at the edge (distance just past the keyed-out threshold),
      // fading to none well past the feather band.
      const spillInfluence = Math.max(0, 1 - (distance - similarity) / Math.max(feather * 3, 1e-6));
      if (spillInfluence > 0) {
        const avgOther = keyColor.g >= keyColor.r && keyColor.g >= keyColor.b
          ? (r + b) / 2   // key is green-ish: suppress the green channel
          : keyColor.b >= keyColor.r
            ? (r + g) / 2 // key is blue-ish: suppress the blue channel
            : (g + b) / 2; // key is red-ish (unusual, but handle it): suppress red
        const amount = spillInfluence * spillSuppression;
        if (keyColor.g >= keyColor.r && keyColor.g >= keyColor.b) {
          outG = g + (avgOther - g) * amount;
        } else if (keyColor.b >= keyColor.r) {
          outB = b + (avgOther - b) * amount;
        } else {
          outR = r + (avgOther - r) * amount;
        }
      }
    }

    out[i] = outR;
    out[i + 1] = outG;
    out[i + 2] = outB;
    out[i + 3] = Math.round(a * alphaMultiplier);
  }

  return { width, height, data: out };
}
