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
    label: 'Gradient Background',
    description: 'A full-canvas decorative frame with a violet-to-void gradient fill — a real usable background, not a placeholder.',
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

// Combines the buildProject() output of one or more picked templates into a
// single project, for the Starter Kit dialog's "pick and choose" mode
// (previously it was one-template-only). Canvas size is the largest of the
// selected templates' own sizes — never a rescale, since item x/y are
// absolute pixel positions and a template's items are already laid out
// correctly for its own canvas. zIndex is renumbered sequentially across the
// merge so combining templates never produces tied stacking order.
export function mergeStarterProjects(projects) {
  if (projects.length === 0) return null;
  const canvasWidth = Math.max(...projects.map((p) => p.canvasWidth));
  const canvasHeight = Math.max(...projects.map((p) => p.canvasHeight));
  const items = [];
  let z = 1;
  for (const p of projects) {
    for (const item of p.items) {
      items.push({ ...item, zIndex: z++ });
    }
  }
  return { canvasWidth, canvasHeight, items };
}

// Lightens a hex color toward white by the given fraction (0-1) - a plain
// linear blend, the same "good enough, no color-space theory needed"
// approach this project's other pure color helpers (e.g. background-
// generator.js's hexToRgba) already use. Used to derive a template's
// "soft" accent tone from whatever single accent color the user picks,
// so personalization only ever needs one color input, not two.
function lightenHex(hex, fraction) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * fraction);
  return '#' + [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

// Re-colors and re-texts an already-built starter project WITHOUT a full
// re-edit - the "template personalization" item from ROADMAP.md's v1.x.0
// series (task #46). Deliberately reuses 100% of the existing rendering
// (frame/popup-slide items, their existing props shape) - this is a pure
// data transform applied once at project-creation time, not new engine
// code. Any option left null/empty/undefined leaves that aspect
// unchanged - callers don't have to fill in every field.
export function personalizeProject(project, { accentColor, siteText, socialText } = {}) {
  const softColor = accentColor ? lightenHex(accentColor, 0.35) : null;
  const items = project.items.map((item) => {
    const props = { ...item.props };
    if (item.type === 'frame' && accentColor) {
      if (props.strokeColor === BRAND_COLORS.violet) props.strokeColor = accentColor;
      if (props.gradientFrom === BRAND_COLORS.violet) props.gradientFrom = accentColor;
    }
    if (item.type === 'popup-slide') {
      if (accentColor && props.colors) {
        props.colors = { ...props.colors, violet: accentColor, violetSoft: softColor };
      }
      if ((siteText || socialText) && Array.isArray(props.slides)) {
        props.slides = props.slides.map((slide) => {
          if (siteText && slide.text === 'YourSite.com') return { ...slide, text: siteText };
          if (socialText && slide.text === 'Follow @yourhandle') return { ...slide, text: socialText };
          return slide;
        });
      }
    }
    return { ...item, props };
  });
  return { ...project, items };
}
