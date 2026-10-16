// Sample project used to prove Classic popup-slide output never changes.
export const sampleProject = {
  canvasWidth: 640,
  canvasHeight: 220,
  items: [
    {
      id: 'item-abc123', type: 'popup-slide', x: 0, y: 0, width: 640, height: 220, zIndex: 1,
      rotation: 0, opacity: 1,
      props: {
        contentMode: 'structured',
        slides: [
          { tag: 'WEB', text: 'YourSite.com', iconMode: 'none' },
          { tag: 'TWITCH', text: 'twitch.tv/you', iconMode: 'platform', platformKey: 'twitch' },
          { tag: 'KEEP', text: 'Kept icon', iconMode: 'keep', rawIcon: '<path d="M2 2h20v20H2z"/>' },
          { tag: 'PIC', text: 'Custom image', iconMode: 'custom', customAssetPath: 'C:/x/icon.png' },
        ],
        transitionStyle: 'slide',
        perSlideMs: 2600,
        pauseMs: 500,
        colors: { void: '#0a0a12', violet: '#7c5cff', violetSoft: '#a594ff', ink: '#f2f1f9', mute: '#918eae' },
      },
    },
  ],
};
export const sampleAssets = { 'item-abc123::slide3': 'assets/item-abc123-slide3.png' };
