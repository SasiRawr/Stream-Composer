// ============================================================================
// NOW PLAYING ENGINE — the actual runtime behavior baked into scene.html's
// <script> block for a now-playing item: shows the track currently playing
// on the streamer's own PC (Spotify, a YouTube Music tab, Apple Music's
// Windows app, anything) and hides itself when nothing is playing.
//
// Slipped in as a fast-follow patch (2026-08-12) after Harvey saw a "now
// playing" widget in his own reference video and wanted the equivalent -
// built and shipped same-day, no dedicated scoping pass, per his explicit
// "just get it in there" ask.
//
// One integration covers every player instead of building separate
// Spotify/Apple Music/YouTube OAuth or API-key flows: Windows itself
// already tracks "what's playing" system-wide (System Media Transport
// Controls - the same source that feeds the volume flyout's mini-player),
// and src-tauri/src/lib.rs's now_playing_info command reads it directly.
// The one real architectural wrinkle, same as Kokoro/Chatterbox's local
// TTS: the baked scene.html running in OBS's Browser Source has NO Tauri
// bridge at runtime (a separate CEF context), so this data can't reach it
// as a plain Tauri command - lib.rs runs a tiny local HTTP server on
// 127.0.0.1:5759 instead (started automatically the moment the editor app
// launches, no explicit Start/Stop step needed since there's no model to
// download), and this baked script just polls it with plain fetch().
//
// Genuine limitation, stated plainly rather than glossed over: this only
// works while the Stream Composer Suite app itself is running somewhere
// on this PC (even minimized) - if it's fully closed, the local server
// isn't running and this item just shows nothing, same "needs the sidecar
// alive" tradeoff Kokoro/Chatterbox already have.
// ============================================================================

export function buildNowPlayingScript(instanceId, props) {
  const refreshMs = Math.max(500, props.refreshIntervalMs ?? 2000);
  const showAlbum = props.showAlbum !== false;
  const appFilter = (props.appFilter || '').trim();

  // The filter is resolved into the actual request URL at GENERATION
  // time (a plain query string), not passed as a separate runtime
  // variable the fetch call has to assemble - one less thing that could
  // drift between what's configured and what's actually requested.
  const nowPlayingUrl = appFilter
    ? `http://127.0.0.1:5759/?app=${encodeURIComponent(appFilter)}`
    : 'http://127.0.0.1:5759/';

  return `
(function () {
  const REFRESH_MS = ${JSON.stringify(refreshMs)};
  const SHOW_ALBUM = ${JSON.stringify(showAlbum)};
  const NOW_PLAYING_URL = ${JSON.stringify(nowPlayingUrl)};

  const wrapEl = document.getElementById('${instanceId}-wrap');
  const titleEl = document.getElementById('${instanceId}-title');
  const artistEl = document.getElementById('${instanceId}-artist');
  const albumEl = document.getElementById('${instanceId}-album');
  const statusEl = document.getElementById('${instanceId}-status');

  let lastKey = null;

  // One atomic "apply this now-playing state" entry point, same
  // discipline every other engine module in this app uses - text
  // content and visibility can never desync from each other.
  function applyState(info) {
    if (!info || (!info.title && !info.artist)) {
      wrapEl.classList.remove('is-visible');
      lastKey = null;
      return;
    }
    const key = info.title + '|' + info.artist + '|' + info.album;
    if (key !== lastKey) {
      lastKey = key;
      titleEl.textContent = info.title || '';
      artistEl.textContent = info.artist || '';
      if (albumEl) albumEl.textContent = SHOW_ALBUM ? (info.album || '') : '';
    }
    wrapEl.classList.toggle('is-visible', !!info.playing);
  }

  async function poll() {
    try {
      const res = await fetch(NOW_PLAYING_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad response');
      const info = await res.json();
      applyState(info);
      if (statusEl) statusEl.style.display = 'none';
    } catch (e) {
      // Local server isn't reachable - almost always means Stream
      // Composer Suite itself isn't running on this PC right now.
      wrapEl.classList.remove('is-visible');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = 'Now Playing needs Stream Composer Suite running on this PC.';
      }
    }
  }

  poll();
  setInterval(poll, REFRESH_MS);
})();`;
}
