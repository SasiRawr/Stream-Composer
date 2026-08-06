// ============================================================================
// STARTER KIT TEMPLATES
// ============================================================================
// Each template is a real, usable starting project — not lorem-ipsum
// placeholders. Colors are the app's own TheNerdyBox brand tokens (the same
// defaults every new frame/popup-slide item already uses); slide TEXT is
// generic ("YourSite.com" etc.) since these ship to any streamer, not just
// TheNerdyBox — only the visual theme is branded, not the copy.
//
// Deliberate scope note: every template uses only `frame` and `popup-slide`
// items (pure data, no external file dependency) — no raster logo/image is
// bundled with the app. Doing that properly needs real Tauri resource-
// bundling (a new tauri.conf.json `resources` config, resolved relative to
// the *installed* app, not this dev repo) — a bigger, separately-testable
// addition than the rest of this wizard, deferred rather than half-done.
//
// Each `buildProject()` is a factory, not a shared object — every pick of a
// template must return a fresh, independent object graph, so editing one
// project after creation can never mutate what the NEXT pick of the same
// template produces.
// ============================================================================

const BRAND_COLORS = { void: '#0a0a12', violet: '#7c5cff', violetSoft: '#a594ff', ink: '#f2f1f9', mute: '#918eae' };

export const STARTER_TEMPLATES = [
  {
    key: 'popup-badge',
    label: 'Popup Badge',
    description: 'A single animated popup-slide badge — the classic cycling-message overlay.',
    buildProject: () => ({
      canvasWidth: 640,
      canvasHeight: 220,
      items: [{
        id: 'starter-badge',
        type: 'popup-slide',
        x: 0, y: 0, width: 640, height: 220, rotation: 0, zIndex: 1,
        props: {
          contentMode: 'structured',
          slides: [
            { tag: 'WEB', text: 'YourSite.com', iconMode: 'none' },
            { tag: 'SOCIAL', text: 'Follow @yourhandle', iconMode: 'none' },
            { tag: 'LIVE NOW', text: 'Streaming today', iconMode: 'none' },
          ],
          transitionStyle: 'fade',
          perSlideMs: 2600,
          pauseMs: 500,
          colors: { ...BRAND_COLORS },
        },
      }],
    }),
  },
  {
    key: 'frame-border',
    label: 'Gradient Border',
    description: 'A full-canvas decorative border with a violet-to-void gradient fill — a real usable background frame, not a placeholder.',
    buildProject: () => ({
      canvasWidth: 1920,
      canvasHeight: 1080,
      items: [{
        id: 'starter-border',
        type: 'frame',
        x: 0, y: 0, width: 1920, height: 1080, rotation: 0, zIndex: 1,
        props: {
          strokeColor: BRAND_COLORS.violet, strokeWidth: 6, cornerRadius: 0,
          fillEnabled: true, fillType: 'gradient',
          gradientFrom: BRAND_COLORS.violet, gradientTo: BRAND_COLORS.void, gradientAngle: 135,
          fillColor: BRAND_COLORS.void,
        },
      }],
    }),
  },
  {
    key: 'webcam-scene',
    label: 'Webcam Frame + Badge',
    description: 'A webcam positioning frame (bottom-right) paired with a popup-slide badge — a combined starter scene, not just one item.',
    buildProject: () => ({
      canvasWidth: 1920,
      canvasHeight: 1080,
      items: [
        {
          id: 'starter-webcam-frame',
          type: 'frame',
          x: 1380, y: 750, width: 480, height: 270, rotation: 0, zIndex: 1,
          props: {
            strokeColor: BRAND_COLORS.violet, strokeWidth: 4, cornerRadius: 16,
            fillEnabled: false, fillType: 'solid', fillColor: BRAND_COLORS.void,
            gradientFrom: BRAND_COLORS.violet, gradientTo: BRAND_COLORS.void, gradientAngle: 135,
          },
        },
        {
          id: 'starter-webcam-badge',
          type: 'popup-slide',
          x: 40, y: 810, width: 640, height: 220, rotation: 0, zIndex: 2,
          props: {
            contentMode: 'structured',
            slides: [
              { tag: 'WEB', text: 'YourSite.com', iconMode: 'none' },
              { tag: 'SOCIAL', text: 'Follow @yourhandle', iconMode: 'none' },
            ],
            transitionStyle: 'fade',
            perSlideMs: 2600,
            pauseMs: 500,
            colors: { ...BRAND_COLORS },
          },
        },
      ],
    }),
  },
];
