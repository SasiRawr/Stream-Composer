// ============================================================================
// STINGER EXPORT — turns a template + props into a real .webm file, in one
// of two modes. Not unit-testable in plain Node (needs a real browser
// canvas + video-encoding runtime) — this is exactly the kind of thing this
// project always flags as needing real human verification, not something
// to fake-test.
//
// Uses Mediabunny (github.com/Vanilagy/mediabunny, MPL-2.0 license — this
// project's source is already public on GitHub, so MPL's file-level
// copyleft creates no tension; MPL is NOT the "whole app must be
// open-sourced" style copyleft that got potrace (GPL-2.0) rejected for
// vectorization). It supersedes the older webm-muxer package (same author,
// now deprecated) and wraps WebCodecs' VideoEncoder directly — CanvasSource
// captures+encodes a canvas frame in one call, no manual VideoFrame
// plumbing needed.
//
//   'chromakey' (default, always available): stinger-render.js paints the
//   canvas's "transparent" areas with a solid key color before each frame
//   is captured, so this exports as a completely ordinary opaque WebM (no
//   alpha requested from the encoder at all) — the well-trodden, zero-risk
//   path. The user adds OBS's own built-in Chroma Key filter afterward.
//
//   'alpha' (experimental): requests real alpha-channel encoding from the
//   codec (VP9-with-alpha, in a WebM container, the one container format
//   that supports it). Whether this actually renders transparently in a
//   real OBS install is NOT guaranteed by spec support alone — checkAlphaSupport()
//   below is a capability probe, not a correctness guarantee; the dialog
//   only offers this mode if the probe passes, and it should still be
//   labeled experimental in the UI.
// ============================================================================

import { Output, WebMOutputFormat, BufferTarget, CanvasSource, canEncodeVideo } from 'mediabunny';
import { renderStingerFrame } from './stinger-render.js';

// Quick one-time capability check — decides whether the dialog even offers
// the "Transparent (experimental)" export mode. Never throws; unsupported
// reads as "no", not an error.
export async function checkAlphaSupport(width, height) {
  try {
    return await canEncodeVideo('vp9', { width, height, alpha: 'keep' });
  } catch {
    return false;
  }
}

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas - an off-screen canvas sized to props.canvasWidth/canvasHeight.
 * @param {{renderFrame: Function}} options.template
 * @param {object} options.props - see stinger-templates.js's defaultStingerProps().
 * @param {{logo: HTMLImageElement|null}} options.assets
 * @param {number} [options.fps]
 * @returns {Promise<ArrayBuffer>} the finished .webm file's bytes.
 */
export async function exportStinger({ canvas, template, props, assets, fps = 30 }) {
  const isAlpha = props.exportMode === 'alpha';
  const background = isAlpha ? null : props.keyColor;

  const target = new BufferTarget();
  const output = new Output({
    format: new WebMOutputFormat(),
    target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: 'vp9',
    alpha: isAlpha ? 'keep' : 'discard',
  });
  output.addVideoTrack(videoSource);

  await output.start();

  const ctx = canvas.getContext('2d');
  const frameDuration = 1 / fps; // seconds
  const totalFrames = Math.max(1, Math.ceil((props.durationMs / 1000) * fps));

  for (let i = 0; i < totalFrames; i++) {
    const tMs = (i / fps) * 1000;
    const frameData = template.renderFrame(tMs, props.durationMs, props);
    renderStingerFrame(ctx, frameData, assets, background);
    await videoSource.add(i * frameDuration, frameDuration);
  }

  await output.finalize();

  if (!target.buffer) {
    throw new Error('Export finished but produced no output data.');
  }
  return target.buffer;
}
