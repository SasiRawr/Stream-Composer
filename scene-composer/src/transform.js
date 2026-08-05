// ============================================================================
// FLIP / ROTATE — simple pixel remapping, no interpolation needed since
// every operation here lands exactly on whole pixels. Same spirit as the
// rest of this folder: plain math, no library, directly unit-testable.
// ============================================================================

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {{horizontal?:boolean, vertical?:boolean}} options
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function applyFlip(imageData, options = {}) {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = options.horizontal ? width - 1 - x : x;
      const srcY = options.vertical ? height - 1 - y : y;
      const srcI = (srcY * width + srcX) * 4;
      const destI = (y * width + x) * 4;
      out[destI] = data[srcI];
      out[destI + 1] = data[srcI + 1];
      out[destI + 2] = data[srcI + 2];
      out[destI + 3] = data[srcI + 3];
    }
  }

  return { width, height, data: out };
}

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData
 * @param {90|180|270} degrees - clockwise rotation. 90/270 swap width and height.
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function applyRotate(imageData, degrees) {
  const { width, height, data } = imageData;

  if (degrees === 180) {
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcI = (y * width + x) * 4;
        const destI = ((height - 1 - y) * width + (width - 1 - x)) * 4;
        out[destI] = data[srcI]; out[destI + 1] = data[srcI + 1];
        out[destI + 2] = data[srcI + 2]; out[destI + 3] = data[srcI + 3];
      }
    }
    return { width, height, data: out };
  }

  if (degrees === 90 || degrees === 270) {
    const outWidth = height;
    const outHeight = width;
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcI = (y * width + x) * 4;
        // 90° clockwise: a pixel at (x,y) in the source lands at
        // (outWidth-1-y, x) in the rotated image. 270° is the inverse
        // mapping (equivalently, 90° counter-clockwise).
        const destX = degrees === 90 ? outWidth - 1 - y : y;
        const destY = degrees === 90 ? x : outHeight - 1 - x;
        const destI = (destY * outWidth + destX) * 4;
        out[destI] = data[srcI]; out[destI + 1] = data[srcI + 1];
        out[destI + 2] = data[srcI + 2]; out[destI + 3] = data[srcI + 3];
      }
    }
    return { width: outWidth, height: outHeight, data: out };
  }

  // Unrecognized angle - return the image unchanged rather than guessing.
  return { width, height, data: new Uint8ClampedArray(data) };
}
