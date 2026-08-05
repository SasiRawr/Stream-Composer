// ============================================================================
// Stream Composer — popup-slide editor app logic
// ============================================================================
// This is v1-pop-up-slide's editor.html, rebuilt to run as a real desktop
// app instead of a webpage. Almost all of the form/slide-editing logic below
// is carried over from editor.html unchanged (it already worked) — the only
// real difference is HOW settings.js gets read and saved:
//
//   editor.html: loaded settings.js via a <script src="settings.js"> tag
//                (only works for a file sitting right next to the page),
//                and "Save" could only trigger a download or a save-dialog
//                that LOOKS like an overwrite — a webpage can never really
//                overwrite a file on your computer.
//
//   this file:   asks Rust (via `invoke`) to read/write the actual file on
//                disk, at whatever folder the user picked. Real save, no
//                download-and-replace shuffle. See lib.rs for the Rust side.
//
// This only understands the v1 popup-slide project shape for now — the
// general "any overlay type" Module system from V2_ARCHITECTURE.md is the
// next milestone, built on top of this one.
// ============================================================================

const { invoke } = window.__TAURI__.core;

// ---- Element references (grabbed once the page has loaded) ---------------
let subtitleEl, projectPathLabelEl, generalPanelEl, slidesPanelEl, mainActionsEl;
let transitionStyleEl, perSlideSecondsEl, pauseSecondsEl, slideListEl, statusEl;

// ---- Project state ---------------------------------------------------------
// `projectFolder` is the folder the user picked (e.g. campaign-thenerdybox/).
// `settingsPath` / `overlayPath` are that folder plus the two files we care
// about. Both are null until a project with a real settings.js is opened.
let projectFolder = null;
let settingsPath = null;
let overlayPath = null;

// `slides`, `loadedColors` mirror editor.html's in-memory model exactly.
// Each slide: { tag, text, iconMode: 'none'|'platform'|'custom'|'keep', platformKey, customPath, rawIcon }
let slides = [];
let loadedColors = null;
let usedPlaintextMethod = false;

/* ============================================================================
   GENERIC PLACEHOLDER PLATFORM ICONS
   ============================================================================
   Plain colored circles with initials — NOT the real Twitch/YouTube/etc.
   logos. Redrawing trademarked logos isn't something this project does; see
   PROJECT_NOTES.md section 3.6 for the full reasoning. If you want
   a real platform logo, use "Custom image file" instead and point it at an
   official asset you downloaded from that platform's own site.
   ========================================================================= */
const PLATFORM_ICONS = {
  twitch:    { label: 'Twitch (placeholder)',    initials: 'TW', color: '#9146FF' },
  youtube:   { label: 'YouTube (placeholder)',   initials: 'YT', color: '#FF0000' },
  tiktok:    { label: 'TikTok (placeholder)',    initials: 'TT', color: '#111111' },
  kick:      { label: 'Kick (placeholder)',      initials: 'KI', color: '#53FC18' },
  trovo:     { label: 'Trovo (placeholder)',     initials: 'TR', color: '#1FCF6C' },
  x:         { label: 'X / Twitter (placeholder)', initials: 'X', color: '#000000' },
  discord:   { label: 'Discord (placeholder)',   initials: 'DC', color: '#5865F2' },
  steam:     { label: 'Steam (placeholder)',     initials: 'ST', color: '#1B2838' },
  instagram: { label: 'Instagram (placeholder)', initials: 'IG', color: '#C13584' },
  facebook:  { label: 'Facebook (placeholder)',  initials: 'FB', color: '#1877F2' },
};

function platformIconSvg(key) {
  const p = PLATFORM_ICONS[key];
  if (!p) return '';
  return '<circle cx="12" cy="12" r="11" fill="' + p.color + '"/>' +
         '<text x="12" y="15.5" font-size="8" font-weight="700" text-anchor="middle" ' +
         'fill="#ffffff" font-family="Arial, sans-serif">' + p.initials + '</text>';
}

// Reverse-lookup: given an icon svg string already in settings.js, figure
// out which platform (if any) it matches, so re-opening a project shows the
// right dropdown selection instead of losing track of it.
function findPlatformByIcon(iconSvg) {
  for (const key in PLATFORM_ICONS) {
    if (platformIconSvg(key) === iconSvg) return key;
  }
  return null;
}

// ---- Joining a folder path with a filename ---------------------------------
// Works whether the OS gave us backslashes (Windows) or forward slashes.
function joinPath(folder, filename) {
  const sep = folder.includes('\\') ? '\\' : '/';
  return folder.replace(/[\\/]+$/, '') + sep + filename;
}

// ---- Turning settings.js's text into a CONFIG object -----------------------
// settings.js defines `const CONFIG = {...}`. editor.html got this by
// loading the file as a real <script> tag, which only works for files next
// to the page itself. Here we've read the file's text over `invoke`
// instead, so we run it through `new Function` to get the same CONFIG value
// back. This is the user's own project file on their own disk — the same
// trust level editor.html already had when it executed it as a script tag.
function evalConfig(text) {
  const factory = new Function(text + "\n;return (typeof CONFIG !== 'undefined') ? CONFIG : undefined;");
  return factory();
}

function parseSlidesText(text) {
  return text.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.trim().split('\n').map((l) => l.trim());
    return { tag: lines[0] || '', text: lines.slice(1).join(' ') };
  }).filter((m) => m.tag || m.text);
}

function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setStatus(message, kind) {
  statusEl.className = kind || '';
  statusEl.textContent = message;
}

// ---- Loading a project ------------------------------------------------------
async function openProject() {
  const folder = await invoke('pick_project_folder');
  if (!folder) return; // user cancelled the dialog

  const candidateSettingsPath = joinPath(folder, 'settings.js');
  const hasSettings = await invoke('file_exists', { path: candidateSettingsPath });
  if (!hasSettings) {
    setStatus('That folder doesn\'t have a settings.js in it — not a popup-slide project.', 'err');
    return;
  }

  let text;
  try {
    text = await invoke('read_text_file', { path: candidateSettingsPath });
  } catch (err) {
    setStatus(String(err), 'err');
    return;
  }

  const CONFIG = evalConfig(text);
  if (!CONFIG) {
    setStatus('settings.js was read, but no CONFIG object was found inside it.', 'err');
    return;
  }

  projectFolder = folder;
  settingsPath = candidateSettingsPath;
  overlayPath = joinPath(folder, 'stream-popup-overlay.html');

  loadedColors = CONFIG.colors || null;

  let rawMessages;
  if (CONFIG.messagesText && CONFIG.messagesText.trim()) {
    rawMessages = parseSlidesText(CONFIG.messagesText);
    usedPlaintextMethod = true;
  } else {
    rawMessages = CONFIG.messages || [];
    usedPlaintextMethod = false;
  }

  slides = rawMessages.map((m) => {
    if (m.image) {
      return { tag: m.tag, text: m.text, iconMode: 'custom', customPath: m.image };
    }
    if (m.icon) {
      const platformKey = findPlatformByIcon(m.icon);
      if (platformKey) return { tag: m.tag, text: m.text, iconMode: 'platform', platformKey: platformKey };
      return { tag: m.tag, text: m.text, iconMode: 'keep', rawIcon: m.icon };
    }
    return { tag: m.tag, text: m.text, iconMode: 'none' };
  });
  if (slides.length === 0) {
    slides = [{ tag: '', text: '', iconMode: 'none' }];
  }

  transitionStyleEl.value = CONFIG.transitionStyle || 'fade';
  perSlideSecondsEl.value = ((CONFIG.timing && CONFIG.timing.perMessageHold) || 2600) / 1000;
  pauseSecondsEl.value = ((CONFIG.timing && CONFIG.timing.slideOutPause) || 500) / 1000;

  projectPathLabelEl.textContent = projectFolder;
  subtitleEl.textContent = 'Loaded ' + slides.length + ' slide(s) from settings.js' +
    (usedPlaintextMethod ? ' (plaintext method — icons will switch this file to the structured method on save).' : '.');

  generalPanelEl.hidden = false;
  slidesPanelEl.hidden = false;
  mainActionsEl.hidden = false;

  renderSlides();
  setStatus('Project opened.', 'ok');
}

// ---- Rendering the slide list -----------------------------------------------
function iconPreviewHTML(slide) {
  if (slide.iconMode === 'platform' && slide.platformKey) {
    return '<div class="icon-preview"><svg viewBox="0 0 24 24">' + platformIconSvg(slide.platformKey) + '</svg></div>';
  }
  if (slide.iconMode === 'custom' && slide.customPath) {
    return '<div class="icon-preview"><img src="' + escapeHtml(slide.customPath) + '" alt="" onerror="this.style.display=\'none\'"></div>';
  }
  if (slide.iconMode === 'keep') {
    return '<div class="icon-preview"><svg viewBox="0 0 24 24">' + slide.rawIcon + '</svg></div>';
  }
  return '<div class="icon-preview"><div style="width:20px;height:20px;border-radius:4px;background:#7c5cff;"></div></div>';
}

function renderSlides() {
  slideListEl.innerHTML = '';
  slides.forEach((slide, i) => {
    const card = document.createElement('div');
    card.className = 'slide-card';

    const iconOptions = ['<option value="none">No icon (show logo)</option>'];
    for (const key in PLATFORM_ICONS) {
      iconOptions.push('<option value="platform:' + key + '">' + PLATFORM_ICONS[key].label + '</option>');
    }
    iconOptions.push('<option value="custom">Custom image file…</option>');
    if (slide.iconMode === 'keep') {
      iconOptions.push('<option value="keep">Existing custom icon (kept as-is)</option>');
    }

    let selectedValue = 'none';
    if (slide.iconMode === 'platform') selectedValue = 'platform:' + slide.platformKey;
    else if (slide.iconMode === 'custom') selectedValue = 'custom';
    else if (slide.iconMode === 'keep') selectedValue = 'keep';

    card.innerHTML =
      '<div class="slide-card-head"><span>SLIDE ' + (i + 1) + '</span>' +
      '<button class="remove-btn" data-i="' + i + '" data-action="remove">Remove</button></div>' +
      '<div class="field-row">' +
        '<div class="field"><label>Tag (short caps label)</label>' +
        '<input type="text" data-i="' + i + '" data-field="tag" value="' + escapeHtml(slide.tag) + '"></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>Slide text</label>' +
        '<input type="text" data-i="' + i + '" data-field="text" value="' + escapeHtml(slide.text) + '"></div>' +
      '</div>' +
      '<div class="icon-row">' +
        iconPreviewHTML(slide) +
        '<select data-i="' + i + '" data-field="iconSelect">' + iconOptions.join('') + '</select>' +
      '</div>' +
      (slide.iconMode === 'custom'
        ? '<div class="field-row" style="margin-top:8px;"><div class="field">' +
          '<label>Image file name (must sit next to settings.js)</label>' +
          '<input type="text" data-i="' + i + '" data-field="customPath" value="' + escapeHtml(slide.customPath || '') + '"></div></div>'
        : '');

    slideListEl.appendChild(card);
    card.querySelector('[data-field="iconSelect"]').value = selectedValue;
  });
}

function wireSlideListEvents() {
  slideListEl.addEventListener('input', (e) => {
    const i = e.target.getAttribute('data-i');
    const field = e.target.getAttribute('data-field');
    if (i === null) return;
    const idx = parseInt(i, 10);
    if (field === 'tag') slides[idx].tag = e.target.value;
    if (field === 'text') slides[idx].text = e.target.value;
    if (field === 'customPath') slides[idx].customPath = e.target.value;
  });

  slideListEl.addEventListener('change', (e) => {
    const i = e.target.getAttribute('data-i');
    const field = e.target.getAttribute('data-field');
    if (i === null) return;
    const idx = parseInt(i, 10);
    if (field === 'iconSelect') {
      const val = e.target.value;
      if (val === 'none') {
        slides[idx].iconMode = 'none';
      } else if (val === 'custom') {
        slides[idx].iconMode = 'custom';
        slides[idx].customPath = slides[idx].customPath || '';
      } else if (val === 'keep') {
        slides[idx].iconMode = 'keep';
      } else if (val.indexOf('platform:') === 0) {
        slides[idx].iconMode = 'platform';
        slides[idx].platformKey = val.slice('platform:'.length);
      }
      renderSlides();
    }
  });

  slideListEl.addEventListener('click', (e) => {
    if (e.target.getAttribute('data-action') === 'remove') {
      const idx = parseInt(e.target.getAttribute('data-i'), 10);
      slides.splice(idx, 1);
      renderSlides();
    }
  });
}

// ---- Building the new settings.js text --------------------------------------
// Same template editor.html generated — kept identical so a project saved
// from this app still looks/reads the way editor.html's users are used to.
function buildSettingsFileText() {
  const transitionStyle = transitionStyleEl.value;
  const perSlideMs = Math.round(parseFloat(perSlideSecondsEl.value) * 1000);
  const pauseMs = Math.round(parseFloat(pauseSecondsEl.value) * 1000);

  const messagesCode = slides.map((s) => {
    let extra = '';
    if (s.iconMode === 'platform') {
      extra = ', icon: \'' + platformIconSvg(s.platformKey).replace(/'/g, "\\'") + '\'';
    } else if (s.iconMode === 'custom' && s.customPath) {
      extra = ', image: ' + JSON.stringify(s.customPath);
    } else if (s.iconMode === 'keep' && s.rawIcon) {
      extra = ', icon: \'' + s.rawIcon.replace(/'/g, "\\'") + '\'';
    }
    return '    { tag: ' + JSON.stringify(s.tag) + ', text: ' + JSON.stringify(s.text) + extra + ' }';
  }).join(',\n');

  const colors = loadedColors || {
    void: '#0a0a12', violet: '#7c5cff', violetSoft: '#a594ff', ink: '#f2f1f9', mute: '#918eae'
  };

  return (
`/* ============================================================================
   OVERLAY SETTINGS
   ============================================================================
   Generated by the Popup Slide Editor. This file uses the structured
   "messages" array method (rather than plaintext) because at least one
   slide here has its own icon/image — see stream-popup-overlay.html for
   how both methods work.

   Re-open this project in the Popup Slide Editor any time to make
   further changes with the form instead of hand-editing this file.
   ========================================================================= */

const CONFIG = {

  messages: [
${messagesCode}
  ],

  transitionStyle: ${JSON.stringify(transitionStyle)},   // fade / slide / slide-up / slide-down / zoom / none / random

  timing: {
    holdBeforeOpening:  350,
    textOpenDuration:    450,
    perMessageHold:      ${perSlideMs},
    swapFade:            260,
    holdBeforeSlideOut:  400,
    slideOutPause:       ${pauseMs},
  },

  colors: {
    void:        ${JSON.stringify(colors.void)},
    violet:      ${JSON.stringify(colors.violet)},
    violetSoft:  ${JSON.stringify(colors.violetSoft)},
    ink:         ${JSON.stringify(colors.ink)},
    mute:        ${JSON.stringify(colors.mute)},
  }

};
`);
}

// ---- Saving: a real, direct overwrite of settings.js on disk ---------------
// Returns true/false so previewOverlay() below can tell whether it's safe
// to go on and open the preview.
async function saveProject() {
  if (!settingsPath) return false;
  const text = buildSettingsFileText();
  try {
    await invoke('write_text_file', { path: settingsPath, contents: text });
    setStatus('Saved to ' + settingsPath, 'ok');
    return true;
  } catch (err) {
    setStatus(String(err), 'err');
    return false;
  }
}

// Turns a Windows filesystem path into a proper file:// URL (percent-
// encoding spaces and the like) so it can be handed to a browser.
function pathToFileUrl(path) {
  const normalized = path.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : '/' + normalized;
  return 'file://' + encodeURI(withLeadingSlash);
}

// ---- Preview: save first, then open the real overlay engine in the
// default browser ------------------------------------------------------------
// This is the exact same HTML/CSS/JS OBS uses when the folder is added as a
// Browser Source — opening it in a normal browser shows the true animation.
//
// Two things this deliberately does to avoid "I changed a setting and
// nothing looks different":
//   1. It saves the current form state FIRST. Otherwise clicking Preview
//      without clicking Save first would always show whatever was last
//      saved, no matter what's selected in the form right now.
//   2. It adds a `?t=<timestamp>` to the URL so it's a brand new address
//      every time, forcing a real reload instead of a browser just
//      re-focusing an old preview tab that's still running yesterday's
//      settings.js in memory.
async function previewOverlay() {
  if (!settingsPath || !overlayPath) return;
  const saved = await saveProject();
  if (!saved) return;
  const url = pathToFileUrl(overlayPath) + '?t=' + Date.now();
  try {
    await invoke('preview_overlay', { url });
  } catch (err) {
    setStatus(String(err), 'err');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  subtitleEl = document.getElementById('subtitle');
  projectPathLabelEl = document.getElementById('projectPathLabel');
  generalPanelEl = document.getElementById('generalPanel');
  slidesPanelEl = document.getElementById('slidesPanel');
  mainActionsEl = document.getElementById('mainActions');
  transitionStyleEl = document.getElementById('transitionStyle');
  perSlideSecondsEl = document.getElementById('perSlideSeconds');
  pauseSecondsEl = document.getElementById('pauseSeconds');
  slideListEl = document.getElementById('slideList');
  statusEl = document.getElementById('status');

  document.getElementById('openProjectBtn').addEventListener('click', openProject);
  document.getElementById('addSlideBtn').addEventListener('click', () => {
    slides.push({ tag: '', text: '', iconMode: 'none' });
    renderSlides();
  });
  document.getElementById('saveBtn').addEventListener('click', saveProject);
  document.getElementById('previewBtn').addEventListener('click', previewOverlay);

  wireSlideListEvents();
});
