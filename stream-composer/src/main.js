// ============================================================================
// Stream Composer Suite — app logic
// ============================================================================
// A Project is { canvasWidth, canvasHeight, items: [...] }, saved as a real
// file (project.json) via Tauri's fs commands (see src-tauri/src/lib.rs) —
// real save, not browser storage.
//
// Each item: { id, type, x, y, width, height, rotation, zIndex, props }.
// x/y/width/height/rotation are always stored in REAL stream-resolution
// pixels (e.g. against a 1920x1080 canvas), never in on-screen display
// pixels — see DISPLAY SCALING below for why that distinction matters.
// ============================================================================

import { Canvas, Rect, FabricImage, Gradient } from 'fabric';
import { buildSceneHtml, collectAssetCopies } from './bake.js';
import { applyChromaKey } from './chromakey.js';
import { cropImageData, padImageData } from './croppad.js';
import { applyColorAdjustments } from './coloradjust.js';
import { applyOutline } from './outline.js';
import { applyBlur } from './blur.js';
import { applyFlip, applyRotate } from './transform.js';
import { applySharpen } from './sharpen.js';
import { applyVignette } from './vignette.js';
import { PLATFORM_ICONS, platformIconSvg } from './popup-slide-icons.js';
import { parseSlidesText, slidesToPlaintext, evalConfig, legacyConfigToPopupSlideProps } from './popup-slide-import.js';
import { gradientCoordsForAngle } from './gradient.js';
import { STARTER_TEMPLATES, mergeStarterProjects, personalizeProject } from './starter-kit/manifest.js';
import { STINGER_TEMPLATES, defaultStingerProps } from './stinger-templates.js';
import { renderStingerFrame } from './stinger-render.js';
import { checkAlphaSupport, exportStinger } from './stinger-export.js';
import {
  CHAT_PLATFORMS, visibleChatPlatforms,
  activePlatformKeys, ensurePrimarySelected, selectPrimaryPlatform, selectSecondaryPlatform, setMultiChatEnabled,
} from './chat-platforms.js';
import { defaultBackgroundProps, drawBackground } from './background-generator.js';
import { defaultPollyProps, POLLY_VOICE_SUGGESTIONS } from './polly-tts.js';

const { invoke } = window.__TAURI__.core;

// English-only voice list for the Kokoro local TTS provider - must match
// KOKORO_VOICES in src-tauri/src/lib.rs exactly (same 29 values), since
// that's what actually gets downloaded to disk. Human-readable labels
// here are just for this picker; the baked script only ever stores/uses
// the plain voice key (e.g. "af_heart").
const KOKORO_VOICE_OPTIONS = [
  { value: 'af_heart', label: 'Heart (American Female)' },
  { value: 'af_alloy', label: 'Alloy (American Female)' },
  { value: 'af_aoede', label: 'Aoede (American Female)' },
  { value: 'af_bella', label: 'Bella (American Female)' },
  { value: 'af_jessica', label: 'Jessica (American Female)' },
  { value: 'af_kore', label: 'Kore (American Female)' },
  { value: 'af_nicole', label: 'Nicole (American Female)' },
  { value: 'af_nova', label: 'Nova (American Female)' },
  { value: 'af_river', label: 'River (American Female)' },
  { value: 'af_sarah', label: 'Sarah (American Female)' },
  { value: 'af_sky', label: 'Sky (American Female)' },
  { value: 'af', label: 'Default (American Female)' },
  { value: 'am_adam', label: 'Adam (American Male)' },
  { value: 'am_echo', label: 'Echo (American Male)' },
  { value: 'am_eric', label: 'Eric (American Male)' },
  { value: 'am_fenrir', label: 'Fenrir (American Male)' },
  { value: 'am_liam', label: 'Liam (American Male)' },
  { value: 'am_michael', label: 'Michael (American Male)' },
  { value: 'am_onyx', label: 'Onyx (American Male)' },
  { value: 'am_puck', label: 'Puck (American Male)' },
  { value: 'am_santa', label: 'Santa (American Male)' },
  { value: 'bf_alice', label: 'Alice (British Female)' },
  { value: 'bf_emma', label: 'Emma (British Female)' },
  { value: 'bf_isabella', label: 'Isabella (British Female)' },
  { value: 'bf_lily', label: 'Lily (British Female)' },
  { value: 'bm_daniel', label: 'Daniel (British Male)' },
  { value: 'bm_fable', label: 'Fable (British Male)' },
  { value: 'bm_george', label: 'George (British Male)' },
  { value: 'bm_lewis', label: 'Lewis (British Male)' },
];

// ---- DISPLAY SCALING --------------------------------------------------------
// A real stream canvas (1920x1080) is bigger than a reasonable editor
// window, so the on-screen Fabric canvas is shown SMALLER than the real
// resolution — but every item's x/y/width/height is always stored in real
// pixels. `displayScale` is the one conversion factor between the two:
//   displayPixels = realPixels * displayScale
//   realPixels = displayPixels / displayScale
// This keeps the saved project.json resolution-independent of whatever
// window size the app happened to be at when it was edited.
const MAX_DISPLAY_WIDTH = 980;
const MAX_DISPLAY_HEIGHT = 560;

function computeDisplayScale(canvasWidth, canvasHeight) {
  const scale = Math.min(MAX_DISPLAY_WIDTH / canvasWidth, MAX_DISPLAY_HEIGHT / canvasHeight, 1);
  return scale;
}

// ---- STATE ------------------------------------------------------------------
let project = null;          // { canvasWidth, canvasHeight, items: [] }
let projectFolder = null;    // folder the project was opened/created in
let displayScale = 1;
let fabricCanvas = null;
const fabricObjectsById = new Map(); // item.id -> Fabric object
let selectedItemId = null;

// ---- ELEMENT REFS (filled in on DOMContentLoaded) ---------------------------
let els = {};

function setStatus(message, kind) {
  els.status.className = kind || '';
  els.status.textContent = message;
}

function uid() {
  // Not cryptographic — just needs to be unique within one project.
  return 'item-' + Math.random().toString(36).slice(2, 10);
}

// ---- ITEM DEFAULTS ------------------------------------------------------------
function defaultPropsFor(type) {
  if (type === 'frame') {
    return {
      strokeColor: '#7c5cff', strokeWidth: 3, cornerRadius: 12,
      fillEnabled: false, fillColor: '#0a0a12',
      fillType: 'solid', // 'solid' | 'gradient'
      gradientFrom: '#7c5cff', gradientTo: '#0a0a12', gradientAngle: 135,
    };
  }
  if (type === 'image') {
    return { sourcePath: '' };
  }
  if (type === 'popup-slide') {
    return {
      contentMode: 'structured', // 'structured' | 'plaintext'
      slides: [{ tag: 'WEB', text: 'YourSite.com', iconMode: 'none' }],
      transitionStyle: 'fade',
      perSlideMs: 2600,
      pauseMs: 500,
      colors: { void: '#0a0a12', violet: '#7c5cff', violetSoft: '#a594ff', ink: '#f2f1f9', mute: '#918eae' },
    };
  }
  if (type === 'chat-overlay') {
    return {
      platforms: CHAT_PLATFORMS.map((p) => ({ key: p.key, enabled: false, channelName: '', apiKey: '' })),
      ttsEnabled: true,
      ttsRate: 1,
      ttsVolume: 1,
      ttsVoiceName: '', // '' = browser/OS default voice
      ...defaultPollyProps(), // ttsProvider ('browser'|'polly'|'kokoro') + Polly credentials/voice/region/engine
      kokoroVoice: 'af_heart',
      filterCommands: true,
      filterEmoteOnly: true, // Twitch only for now — Kick's chat feed doesn't expose emote-position metadata
      maxVisibleMessages: 3,
      messageDisplayMs: 6000,
      showAdultPlatforms: false,
      multiChatEnabled: false, // dropdown-based platform picker — see renderChatOverlayProperties
    };
  }
  if (type === 'countdown-timer') {
    return {
      targetDateTime: '', // '' = not set yet; a datetime-local string (e.g. "2026-12-31T18:00") once picked
      label: 'Starting in',
      completedText: "We're live!",
      showDays: true,
      fontColor: '#f2f1f9',
      accentColor: '#7c5cff',
      backgroundColor: '#0a0a12',
      backgroundOpacity: 0.75,
    };
  }
  if (type === 'pngtuber') {
    return {
      style: 'swap', // 'swap' | 'bounce' | 'brightness' | 'mouthFlap' — see pngtuber-engine.js's header for what each does
      idleImagePath: '',
      talkingImagePath: '',
      bodyImagePath: '',        // mouthFlap only — the always-visible base image
      mouthOpenImagePath: '',   // mouthFlap only
      mouthClosedImagePath: '', // mouthFlap only
      mouthWidthPercent: 30,    // mouthFlap only — mouth layer width, as a % of the stage
      mouthTopPercent: 55,      // mouthFlap only — mouth layer vertical position, as a % from the top
      mouthLeftPercent: 50,     // mouthFlap only — mouth layer horizontal center, as a % from the left
      flapIntervalMs: 120,      // mouthFlap only — how fast the mouth alternates open/closed while talking
      micThreshold: 15, // percent sensitivity, 0-100 — see pngtuber-engine.js for how this maps to a 0-1 RMS threshold
      holdMs: 200,       // how long the talking state stays up through brief pauses before falling back to idle
    };
  }
  if (type === 'viewer-pet') {
    return {
      petImagePath: '',
      platformKey: 'twitch', // 'twitch' | 'kick' — TikTok not yet supported, see viewer-pet-engine.js header
      channelName: '',
    };
  }
  if (type === 'pet-roster') {
    return {
      petImagePath: '',        // one shared image for every chatter's pet in v1 — see pet-roster-engine.js header
      platformKey: 'twitch',   // 'twitch' | 'kick' — same platform set as Viewer Pet
      channelName: '',
      maxPets: 6,              // roster cap — the N most-recently-active chatters, oldest evicted when full
    };
  }
  if (type === 'now-playing') {
    return {
      refreshIntervalMs: 2000, // how often to re-poll the local now-playing server
      showAlbum: true,
    };
  }
  return {};
}

function defaultSizeFor(type) {
  if (type === 'popup-slide') return { width: 640, height: 220 }; // matches v1's established canvas convention
  if (type === 'frame') return { width: 480, height: 270 };       // a reasonable webcam-frame-ish starting box
  if (type === 'chat-overlay') return { width: 420, height: 600 }; // a tall message-feed shape
  if (type === 'countdown-timer') return { width: 420, height: 160 }; // a flat label+numbers bar
  if (type === 'pngtuber') return { width: 320, height: 320 };    // roughly square, typical character-art proportions
  if (type === 'viewer-pet') return { width: 180, height: 180 };  // smaller than pngtuber — a corner critter, not a main character
  if (type === 'pet-roster') return { width: 500, height: 220 };  // wide, flat strip — room for several pets to wander side to side
  if (type === 'now-playing') return { width: 340, height: 100 }; // a flat "now playing" card
  return { width: 300, height: 300 };
}

function nextZIndex() {
  return project.items.length === 0 ? 1 : Math.max(...project.items.map((i) => i.zIndex)) + 1;
}

// ---- PROJECT LIFECYCLE --------------------------------------------------------
function newProjectData(canvasWidth, canvasHeight) {
  return { canvasWidth, canvasHeight, items: [] };
}

async function createProject(canvasWidth, canvasHeight) {
  const folder = await invoke('pick_project_folder');
  if (!folder) return;
  project = newProjectData(canvasWidth, canvasHeight);
  projectFolder = folder;
  await openWorkspace();
  await saveProject();
  setStatus('New project created in ' + folder, 'ok');
}

// ---- STARTER KIT --------------------------------------------------------
// Always creates a brand-new project (never overwrites an already-open
// one) in a folder the user picks. Picking more than one template merges
// them via mergeStarterProjects() — see starter-kit/manifest.js for what
// each template contains and how the merge picks a canvas size.
async function createProjectFromTemplates(templates, personalization) {
  if (templates.length === 0) return;
  const folder = await invoke('pick_project_folder');
  if (!folder) return;
  project = mergeStarterProjects(templates.map((t) => t.buildProject()));
  if (personalization) project = personalizeProject(project, personalization);
  projectFolder = folder;
  await openWorkspace();
  await saveProject();
  const names = templates.map((t) => t.label).join(' + ');
  setStatus(`Starter project "${names}" created in ${folder}. Try it out, then click "Bake Browser Source…" above when you're ready to export and use it!`, 'ok');
}

async function openProject() {
  const folder = await invoke('pick_project_folder');
  if (!folder) return;
  const projectPath = joinPath(folder, 'project.json');
  const exists = await invoke('file_exists', { path: projectPath });
  if (!exists) {
    const legacySettingsPath = joinPath(folder, 'settings.js');
    const hasLegacySettings = await invoke('file_exists', { path: legacySettingsPath });
    if (hasLegacySettings) {
      setStatus('That folder doesn\'t have a project.json, but it looks like an old popup-slide project (it has a settings.js) — importing it now.', 'ok');
      await startLegacyImportFromFolder(folder);
    } else {
      setStatus('That folder doesn\'t have a project.json — not a Stream Composer Suite project.', 'err');
    }
    return;
  }
  const text = await invoke('read_text_file', { path: projectPath });
  project = JSON.parse(text);
  projectFolder = folder;
  await openWorkspace();
  setStatus('Opened project from ' + folder, 'ok');
}

async function saveProject() {
  if (!project || !projectFolder) return;
  const projectPath = joinPath(projectFolder, 'project.json');
  await invoke('write_text_file', { path: projectPath, contents: JSON.stringify(project, null, 2) });
  setStatus('Saved to ' + projectPath, 'ok');
}

// ---- LEGACY PROJECT IMPORT --------------------------------------------------
// Brings an old v1/app-style settings.js-based popup-slide campaign into
// this app's project.json model, as a new project with one popup-slide
// item pre-filled from the legacy content. The legacy folder is NEVER
// written to — this always saves into a separate, freshly-picked
// destination folder. See popup-slide-import.js for the pure mapping logic.
//
// Reuses the New Project dialog for picking the new project's canvas size
// (defaulting to 640x220, the v1 convention) rather than a separate dialog —
// `pendingLegacyImport` is how wireNewProjectDialog's Create handler knows
// to seed the new project from imported content instead of starting blank.
let pendingLegacyImport = null;

async function startLegacyImportFromFolder(legacyFolder) {
  const settingsPath = joinPath(legacyFolder, 'settings.js');
  let text;
  try {
    text = await invoke('read_text_file', { path: settingsPath });
  } catch (err) {
    setStatus('Couldn\'t read settings.js: ' + err, 'err');
    return;
  }

  const CONFIG = evalConfig(text);
  if (!CONFIG) {
    setStatus('settings.js was read, but no CONFIG object was found inside it.', 'err');
    return;
  }

  const popupSlideProps = legacyConfigToPopupSlideProps(CONFIG);

  // Bare custom-icon filenames are relative to the LEGACY folder (that's
  // where the old standalone editor expected them to sit) — resolve each
  // to a real absolute path now. A missing file doesn't block the whole
  // import; that one slide just falls back to no icon, with a warning.
  for (const slide of popupSlideProps.slides) {
    if (slide.iconMode === 'custom' && slide.customAssetPath) {
      const candidate = joinPath(legacyFolder, slide.customAssetPath);
      const found = await invoke('file_exists', { path: candidate });
      if (found) {
        slide.customAssetPath = candidate;
      } else {
        setStatus(`Warning: couldn't find "${slide.customAssetPath}" next to settings.js — that slide's icon was reset to none.`, 'err');
        slide.iconMode = 'none';
        delete slide.customAssetPath;
      }
    }
  }

  pendingLegacyImport = popupSlideProps;
  document.getElementById('resolutionPreset').value = '640x220';
  document.getElementById('customResolutionRow').hidden = true;
  document.getElementById('newProjectDialog').showModal();
  setStatus(`Read ${popupSlideProps.slides.length} slide(s) from ${settingsPath} — pick a canvas size and a NEW destination folder to finish importing (the original files are never touched).`, 'ok');
}

async function importLegacyProject() {
  const legacyFolder = await invoke('pick_project_folder');
  if (!legacyFolder) return;
  const settingsPath = joinPath(legacyFolder, 'settings.js');
  const hasSettings = await invoke('file_exists', { path: settingsPath });
  if (!hasSettings) {
    setStatus('That folder doesn\'t have a settings.js in it — not a legacy popup-slide project.', 'err');
    return;
  }
  await startLegacyImportFromFolder(legacyFolder);
}

async function createProjectFromImport(canvasWidth, canvasHeight, popupSlideProps) {
  const folder = await invoke('pick_project_folder');
  if (!folder) return;
  project = newProjectData(canvasWidth, canvasHeight);
  projectFolder = folder;
  await openWorkspace();
  await addItem('popup-slide', popupSlideProps);
  await saveProject();
  setStatus('Imported legacy project into ' + folder, 'ok');
}

function joinPath(folder, filename) {
  const sep = folder.includes('\\') ? '\\' : '/';
  return folder.replace(/[\\/]+$/, '') + sep + filename;
}

// ---- CANVAS SETUP ---------------------------------------------------------
async function openWorkspace() {
  els.workspace.hidden = false;
  els.saveProjectBtn.disabled = false;
  els.bakeBtn.disabled = false;
  els.subtitle.textContent = projectFolder;
  els.canvasSizeLabel.textContent = project.canvasWidth + ' x ' + project.canvasHeight + ' (real stream resolution)';
  updateBakeButtonLabels();
  els.bakeResultActions.hidden = true; // stale from whatever project was open before, if any
  lastBakeInfo = null;

  displayScale = computeDisplayScale(project.canvasWidth, project.canvasHeight);
  const displayWidth = Math.round(project.canvasWidth * displayScale);
  const displayHeight = Math.round(project.canvasHeight * displayScale);

  if (fabricCanvas) {
    fabricCanvas.dispose();
    fabricObjectsById.clear();
  }
  fabricCanvas = new Canvas(els.fabricCanvasEl, {
    width: displayWidth,
    height: displayHeight,
    backgroundColor: 'transparent',
    preserveObjectStacking: true,
  });

  fabricCanvas.on('selection:created', (e) => onFabricSelectionChanged(e.selected));
  fabricCanvas.on('selection:updated', (e) => onFabricSelectionChanged(e.selected));
  fabricCanvas.on('selection:cleared', () => onFabricSelectionChanged([]));
  fabricCanvas.on('object:modified', (e) => onFabricObjectModified(e.target));

  selectItem(null);

  // Rebuild every Fabric object from the loaded item data. Images load
  // asynchronously (they need a file read + base64 decode first), so this
  // awaits each in turn rather than firing them all off unordered.
  for (const item of [...project.items].sort((a, b) => a.zIndex - b.zIndex)) {
    await addFabricObjectForItem(item);
  }
  fabricCanvas.requestRenderAll();
}

// ---- ITEM <-> FABRIC OBJECT SYNC --------------------------------------------
// Every Fabric object created here gets `.itemId` set on it, so canvas
// events (selection, modification) can look back up which item it is.

async function addFabricObjectForItem(item) {
  let obj;
  if (item.type === 'image') {
    obj = await createImageFabricObject(item);
  } else {
    obj = createRectFabricObject(item);
  }
  if (!obj) return null;
  obj.itemId = item.id;
  fabricObjectsById.set(item.id, obj);
  fabricCanvas.add(obj);
  return obj;
}

function frameFillValue(p) {
  if (!p.fillEnabled) return 'transparent';
  if (p.fillType === 'gradient') {
    return new Gradient({
      type: 'linear',
      gradientUnits: 'percentage',
      coords: gradientCoordsForAngle(p.gradientAngle),
      colorStops: [
        { offset: 0, color: p.gradientFrom },
        { offset: 1, color: p.gradientTo },
      ],
    });
  }
  return p.fillColor;
}

// Live/dynamic item types (popup-slide, chat-overlay) have no real visual
// preview on the editing canvas — their actual behavior only exists in the
// baked output — so they each get a dashed placeholder box in their own
// accent color, purely so different item types are visually distinguishable
// at a glance while arranging a scene.
const PLACEHOLDER_ACCENTS = {
  'popup-slide': '#a594ff',
  'chat-overlay': '#35e6c4',
  'countdown-timer': '#ffb454',
  'pngtuber': '#ff6ec4',
  'viewer-pet': '#7cffb4',
  'pet-roster': '#5ec8ff',
  'now-playing': '#a8e05f',
};

function createRectFabricObject(item) {
  const accent = PLACEHOLDER_ACCENTS[item.type];
  const p = item.props;
  const rect = new Rect({
    left: item.x * displayScale,
    top: item.y * displayScale,
    width: item.width * displayScale,
    height: item.height * displayScale,
    angle: item.rotation || 0,
    scaleX: 1,
    scaleY: 1,
    strokeUniform: true,
    fill: accent ? 'rgba(124,92,255,0.15)' : frameFillValue(p),
    stroke: accent || p.strokeColor,
    strokeWidth: accent ? 2 : p.strokeWidth,
    strokeDashArray: accent ? [8, 5] : null,
    rx: accent ? 10 : p.cornerRadius,
    ry: accent ? 10 : p.cornerRadius,
  });
  return rect;
}

async function createImageFabricObject(item) {
  if (!item.props.sourcePath) return null;
  let dataUrl;
  try {
    const base64 = await invoke('read_binary_file_base64', { path: item.props.sourcePath });
    const ext = (item.props.sourcePath.split('.').pop() || 'png').toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    dataUrl = `data:${mime};base64,${base64}`;
  } catch (err) {
    setStatus('Couldn\'t load image for an item: ' + err, 'err');
    return null;
  }
  const img = await FabricImage.fromURL(dataUrl);
  const naturalWidth = img.width || 1;
  const naturalHeight = img.height || 1;
  img.set({
    left: item.x * displayScale,
    top: item.y * displayScale,
    angle: item.rotation || 0,
    scaleX: (item.width * displayScale) / naturalWidth,
    scaleY: (item.height * displayScale) / naturalHeight,
  });
  return img;
}

// Reads the current Fabric object's position/size/rotation back into real
// (non-display-scaled) pixels and writes it onto the matching item.
function syncItemFromFabricObject(obj) {
  const item = project.items.find((i) => i.id === obj.itemId);
  if (!item) return;
  item.x = Math.round(obj.left / displayScale);
  item.y = Math.round(obj.top / displayScale);
  item.rotation = Math.round(obj.angle || 0);
  if (item.type === 'image') {
    item.width = Math.round((obj.width * obj.scaleX) / displayScale);
    item.height = Math.round((obj.height * obj.scaleY) / displayScale);
  } else {
    // Rects: fold any drag-resize scale back into width/height directly so
    // scaleX/scaleY stay at 1 and stroke width doesn't visually distort.
    item.width = Math.round((obj.width * obj.scaleX) / displayScale);
    item.height = Math.round((obj.height * obj.scaleY) / displayScale);
    obj.set({ width: obj.width * obj.scaleX, height: obj.height * obj.scaleY, scaleX: 1, scaleY: 1 });
  }
}

function onFabricObjectModified(obj) {
  if (!obj || !obj.itemId) return;
  syncItemFromFabricObject(obj);
  if (obj.itemId === selectedItemId) renderPropertiesPanel();
}

function onFabricSelectionChanged(selected) {
  const obj = selected && selected.length === 1 ? selected[0] : null;
  selectItem(obj ? obj.itemId : null);
}

// Re-creates the Fabric object for one item from its current data — used
// after a properties-panel edit, so the canvas reflects the new values
// without fighting Fabric's own scaleX/scaleY bookkeeping.
async function refreshFabricObjectForItem(itemId) {
  const item = project.items.find((i) => i.id === itemId);
  const oldObj = fabricObjectsById.get(itemId);
  if (oldObj) fabricCanvas.remove(oldObj);
  const newObj = await addFabricObjectForItem(item);
  if (newObj) {
    fabricCanvas.setActiveObject(newObj);
  }
  fabricCanvas.requestRenderAll();
}

// ---- ADDING ITEMS -------------------------------------------------------------
async function addItem(type, extraProps) {
  if (!project) return;
  const size = defaultSizeFor(type);
  const item = {
    id: uid(),
    type,
    x: Math.round((project.canvasWidth - size.width) / 2),
    y: Math.round((project.canvasHeight - size.height) / 2),
    width: size.width,
    height: size.height,
    rotation: 0,
    zIndex: nextZIndex(),
    props: { ...defaultPropsFor(type), ...(extraProps || {}) },
  };
  project.items.push(item);
  const obj = await addFabricObjectForItem(item);
  if (obj) fabricCanvas.setActiveObject(obj);
  fabricCanvas.requestRenderAll();
  selectItem(item.id);
}

async function addImageItem() {
  const path = await invoke('pick_image_file');
  if (!path) return;
  await addItem('image', { sourcePath: path });
}

function deleteSelectedItem() {
  if (!selectedItemId) return;
  const obj = fabricObjectsById.get(selectedItemId);
  if (obj) fabricCanvas.remove(obj);
  fabricObjectsById.delete(selectedItemId);
  project.items = project.items.filter((i) => i.id !== selectedItemId);
  selectItem(null);
  fabricCanvas.requestRenderAll();
}

// ---- ASSET LIBRARY ---------------------------------------------------------
// A small app-level (not per-project) list of saved items - {id, name,
// type, props} - persisted as library.json in this app's own local-data
// directory (resolve_app_data_path + the same generic read/write/exists
// commands every other persisted file in this app already uses, rather
// than dedicated library-specific Rust commands). Position/size are
// deliberately NOT saved here - those are per-project placement
// decisions, not part of "what this item fundamentally is."
const LIBRARY_TYPE_LABELS = {
  frame: 'Frame / Border', image: 'Image', 'popup-slide': 'Popup Slide',
  'chat-overlay': 'Chat + TTS Overlay', 'countdown-timer': 'Countdown Timer', pngtuber: 'PNGTuber',
  'viewer-pet': 'Viewer Pet', 'pet-roster': 'Chat Pet Roster', 'now-playing': 'Now Playing',
};

let libraryEntries = [];
let libraryFilePath = null;

async function loadLibrary() {
  try {
    libraryFilePath = await invoke('resolve_app_data_path', { filename: 'library.json' });
    const exists = await invoke('file_exists', { path: libraryFilePath });
    if (exists) {
      const text = await invoke('read_text_file', { path: libraryFilePath });
      libraryEntries = JSON.parse(text);
    }
  } catch (err) {
    console.warn('Could not load the Asset Library:', err);
    libraryEntries = [];
  }
  renderLibraryList();
}

async function saveLibraryToDisk() {
  if (!libraryFilePath) return;
  await invoke('write_text_file', { path: libraryFilePath, contents: JSON.stringify(libraryEntries, null, 2) });
}

function renderLibraryList() {
  if (!els.libraryList) return;
  if (libraryEntries.length === 0) {
    els.libraryList.innerHTML = '<div class="hint">Nothing saved yet — select an item and click "Save to Library…" in the Properties panel to add one.</div>';
    return;
  }
  els.libraryList.innerHTML = libraryEntries.map((entry) => `
    <div class="slide-card">
      <div class="slide-card-head"><span>${escapeHtml(entry.name)}</span></div>
      <div class="hint">${escapeHtml(LIBRARY_TYPE_LABELS[entry.type] || entry.type)}</div>
      <div class="button-row">
        <button class="secondary" data-library-insert="${entry.id}" type="button">Insert</button>
        <button class="secondary" data-library-delete="${entry.id}" type="button">Remove</button>
      </div>
    </div>
  `).join('');
  els.libraryList.querySelectorAll('[data-library-insert]').forEach((btn) => {
    btn.addEventListener('click', () => insertLibraryEntry(btn.getAttribute('data-library-insert')));
  });
  els.libraryList.querySelectorAll('[data-library-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteLibraryEntry(btn.getAttribute('data-library-delete')));
  });
}

async function insertLibraryEntry(entryId) {
  const entry = libraryEntries.find((e) => e.id === entryId);
  if (!entry || !project) return;
  await addItem(entry.type, JSON.parse(JSON.stringify(entry.props)));
}

async function deleteLibraryEntry(entryId) {
  libraryEntries = libraryEntries.filter((e) => e.id !== entryId);
  await saveLibraryToDisk();
  renderLibraryList();
}

// Reuses the exact <dialog>-based prompt pattern promptSceneName()
// already established, rather than a native window.prompt() (unused
// anywhere else in this app, and less consistent with its own UI chrome).
function promptLibraryName(defaultName) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('saveToLibraryDialog');
    const input = document.getElementById('saveToLibraryInput');
    const confirmBtn = document.getElementById('saveToLibraryConfirmBtn');
    const cancelBtn = document.getElementById('saveToLibraryCancelBtn');
    input.value = defaultName;

    function cleanup() {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
    }
    function onConfirm() {
      cleanup();
      dialog.close();
      resolve(input.value);
    }
    function onCancel() {
      cleanup();
      dialog.close();
      resolve(null);
    }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onCancel); // Esc key closes <dialog>, fires 'cancel'

    dialog.showModal();
    input.focus();
    input.select();
  });
}

async function saveSelectedItemToLibrary() {
  if (!selectedItemId || !project) return;
  const item = project.items.find((i) => i.id === selectedItemId);
  if (!item) return;
  const defaultName = LIBRARY_TYPE_LABELS[item.type] || item.type;
  const name = await promptLibraryName(defaultName);
  if (!name) return;
  libraryEntries.push({
    id: uid(),
    name,
    type: item.type,
    props: JSON.parse(JSON.stringify(item.props)),
  });
  await saveLibraryToDisk();
  renderLibraryList();
  setStatus('Saved "' + name + '" to the Library.', 'ok');
}

// ---- SELECTION + PROPERTIES PANEL ---------------------------------------------
function selectItem(itemId) {
  selectedItemId = itemId;
  els.deleteItemBtn.hidden = !itemId;
  if (els.saveToLibraryBtn) els.saveToLibraryBtn.hidden = !itemId;
  renderPropertiesPanel();
}

function renderPropertiesPanel() {
  const body = els.propertiesBody;
  const item = project && selectedItemId ? project.items.find((i) => i.id === selectedItemId) : null;
  if (!item) {
    body.innerHTML = '<div class="hint">Select an item on the canvas to edit it.</div>';
    return;
  }
  if (item.type === 'frame') return renderFrameProperties(item, body);
  if (item.type === 'image') return renderImageProperties(item, body);
  if (item.type === 'popup-slide') return renderPopupSlideProperties(item, body);
  if (item.type === 'chat-overlay') return renderChatOverlayProperties(item, body);
  if (item.type === 'countdown-timer') return renderCountdownTimerProperties(item, body);
  if (item.type === 'pngtuber') return renderPngtuberProperties(item, body);
  if (item.type === 'viewer-pet') return renderViewerPetProperties(item, body);
  if (item.type === 'pet-roster') return renderPetRosterProperties(item, body);
  if (item.type === 'now-playing') return renderNowPlayingProperties(item, body);
}

function renderFrameProperties(item, body) {
  const p = item.props;
  if (!p.fillType) p.fillType = 'solid'; // tolerate projects saved before gradients existed

  body.innerHTML = `
    <div class="field"><label>Stroke color</label><input type="color" id="pf-strokeColor" value="${p.strokeColor}"></div>
    <div class="field"><label>Stroke width (px)</label><input type="number" id="pf-strokeWidth" min="0" value="${p.strokeWidth}"></div>
    <div class="field"><label>Corner radius (px)</label><input type="number" id="pf-cornerRadius" min="0" value="${p.cornerRadius}"></div>
    <div class="field">
      <label><input type="checkbox" id="pf-fillEnabled" ${p.fillEnabled ? 'checked' : ''}> Fill</label>
    </div>
    <div id="pf-fillControls"></div>
  `;

  const fillControlsHost = document.getElementById('pf-fillControls');

  async function apply() {
    p.strokeColor = document.getElementById('pf-strokeColor').value;
    p.strokeWidth = parseFloat(document.getElementById('pf-strokeWidth').value) || 0;
    p.cornerRadius = parseFloat(document.getElementById('pf-cornerRadius').value) || 0;
    p.fillEnabled = document.getElementById('pf-fillEnabled').checked;
    const fillTypeEl = document.getElementById('pf-fillType');
    if (fillTypeEl) p.fillType = fillTypeEl.value;
    const fillColorEl = document.getElementById('pf-fillColor');
    if (fillColorEl) p.fillColor = fillColorEl.value;
    const gradientFromEl = document.getElementById('pf-gradientFrom');
    if (gradientFromEl) p.gradientFrom = gradientFromEl.value;
    const gradientToEl = document.getElementById('pf-gradientTo');
    if (gradientToEl) p.gradientTo = gradientToEl.value;
    const gradientAngleEl = document.getElementById('pf-gradientAngle');
    if (gradientAngleEl) p.gradientAngle = parseFloat(gradientAngleEl.value) || 0;
    await refreshFabricObjectForItem(item.id);
  }

  function renderFillControls() {
    if (!p.fillEnabled) {
      fillControlsHost.innerHTML = '';
      return;
    }
    fillControlsHost.innerHTML = `
      <div class="field">
        <label for="pf-fillType">Fill type</label>
        <select id="pf-fillType">
          <option value="solid" ${p.fillType === 'solid' ? 'selected' : ''}>Solid color</option>
          <option value="gradient" ${p.fillType === 'gradient' ? 'selected' : ''}>Gradient</option>
        </select>
      </div>
      ${p.fillType === 'gradient' ? `
        <div class="field-row">
          <div class="field"><label>From</label><input type="color" id="pf-gradientFrom" value="${p.gradientFrom}"></div>
          <div class="field"><label>To</label><input type="color" id="pf-gradientTo" value="${p.gradientTo}"></div>
        </div>
        <div class="field"><label>Angle (degrees, 0 = to top, 90 = to right)</label><input type="number" id="pf-gradientAngle" min="0" max="360" value="${p.gradientAngle}"></div>
      ` : `
        <div class="field"><label>Fill color</label><input type="color" id="pf-fillColor" value="${p.fillColor}"></div>
      `}
    `;
    fillControlsHost.querySelectorAll('input, select').forEach((el) => el.addEventListener('change', onFillFieldChange));
  }

  async function onFillFieldChange(e) {
    const needsRerender = e.target.id === 'pf-fillType';
    await apply();
    if (needsRerender) renderFillControls();
  }

  async function onBaseFieldChange(e) {
    const needsRerender = e.target.id === 'pf-fillEnabled';
    await apply();
    if (needsRerender) renderFillControls();
  }

  renderFillControls();
  ['pf-strokeColor', 'pf-strokeWidth', 'pf-cornerRadius', 'pf-fillEnabled']
    .forEach((id) => document.getElementById(id).addEventListener('change', onBaseFieldChange));
}

function renderImageProperties(item, body) {
  body.innerHTML = `
    <div class="field"><label>Source file</label>
      <div class="hint">${escapeHtml(item.props.sourcePath)}</div>
    </div>
    <button class="secondary block" id="pf-replaceImage" type="button">Replace image…</button>
    <button class="secondary block" id="pf-chromaKey" type="button">Chroma Key…</button>
    <button class="secondary block" id="pf-crop" type="button">Crop…</button>
    <button class="secondary block" id="pf-pad" type="button">Pad…</button>
    <button class="secondary block" id="pf-colorAdjust" type="button">Color Adjust…</button>
    <button class="secondary block" id="pf-outline" type="button">Outline…</button>
    <button class="secondary block" id="pf-blur" type="button">Blur…</button>
    <button class="secondary block" id="pf-sharpen" type="button">Sharpen…</button>
    <button class="secondary block" id="pf-vignette" type="button">Vignette…</button>
    <div class="button-row">
      <button class="secondary" id="pf-flipH" type="button" title="Flip Horizontal">Flip ↔</button>
      <button class="secondary" id="pf-flipV" type="button" title="Flip Vertical">Flip ↕</button>
      <button class="secondary" id="pf-rotateCW" type="button" title="Rotate 90° Clockwise">Rotate ↻</button>
      <button class="secondary" id="pf-rotateCCW" type="button" title="Rotate 90° Counter-Clockwise">Rotate ↺</button>
    </div>
  `;
  document.getElementById('pf-replaceImage').addEventListener('click', async () => {
    const path = await invoke('pick_image_file');
    if (!path) return;
    item.props.sourcePath = path;
    await refreshFabricObjectForItem(item.id);
    renderPropertiesPanel();
  });
  document.getElementById('pf-chromaKey').addEventListener('click', () => openChromaKeyDialog(item));
  document.getElementById('pf-crop').addEventListener('click', () => openCropDialog(item));
  document.getElementById('pf-colorAdjust').addEventListener('click', () => openColorAdjustDialog(item));
  document.getElementById('pf-outline').addEventListener('click', () => openOutlineDialog(item));
  document.getElementById('pf-blur').addEventListener('click', () => openBlurDialog(item));
  document.getElementById('pf-sharpen').addEventListener('click', () => openSharpenDialog(item));
  document.getElementById('pf-vignette').addEventListener('click', () => openVignetteDialog(item));
  document.getElementById('pf-flipH').addEventListener('click', () => applyInstantTransform(item, (img) => applyFlip(img, { horizontal: true }), 'flipped'));
  document.getElementById('pf-flipV').addEventListener('click', () => applyInstantTransform(item, (img) => applyFlip(img, { vertical: true }), 'flipped'));
  document.getElementById('pf-rotateCW').addEventListener('click', () => applyInstantTransform(item, (img) => applyRotate(img, 90), 'rotated'));
  document.getElementById('pf-rotateCCW').addEventListener('click', () => applyInstantTransform(item, (img) => applyRotate(img, 270), 'rotated'));
  document.getElementById('pf-pad').addEventListener('click', () => openPadDialog(item));
}

// Flip/rotate are instant one-click actions, unlike the other image edits —
// there's nothing to tune with a slider, so no dialog/preview is needed.
// `transformFn` is one of applyFlip/applyRotate already bound with its
// specific arguments (see the button handlers above).
async function applyInstantTransform(item, transformFn, verbLabel) {
  let imageData;
  try {
    imageData = await loadItemImageData(item);
  } catch (err) {
    setStatus('Couldn\'t load image: ' + err, 'err');
    return;
  }
  const result = transformFn(imageData);
  try {
    const outputPath = await saveProcessedImageForItem(item, result, verbLabel);
    setStatus('Image ' + verbLabel + ' — saved to ' + outputPath, 'ok');
  } catch (err) {
    setStatus('Couldn\'t save ' + verbLabel + ' image: ' + err, 'err');
  }
}

// ---- CHROMA KEY DIALOG ------------------------------------------------------
// See chromakey.js for the actual pixel algorithm. This just wires up the
// dialog: load the image at its real (full) resolution, let the user click
// to sample a key color, live-preview the result as sliders move, and on
// Apply write a new "<id>-keyed.png" file rather than touching the
// original — so Cancel/redo is never destructive.
let ckItem = null;
let ckOriginalImageData = null; // the untouched original pixels, sampled from
let ckKeyColor = { r: 0, g: 255, b: 0 };

function ckCurrentOptions() {
  return {
    keyColor: ckKeyColor,
    similarity: parseFloat(document.getElementById('ckSimilarity').value),
    feather: parseFloat(document.getElementById('ckFeather').value),
    spillSuppression: parseFloat(document.getElementById('ckSpill').value),
  };
}

function ckUpdateSliderLabels() {
  document.getElementById('ckSimilarityValue').textContent = document.getElementById('ckSimilarity').value;
  document.getElementById('ckFeatherValue').textContent = document.getElementById('ckFeather').value;
  document.getElementById('ckSpillValue').textContent = document.getElementById('ckSpill').value;
}

function ckUpdateSwatch() {
  const swatch = document.getElementById('ckKeyColorSwatch');
  swatch.style.background = `rgb(${ckKeyColor.r}, ${ckKeyColor.g}, ${ckKeyColor.b})`;
}

function ckRedrawPreview() {
  const canvas = document.getElementById('ckPreviewCanvas');
  const ctx = canvas.getContext('2d');
  const result = applyChromaKey(ckOriginalImageData, ckCurrentOptions());
  ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
}

async function openChromaKeyDialog(item) {
  ckItem = item;
  const dialog = document.getElementById('chromaKeyDialog');
  const canvas = document.getElementById('ckPreviewCanvas');

  let base64, ext;
  try {
    base64 = await invoke('read_binary_file_base64', { path: item.props.sourcePath });
    ext = (item.props.sourcePath.split('.').pop() || 'png').toLowerCase();
  } catch (err) {
    setStatus('Couldn\'t load image for chroma key: ' + err, 'err');
    return;
  }
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = `data:${mime};base64,${base64}`;
  });

  // Canvas's actual pixel buffer matches the image 1:1 (CSS shrinks it for
  // display — see .ck-preview-wrap/#ckPreviewCanvas in styles.css) so
  // eyedropper clicks and the final Apply both work in real image pixels,
  // no scale-factor math needed here.
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ckOriginalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  ckResetControls();

  dialog.showModal();
}

// Shared by openChromaKeyDialog (fresh state each time it's opened) and
// the Reset button (same defaults, without closing the dialog).
function ckResetControls() {
  document.getElementById('ckSimilarity').value = 0.15;
  document.getElementById('ckFeather').value = 0.1;
  document.getElementById('ckSpill').value = 0.5;
  // Default key color: sample the top-left corner, a reasonable guess for
  // "probably background" until the user picks for real.
  const d = ckOriginalImageData.data;
  ckKeyColor = { r: d[0], g: d[1], b: d[2] };
  ckUpdateSwatch();
  ckUpdateSliderLabels();
  ckRedrawPreview();
}

function wireChromaKeyDialog() {
  const canvas = document.getElementById('ckPreviewCanvas');
  const dialog = document.getElementById('chromaKeyDialog');

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    // Map the click's on-screen (CSS-scaled) position back to real pixel
    // coordinates in the canvas's own buffer.
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    const i = (y * ckOriginalImageData.width + x) * 4;
    ckKeyColor = { r: ckOriginalImageData.data[i], g: ckOriginalImageData.data[i + 1], b: ckOriginalImageData.data[i + 2] };
    ckUpdateSwatch();
    ckRedrawPreview();
  });

  ['ckSimilarity', 'ckFeather', 'ckSpill'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      ckUpdateSliderLabels();
      ckRedrawPreview();
    });
  });

  document.getElementById('ckCancelBtn').addEventListener('click', () => dialog.close());
  document.getElementById('ckResetBtn').addEventListener('click', ckResetControls);

  document.getElementById('ckApplyBtn').addEventListener('click', async () => {
    const canvas = document.getElementById('ckPreviewCanvas');
    const outputPath = joinPath(editedImagesFolder(), ckItem.id + '-keyed.png');
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
    try {
      await invoke('write_binary_file', { path: outputPath, base64Data });
    } catch (err) {
      setStatus('Couldn\'t save chroma-keyed image: ' + err, 'err');
      return;
    }
    ckItem.props.sourcePath = outputPath;
    await refreshFabricObjectForItem(ckItem.id);
    renderPropertiesPanel();
    dialog.close();
    setStatus('Chroma key applied — saved to ' + outputPath, 'ok');
  });
}

// Where edited-image outputs (chroma key, crop, pad, and every other
// effect below) get written — a hidden subfolder of the project, never
// the folder the original source image was picked from. Editing an
// image used to drop a `<id>-keyed.png`-style file right next to
// whatever file the user imported (their Pictures folder, Desktop,
// wherever), silently cluttering it; everything the app derives from a
// source image now lives under the project instead, same non-pollution
// pattern `.preview/` already uses for previews.
function editedImagesFolder() {
  return joinPath(projectFolder, '.edited-images');
}

// Reads an item's image off disk and returns { imageData, naturalWidth,
// naturalHeight } — shared by the crop and pad dialogs below (both need
// the same "load this item's source image as pixels" step).
async function loadItemImageData(item) {
  const base64 = await invoke('read_binary_file_base64', { path: item.props.sourcePath });
  const ext = (item.props.sourcePath.split('.').pop() || 'png').toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = `data:${mime};base64,${base64}`;
  });
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = img.naturalWidth;
  tmpCanvas.height = img.naturalHeight;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(img, 0, 0);
  return tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
}

// Writes a processed { width, height, data } result out as a new PNG next
// to the item's original file, and updates the item to point at it — the
// same non-destructive pattern chroma-key uses. Also resizes the item's
// on-canvas box to the result's real dimensions (1:1, no stretching),
// since crop/pad both change the image's actual pixel size.
async function saveProcessedImageForItem(item, result, suffix) {
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = result.width;
  tmpCanvas.height = result.height;
  tmpCanvas.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
  const dataUrl = tmpCanvas.toDataURL('image/png');
  const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
  const outputPath = joinPath(editedImagesFolder(), item.id + '-' + suffix + '.png');
  await invoke('write_binary_file', { path: outputPath, base64Data });
  item.props.sourcePath = outputPath;
  item.width = result.width;
  item.height = result.height;
  await refreshFabricObjectForItem(item.id);
  renderPropertiesPanel();
  return outputPath;
}

// ---- CROP DIALOG -------------------------------------------------------
// A small dedicated Fabric canvas: the image sits underneath as a static
// (non-interactive) background, and one draggable/resizable Rect on top
// is the crop selection. Apply reads the Rect's bounds back into real
// image pixels and calls cropImageData.
let cropItem = null;
let cropFabricCanvas = null;
let cropOriginalImageData = null;
let cropSelectionRect = null;
let cropDisplayScale = 1;
const CROP_MAX_DISPLAY = 620;

async function openCropDialog(item) {
  cropItem = item;
  cropOriginalImageData = await loadItemImageData(item);

  cropDisplayScale = Math.min(CROP_MAX_DISPLAY / cropOriginalImageData.width, CROP_MAX_DISPLAY / cropOriginalImageData.height, 1);
  const displayWidth = Math.round(cropOriginalImageData.width * cropDisplayScale);
  const displayHeight = Math.round(cropOriginalImageData.height * cropDisplayScale);

  if (cropFabricCanvas) cropFabricCanvas.dispose();
  cropFabricCanvas = new Canvas(document.getElementById('cropCanvasEl'), {
    width: displayWidth,
    height: displayHeight,
    backgroundColor: 'transparent',
  });

  // Draw the image as the background by loading it fresh at display size
  // (simplest way to get a non-interactive backdrop under the crop box).
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = cropOriginalImageData.width;
  tmpCanvas.height = cropOriginalImageData.height;
  tmpCanvas.getContext('2d').putImageData(cropOriginalImageData, 0, 0);
  const bgImage = await FabricImage.fromURL(tmpCanvas.toDataURL('image/png'));
  bgImage.set({ left: 0, top: 0, scaleX: cropDisplayScale, scaleY: cropDisplayScale, selectable: false, evented: false });
  cropFabricCanvas.add(bgImage);

  // Default selection: the middle 60% of the image.
  const selW = displayWidth * 0.6;
  const selH = displayHeight * 0.6;
  cropSelectionRect = new Rect({
    left: (displayWidth - selW) / 2,
    top: (displayHeight - selH) / 2,
    width: selW,
    height: selH,
    fill: 'rgba(124,92,255,0.15)',
    stroke: '#a594ff',
    strokeWidth: 2,
    strokeUniform: true,
    cornerColor: '#7c5cff',
  });
  cropFabricCanvas.add(cropSelectionRect);
  cropFabricCanvas.setActiveObject(cropSelectionRect);
  cropFabricCanvas.requestRenderAll();

  document.getElementById('cropDialog').showModal();
}

function wireCropDialog() {
  document.getElementById('cropCancelBtn').addEventListener('click', () => document.getElementById('cropDialog').close());

  document.getElementById('cropApplyBtn').addEventListener('click', async () => {
    const rect = {
      x: cropSelectionRect.left / cropDisplayScale,
      y: cropSelectionRect.top / cropDisplayScale,
      width: (cropSelectionRect.width * cropSelectionRect.scaleX) / cropDisplayScale,
      height: (cropSelectionRect.height * cropSelectionRect.scaleY) / cropDisplayScale,
    };
    const result = cropImageData(cropOriginalImageData, rect);
    try {
      const outputPath = await saveProcessedImageForItem(cropItem, result, 'cropped');
      setStatus('Cropped — saved to ' + outputPath, 'ok');
    } catch (err) {
      setStatus('Couldn\'t save cropped image: ' + err, 'err');
      return;
    }
    document.getElementById('cropDialog').close();
  });
}

// ---- PAD DIALOG ---------------------------------------------------------
let padItem = null;

function openPadDialog(item) {
  padItem = item;
  document.getElementById('padDialog').showModal();
}

function wirePadDialog() {
  document.getElementById('padCancelBtn').addEventListener('click', () => document.getElementById('padDialog').close());

  document.getElementById('padApplyBtn').addEventListener('click', async () => {
    const transparent = document.getElementById('padTransparent').checked;
    const hex = document.getElementById('padFillColor').value; // "#rrggbb"
    const fillColor = transparent
      ? { r: 0, g: 0, b: 0, a: 0 }
      : {
          r: parseInt(hex.slice(1, 3), 16),
          g: parseInt(hex.slice(3, 5), 16),
          b: parseInt(hex.slice(5, 7), 16),
          a: 255,
        };
    const options = {
      top: parseFloat(document.getElementById('padTop').value) || 0,
      right: parseFloat(document.getElementById('padRight').value) || 0,
      bottom: parseFloat(document.getElementById('padBottom').value) || 0,
      left: parseFloat(document.getElementById('padLeft').value) || 0,
      fillColor,
    };

    let imageData;
    try {
      imageData = await loadItemImageData(padItem);
    } catch (err) {
      setStatus('Couldn\'t load image for padding: ' + err, 'err');
      return;
    }
    const result = padImageData(imageData, options);
    try {
      const outputPath = await saveProcessedImageForItem(padItem, result, 'padded');
      setStatus('Padded — saved to ' + outputPath, 'ok');
    } catch (err) {
      setStatus('Couldn\'t save padded image: ' + err, 'err');
      return;
    }
    document.getElementById('padDialog').close();
  });
}

// ---- COLOR ADJUST DIALOG ---------------------------------------------------
// Same live-preview-on-slider-input pattern as Chroma Key: recompute from
// the untouched original on every slider move, so adjustments never
// compound or drift from repeated tweaking.
let caItem = null;
let caOriginalImageData = null;

function caCurrentOptions() {
  return {
    brightness: parseFloat(document.getElementById('caBrightness').value),
    contrast: parseFloat(document.getElementById('caContrast').value),
    saturation: parseFloat(document.getElementById('caSaturation').value),
  };
}

function caUpdateSliderLabels() {
  document.getElementById('caBrightnessValue').textContent = document.getElementById('caBrightness').value;
  document.getElementById('caContrastValue').textContent = document.getElementById('caContrast').value;
  document.getElementById('caSaturationValue').textContent = document.getElementById('caSaturation').value;
}

function caRedrawPreview() {
  const canvas = document.getElementById('caPreviewCanvas');
  const ctx = canvas.getContext('2d');
  const result = applyColorAdjustments(caOriginalImageData, caCurrentOptions());
  ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
}

async function openColorAdjustDialog(item) {
  caItem = item;
  try {
    caOriginalImageData = await loadItemImageData(item);
  } catch (err) {
    setStatus('Couldn\'t load image for color adjust: ' + err, 'err');
    return;
  }

  const canvas = document.getElementById('caPreviewCanvas');
  canvas.width = caOriginalImageData.width;
  canvas.height = caOriginalImageData.height;

  ['caBrightness', 'caContrast', 'caSaturation'].forEach((id) => { document.getElementById(id).value = 0; });
  caUpdateSliderLabels();
  caRedrawPreview();

  document.getElementById('colorAdjustDialog').showModal();
}

function wireColorAdjustDialog() {
  ['caBrightness', 'caContrast', 'caSaturation'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      caUpdateSliderLabels();
      caRedrawPreview();
    });
  });

  document.getElementById('caResetBtn').addEventListener('click', () => {
    ['caBrightness', 'caContrast', 'caSaturation'].forEach((id) => { document.getElementById(id).value = 0; });
    caUpdateSliderLabels();
    caRedrawPreview();
  });

  document.getElementById('caCancelBtn').addEventListener('click', () => document.getElementById('colorAdjustDialog').close());

  document.getElementById('caApplyBtn').addEventListener('click', async () => {
    const result = applyColorAdjustments(caOriginalImageData, caCurrentOptions());
    try {
      const outputPath = await saveProcessedImageForItem(caItem, result, 'adjusted');
      setStatus('Color adjusted — saved to ' + outputPath, 'ok');
    } catch (err) {
      setStatus('Couldn\'t save color-adjusted image: ' + err, 'err');
      return;
    }
    document.getElementById('colorAdjustDialog').close();
  });
}

// ---- OUTLINE DIALOG -------------------------------------------------------
let olItem = null;
let olOriginalImageData = null;

function olCurrentOptions() {
  const hex = document.getElementById('olStrokeColor').value;
  return {
    strokeWidth: parseFloat(document.getElementById('olStrokeWidth').value),
    strokeColor: {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    },
  };
}

function olRedrawPreview() {
  const canvas = document.getElementById('olPreviewCanvas');
  const ctx = canvas.getContext('2d');
  const result = applyOutline(olOriginalImageData, olCurrentOptions());
  ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
}

async function openOutlineDialog(item) {
  olItem = item;
  try {
    olOriginalImageData = await loadItemImageData(item);
  } catch (err) {
    setStatus('Couldn\'t load image for outline: ' + err, 'err');
    return;
  }

  const canvas = document.getElementById('olPreviewCanvas');
  canvas.width = olOriginalImageData.width;
  canvas.height = olOriginalImageData.height;

  olResetControls();

  document.getElementById('outlineDialog').showModal();
}

function olResetControls() {
  document.getElementById('olStrokeWidth').value = 6;
  document.getElementById('olStrokeColor').value = '#ffffff';
  document.getElementById('olStrokeWidthValue').textContent = document.getElementById('olStrokeWidth').value;
  olRedrawPreview();
}

function wireOutlineDialog() {
  document.getElementById('olStrokeWidth').addEventListener('input', () => {
    document.getElementById('olStrokeWidthValue').textContent = document.getElementById('olStrokeWidth').value;
    olRedrawPreview();
  });
  document.getElementById('olStrokeColor').addEventListener('input', olRedrawPreview);

  document.getElementById('olResetBtn').addEventListener('click', olResetControls);
  document.getElementById('olCancelBtn').addEventListener('click', () => document.getElementById('outlineDialog').close());

  document.getElementById('olApplyBtn').addEventListener('click', async () => {
    const result = applyOutline(olOriginalImageData, olCurrentOptions());
    try {
      const outputPath = await saveProcessedImageForItem(olItem, result, 'outlined');
      setStatus('Outline applied — saved to ' + outputPath, 'ok');
    } catch (err) {
      setStatus('Couldn\'t save outlined image: ' + err, 'err');
      return;
    }
    document.getElementById('outlineDialog').close();
  });
}

// ---- BLUR DIALOG ---------------------------------------------------------
let blItem = null;
let blOriginalImageData = null;

function blRedrawPreview() {
  const canvas = document.getElementById('blPreviewCanvas');
  const ctx = canvas.getContext('2d');
  const radius = parseFloat(document.getElementById('blRadius').value);
  const result = applyBlur(blOriginalImageData, { radius });
  ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
}

async function openBlurDialog(item) {
  blItem = item;
  try {
    blOriginalImageData = await loadItemImageData(item);
  } catch (err) {
    setStatus('Couldn\'t load image for blur: ' + err, 'err');
    return;
  }

  const canvas = document.getElementById('blPreviewCanvas');
  canvas.width = blOriginalImageData.width;
  canvas.height = blOriginalImageData.height;

  blResetControls();

  document.getElementById('blurDialog').showModal();
}

function blResetControls() {
  document.getElementById('blRadius').value = 4;
  document.getElementById('blRadiusValue').textContent = '4';
  blRedrawPreview();
}

function wireBlurDialog() {
  document.getElementById('blRadius').addEventListener('input', () => {
    document.getElementById('blRadiusValue').textContent = document.getElementById('blRadius').value;
    blRedrawPreview();
  });

  document.getElementById('blResetBtn').addEventListener('click', blResetControls);
  document.getElementById('blCancelBtn').addEventListener('click', () => document.getElementById('blurDialog').close());

  document.getElementById('blApplyBtn').addEventListener('click', async () => {
    const radius = parseFloat(document.getElementById('blRadius').value);
    const result = applyBlur(blOriginalImageData, { radius });
    try {
      const outputPath = await saveProcessedImageForItem(blItem, result, 'blurred');
      setStatus('Blur applied — saved to ' + outputPath, 'ok');
    } catch (err) {
      setStatus('Couldn\'t save blurred image: ' + err, 'err');
      return;
    }
    document.getElementById('blurDialog').close();
  });
}

// ---- SHARPEN DIALOG -------------------------------------------------------
let shItem = null;
let shOriginalImageData = null;

function shRedrawPreview() {
  const canvas = document.getElementById('shPreviewCanvas');
  const ctx = canvas.getContext('2d');
  const amount = parseFloat(document.getElementById('shAmount').value);
  const radius = parseFloat(document.getElementById('shRadius').value);
  const result = applySharpen(shOriginalImageData, { amount, radius });
  ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
}

async function openSharpenDialog(item) {
  shItem = item;
  try {
    shOriginalImageData = await loadItemImageData(item);
  } catch (err) {
    setStatus('Couldn\'t load image for sharpen: ' + err, 'err');
    return;
  }

  const canvas = document.getElementById('shPreviewCanvas');
  canvas.width = shOriginalImageData.width;
  canvas.height = shOriginalImageData.height;

  shResetControls();

  document.getElementById('sharpenDialog').showModal();
}

function shResetControls() {
  document.getElementById('shAmount').value = 1;
  document.getElementById('shAmountValue').textContent = '1';
  document.getElementById('shRadius').value = 2;
  document.getElementById('shRadiusValue').textContent = '2';
  shRedrawPreview();
}

function wireSharpenDialog() {
  document.getElementById('shAmount').addEventListener('input', () => {
    document.getElementById('shAmountValue').textContent = document.getElementById('shAmount').value;
    shRedrawPreview();
  });

  document.getElementById('shRadius').addEventListener('input', () => {
    document.getElementById('shRadiusValue').textContent = document.getElementById('shRadius').value;
    shRedrawPreview();
  });

  document.getElementById('shResetBtn').addEventListener('click', shResetControls);
  document.getElementById('shCancelBtn').addEventListener('click', () => document.getElementById('sharpenDialog').close());

  document.getElementById('shApplyBtn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('shAmount').value);
    const radius = parseFloat(document.getElementById('shRadius').value);
    const result = applySharpen(shOriginalImageData, { amount, radius });
    try {
      const outputPath = await saveProcessedImageForItem(shItem, result, 'sharpened');
      setStatus('Sharpen applied — saved to ' + outputPath, 'ok');
    } catch (err) {
      setStatus('Couldn\'t save sharpened image: ' + err, 'err');
      return;
    }
    document.getElementById('sharpenDialog').close();
  });
}

// ---- VIGNETTE DIALOG -------------------------------------------------------
let vgItem = null;
let vgOriginalImageData = null;

function vgCurrentOptions() {
  const hex = document.getElementById('vgColor').value;
  return {
    strength: parseFloat(document.getElementById('vgStrength').value),
    radius: parseFloat(document.getElementById('vgRadius').value),
    softness: parseFloat(document.getElementById('vgSoftness').value),
    color: {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    },
  };
}

function vgRedrawPreview() {
  const canvas = document.getElementById('vgPreviewCanvas');
  const ctx = canvas.getContext('2d');
  const result = applyVignette(vgOriginalImageData, vgCurrentOptions());
  ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
}

async function openVignetteDialog(item) {
  vgItem = item;
  try {
    vgOriginalImageData = await loadItemImageData(item);
  } catch (err) {
    setStatus('Couldn\'t load image for vignette: ' + err, 'err');
    return;
  }

  const canvas = document.getElementById('vgPreviewCanvas');
  canvas.width = vgOriginalImageData.width;
  canvas.height = vgOriginalImageData.height;

  vgResetControls();

  document.getElementById('vignetteDialog').showModal();
}

function vgResetControls() {
  document.getElementById('vgStrength').value = 0.5;
  document.getElementById('vgStrengthValue').textContent = '0.5';
  document.getElementById('vgRadius').value = 0.6;
  document.getElementById('vgRadiusValue').textContent = '0.6';
  document.getElementById('vgSoftness').value = 0.6;
  document.getElementById('vgSoftnessValue').textContent = '0.6';
  document.getElementById('vgColor').value = '#000000';
  vgRedrawPreview();
}

function wireVignetteDialog() {
  document.getElementById('vgStrength').addEventListener('input', () => {
    document.getElementById('vgStrengthValue').textContent = document.getElementById('vgStrength').value;
    vgRedrawPreview();
  });
  document.getElementById('vgRadius').addEventListener('input', () => {
    document.getElementById('vgRadiusValue').textContent = document.getElementById('vgRadius').value;
    vgRedrawPreview();
  });
  document.getElementById('vgSoftness').addEventListener('input', () => {
    document.getElementById('vgSoftnessValue').textContent = document.getElementById('vgSoftness').value;
    vgRedrawPreview();
  });
  document.getElementById('vgColor').addEventListener('input', vgRedrawPreview);

  document.getElementById('vgResetBtn').addEventListener('click', vgResetControls);
  document.getElementById('vgCancelBtn').addEventListener('click', () => document.getElementById('vignetteDialog').close());

  document.getElementById('vgApplyBtn').addEventListener('click', async () => {
    const result = applyVignette(vgOriginalImageData, vgCurrentOptions());
    try {
      const outputPath = await saveProcessedImageForItem(vgItem, result, 'vignetted');
      setStatus('Vignette applied — saved to ' + outputPath, 'ok');
    } catch (err) {
      setStatus('Couldn\'t save vignetted image: ' + err, 'err');
      return;
    }
    document.getElementById('vignetteDialog').close();
  });
}

// Icon preview shown next to each slide card's icon-mode dropdown. Custom
// icons are filled in asynchronously after the list renders (see
// loadCustomIconPreviews below) since reading the file's bytes needs an
// invoke() round trip — a data: URL is never persisted in props, only the
// file PATH is (same convention `image` items already use), so this is
// re-fetched on demand rather than cached.
function iconPreviewHTML(s, i) {
  if (s.iconMode === 'platform' && s.platformKey) {
    return `<div class="icon-preview"><svg viewBox="0 0 24 24">${platformIconSvg(s.platformKey)}</svg></div>`;
  }
  if (s.iconMode === 'keep' && s.rawIcon) {
    return `<div class="icon-preview"><svg viewBox="0 0 24 24">${s.rawIcon}</svg></div>`;
  }
  if (s.iconMode === 'custom') {
    return `<div class="icon-preview" data-custom-preview="${i}"></div>`;
  }
  return `<div class="icon-preview"><div style="width:20px;height:20px;border-radius:4px;background:#7c5cff;"></div></div>`;
}

function iconOptionsHTML(s) {
  const options = ['<option value="none">No icon</option>'];
  for (const key in PLATFORM_ICONS) {
    options.push(`<option value="platform:${key}">${PLATFORM_ICONS[key].label}</option>`);
  }
  options.push('<option value="custom">Custom image file…</option>');
  if (s.iconMode === 'keep') {
    options.push('<option value="keep">Existing custom icon (kept as-is)</option>');
  }
  return options.join('');
}

function iconSelectedValue(s) {
  if (s.iconMode === 'platform') return `platform:${s.platformKey}`;
  if (s.iconMode === 'custom') return 'custom';
  if (s.iconMode === 'keep') return 'keep';
  return 'none';
}

function renderPopupSlideProperties(item, body) {
  const p = item.props;
  if (!p.contentMode) p.contentMode = 'structured'; // tolerate projects saved before this field existed

  body.innerHTML = `
    <div class="field">
      <label for="pf-transitionStyle">Text transition style</label>
      <select id="pf-transitionStyle">
        ${['fade', 'slide', 'slide-up', 'slide-down', 'zoom', 'none', 'random']
          .map((v) => `<option value="${v}" ${v === p.transitionStyle ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="field-row">
      <div class="field"><label>Seconds per slide</label><input type="number" id="pf-perSlideSeconds" step="0.1" min="0.5" value="${p.perSlideMs / 1000}"></div>
      <div class="field"><label>Pause before repeat (sec)</label><input type="number" id="pf-pauseSeconds" step="0.1" min="0" value="${p.pauseMs / 1000}"></div>
    </div>
    <div class="field">
      <label for="pf-contentMode">Slide content</label>
      <select id="pf-contentMode">
        <option value="structured" ${p.contentMode === 'structured' ? 'selected' : ''}>Per-slide (icons supported)</option>
        <option value="plaintext" ${p.contentMode === 'plaintext' ? 'selected' : ''}>Plaintext (quick to edit, no icons)</option>
      </select>
    </div>
    <div id="pf-slideContent"></div>
    <button class="secondary block" id="pf-previewSlide" type="button" title="Preview just this item in your browser, without doing a full Bake">Preview…</button>
  `;

  document.getElementById('pf-previewSlide').addEventListener('click', () => previewItem(item));

  const contentHost = document.getElementById('pf-slideContent');

  function renderSlideList() {
    const list = document.getElementById('pf-slideList');
    list.innerHTML = p.slides.map((s, i) => {
      if (!s.iconMode) s.iconMode = 'none'; // tolerate slides saved before icons existed
      return `
        <div class="slide-card">
          <div class="slide-card-head"><span>SLIDE ${i + 1}</span>
            <button class="remove-btn" style="margin:0;width:auto;padding:2px 8px;" data-i="${i}" data-action="remove-slide" type="button">Remove</button>
          </div>
          <div class="field"><label>Tag</label><input type="text" data-i="${i}" data-field="tag" value="${escapeHtml(s.tag)}"></div>
          <div class="field"><label>Text</label><input type="text" data-i="${i}" data-field="text" value="${escapeHtml(s.text)}"></div>
          <div class="icon-row">
            ${iconPreviewHTML(s, i)}
            <select data-i="${i}" data-field="iconSelect">${iconOptionsHTML(s)}</select>
          </div>
          ${s.iconMode === 'custom' ? `<button class="secondary block" style="margin-top:6px;" data-i="${i}" data-action="pick-custom-icon" type="button">Choose image…</button>` : ''}
        </div>
      `;
    }).join('');

    list.querySelectorAll('select[data-field="iconSelect"]').forEach((sel) => {
      const i = parseInt(sel.getAttribute('data-i'), 10);
      sel.value = iconSelectedValue(p.slides[i]);
    });

    list.querySelectorAll('input').forEach((el) => el.addEventListener('input', (e) => {
      const i = parseInt(e.target.getAttribute('data-i'), 10);
      const field = e.target.getAttribute('data-field');
      p.slides[i][field] = e.target.value;
    }));

    list.querySelectorAll('[data-action="remove-slide"]').forEach((btn) => btn.addEventListener('click', (e) => {
      const i = parseInt(e.target.getAttribute('data-i'), 10);
      if (p.slides.length <= 1) return; // keep at least one slide
      p.slides.splice(i, 1);
      renderSlideList();
    }));

    list.querySelectorAll('select[data-field="iconSelect"]').forEach((sel) => sel.addEventListener('change', (e) => {
      const i = parseInt(e.target.getAttribute('data-i'), 10);
      const val = e.target.value;
      if (val === 'none') {
        p.slides[i].iconMode = 'none';
      } else if (val === 'custom') {
        p.slides[i].iconMode = 'custom';
      } else if (val === 'keep') {
        p.slides[i].iconMode = 'keep';
      } else if (val.indexOf('platform:') === 0) {
        p.slides[i].iconMode = 'platform';
        p.slides[i].platformKey = val.slice('platform:'.length);
      }
      renderSlideList();
    }));

    list.querySelectorAll('[data-action="pick-custom-icon"]').forEach((btn) => btn.addEventListener('click', async (e) => {
      const i = parseInt(e.target.getAttribute('data-i'), 10);
      const path = await invoke('pick_image_file');
      if (!path) return;
      p.slides[i].customAssetPath = path;
      renderSlideList();
    }));

    // Custom-icon thumbnails load async (need a file-read round trip) —
    // fill them in after the list is already on screen.
    list.querySelectorAll('[data-custom-preview]').forEach((el) => {
      const i = parseInt(el.getAttribute('data-custom-preview'), 10);
      const path = p.slides[i] && p.slides[i].customAssetPath;
      if (!path) return;
      invoke('read_binary_file_base64', { path }).then((base64) => {
        const ext = (path.split('.').pop() || 'png').toLowerCase();
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        el.innerHTML = `<img src="data:${mime};base64,${base64}" alt="">`;
      }).catch(() => {
        el.innerHTML = '';
      });
    });
  }

  function renderStructuredMode() {
    contentHost.innerHTML = `
      <div class="field"><label>Slides</label></div>
      <div id="pf-slideList"></div>
      <button class="secondary block" id="pf-addSlide" type="button">+ Add slide</button>
    `;
    renderSlideList();
    document.getElementById('pf-addSlide').addEventListener('click', () => {
      p.slides.push({ tag: '', text: '', iconMode: 'none' });
      renderSlideList();
    });
  }

  function renderPlaintextMode() {
    contentHost.innerHTML = `
      <div class="field">
        <label for="pf-plaintextSlides">Slides (tag, then text, blank line between slides)</label>
        <textarea id="pf-plaintextSlides" rows="8">${escapeHtml(slidesToPlaintext(p.slides))}</textarea>
      </div>
      <div class="hint">Per-slide icons aren't available in plaintext mode — switch to "Per-slide" to set icons. Switching back to plaintext will drop any icons already set on the slides.</div>
    `;
    document.getElementById('pf-plaintextSlides').addEventListener('change', (e) => {
      const parsed = parseSlidesText(e.target.value);
      p.slides = (parsed.length ? parsed : [{ tag: '', text: '' }]).map((s) => ({ tag: s.tag, text: s.text, iconMode: 'none' }));
    });
  }

  function renderContent() {
    if (p.contentMode === 'plaintext') renderPlaintextMode();
    else renderStructuredMode();
  }
  renderContent();

  document.getElementById('pf-contentMode').addEventListener('change', (e) => {
    p.contentMode = e.target.value;
    renderContent();
  });

  const applyGeneral = () => {
    p.transitionStyle = document.getElementById('pf-transitionStyle').value;
    p.perSlideMs = Math.round(parseFloat(document.getElementById('pf-perSlideSeconds').value) * 1000);
    p.pauseMs = Math.round(parseFloat(document.getElementById('pf-pauseSeconds').value) * 1000);
  };
  document.getElementById('pf-transitionStyle').addEventListener('change', applyGeneral);
  document.getElementById('pf-perSlideSeconds').addEventListener('change', applyGeneral);
  document.getElementById('pf-pauseSeconds').addEventListener('change', applyGeneral);
}

function renderChatOverlayProperties(item, body) {
  const p = item.props;
  if (typeof p.multiChatEnabled !== 'boolean') p.multiChatEnabled = false; // tolerate a project saved before this existed

  function entryFor(key) {
    let entry = p.platforms.find((pl) => pl.key === key);
    if (!entry) {
      entry = { key, enabled: false, channelName: '', apiKey: '' }; // tolerate a platform added after this project was saved
      p.platforms.push(entry);
    }
    return entry;
  }

  function platformOptionsHtml(selectedKey, excludeKey, includeEmptyOption) {
    const emptyOption = includeEmptyOption ? `<option value="" ${selectedKey ? '' : 'selected'}>Choose a platform…</option>` : '';
    return emptyOption + visibleChatPlatforms(p.showAdultPlatforms)
      .filter((pl) => pl.key !== excludeKey)
      .map((pl) => {
        const disabledAttr = pl.disabled ? 'disabled' : '';
        const label = pl.disabled ? `${pl.label} (unavailable)` : pl.label;
        const selectedAttr = pl.key === selectedKey ? 'selected' : '';
        return `<option value="${pl.key}" ${disabledAttr} ${selectedAttr}>${escapeHtml(label)}</option>`;
      }).join('');
  }

  function platformFieldsHtml(key, fieldsId) {
    const platform = CHAT_PLATFORMS.find((pl) => pl.key === key);
    if (!platform || platform.disabled) return '';
    const entry = entryFor(key);
    const apiKeyField = platform.needsApiKey ? `
        <div class="field">
          <label>${escapeHtml(platform.label)} API key</label>
          <input type="password" data-slot-field="apiKey" value="${escapeHtml(entry.apiKey || '')}" autocomplete="off" spellcheck="false">
        </div>
        <div class="hint-warn">${escapeHtml(platform.label)} requires a signing service (this app has no way to connect to it directly) — this uses Euler Stream, a third-party API with its own free tier (eulerstream.com). ${escapeHtml(platform.label)} is also known to fingerprint and restrict automated-looking connections more aggressively than Twitch tolerates — a real risk to your own account, worth knowing before connecting a live channel.</div>
    ` : '';
    return `
      <div class="field" data-slot-fields="${fieldsId}">
        <label>${escapeHtml(platform.label)} channel name</label>
        <input type="text" data-slot-field="channelName" value="${escapeHtml(entry.channelName)}">
      </div>
      <div data-slot-fields="${fieldsId}">${apiKeyField}</div>
    `;
  }

  function renderPlatformPicker() {
    ensurePrimarySelected(p);
    const [resolvedPrimary, secondaryKey] = activePlatformKeys(p);

    return `
      <div class="field">
        <label>Chat platform</label>
        <select id="pf-primaryPlatform">${platformOptionsHtml(resolvedPrimary, null)}</select>
      </div>
      <div id="pf-primaryFields">${platformFieldsHtml(resolvedPrimary, 'primary')}</div>
      <div class="field">
        <label><input type="checkbox" id="pf-multiChatEnabled" ${p.multiChatEnabled ? 'checked' : ''}> Using a Multi-Chat or Multi-Streaming?</label>
      </div>
      <div id="pf-secondaryBlock" style="${p.multiChatEnabled ? '' : 'display:none;'}">
        <div class="field">
          <label>Second chat platform</label>
          <select id="pf-secondaryPlatform">${platformOptionsHtml(secondaryKey, resolvedPrimary, true)}</select>
        </div>
        <div id="pf-secondaryFields">${secondaryKey ? platformFieldsHtml(secondaryKey, 'secondary') : ''}</div>
      </div>
    `;
  }

  function wireSlotFields(containerEl, key) {
    containerEl.querySelectorAll('[data-slot-field]').forEach((el) => {
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', (e) => {
        const entry = entryFor(key);
        entry[e.target.getAttribute('data-slot-field')] = e.target.value;
      });
    });
  }

  function wirePlatformPicker() {
    const container = document.getElementById('pf-chatPlatformList');

    const primarySelect = document.getElementById('pf-primaryPlatform');
    wireSlotFields(document.getElementById('pf-primaryFields'), primarySelect.value);
    primarySelect.addEventListener('change', (e) => {
      selectPrimaryPlatform(p, e.target.value);
      container.innerHTML = renderPlatformPicker();
      wirePlatformPicker();
    });

    const multiChatBox = document.getElementById('pf-multiChatEnabled');
    multiChatBox.addEventListener('change', (e) => {
      setMultiChatEnabled(p, e.target.checked);
      container.innerHTML = renderPlatformPicker();
      wirePlatformPicker();
    });

    if (p.multiChatEnabled) {
      const secondarySelect = document.getElementById('pf-secondaryPlatform');
      const secondaryFields = document.getElementById('pf-secondaryFields');
      if (secondaryFields && secondarySelect.value) wireSlotFields(secondaryFields, secondarySelect.value);
      secondarySelect.addEventListener('change', (e) => {
        selectSecondaryPlatform(p, e.target.value); // '' = the "Choose a platform…" placeholder, nothing to activate
        container.innerHTML = renderPlatformPicker();
        wirePlatformPicker();
      });
    }
  }

  body.innerHTML = `
    <div id="pf-chatPlatformList">${renderPlatformPicker()}</div>
    <div class="field">
      <label><input type="checkbox" id="pf-showAdultPlatforms" ${p.showAdultPlatforms ? 'checked' : ''}> Show adult-platform options</label>
    </div>
    <div class="field">
      <label><input type="checkbox" id="pf-ttsEnabled" ${p.ttsEnabled ? 'checked' : ''}> Read messages aloud (TTS)</label>
    </div>
    <div class="field">
      <label>Voice source</label>
      <select id="pf-ttsProvider">
        <option value="browser" ${!p.ttsProvider || p.ttsProvider === 'browser' ? 'selected' : ''}>Free (your Windows/browser voices)</option>
        <option value="polly" ${p.ttsProvider === 'polly' ? 'selected' : ''}>Amazon Polly (bring your own AWS key)</option>
        <option value="kokoro" ${p.ttsProvider === 'kokoro' ? 'selected' : ''}>Local (Kokoro, free &amp; offline, no key)</option>
        <option value="chatterbox" ${p.ttsProvider === 'chatterbox' ? 'selected' : ''}>Local (Chatterbox, free &amp; offline, no key)</option>
      </select>
    </div>
    <div class="field-row">
      <div class="field"><label>Speech rate</label><input type="range" id="pf-ttsRate" min="0.5" max="2" step="0.1" value="${p.ttsRate}"></div>
      <div class="field"><label>Volume</label><input type="range" id="pf-ttsVolume" min="0" max="1" step="0.05" value="${p.ttsVolume}"></div>
    </div>
    <div id="pf-browserVoiceFields">
      <div class="field">
        <label>Voice</label>
        <select id="pf-ttsVoice"></select>
      </div>
    </div>
    <div id="pf-pollyFields">
      <div class="field-row">
        <div class="field"><label>AWS access key ID</label><input type="text" id="pf-pollyAccessKeyId" value="${escapeHtml(p.pollyAccessKeyId)}" autocomplete="off" spellcheck="false"></div>
        <div class="field"><label>AWS secret access key</label><input type="password" id="pf-pollySecretAccessKey" value="${escapeHtml(p.pollySecretAccessKey)}" autocomplete="off" spellcheck="false"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>AWS region</label><input type="text" id="pf-pollyRegion" value="${escapeHtml(p.pollyRegion)}" list="pf-pollyRegionSuggestions" placeholder="us-east-1">
          <datalist id="pf-pollyRegionSuggestions">
            <option value="us-east-1"><option value="us-west-2"><option value="eu-west-1"><option value="eu-central-1"><option value="ap-southeast-2">
          </datalist>
        </div>
        <div class="field"><label>Engine</label>
          <select id="pf-pollyEngine">
            <option value="neural" ${p.pollyEngine !== 'standard' ? 'selected' : ''}>Neural (higher quality)</option>
            <option value="standard" ${p.pollyEngine === 'standard' ? 'selected' : ''}>Standard (wider region support)</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>Polly voice ID</label>
        <input type="text" id="pf-pollyVoiceId" value="${escapeHtml(p.pollyVoiceId)}" list="pf-pollyVoiceSuggestions" placeholder="Joanna">
        <datalist id="pf-pollyVoiceSuggestions">
          ${POLLY_VOICE_SUGGESTIONS.map((v) => `<option value="${v}">`).join('')}
        </datalist>
      </div>
      <div class="hint-warn"><strong>Your AWS keys get embedded in plain text inside the exported scene.html file</strong> (this app has no backend to keep them server-side) — never share, upload, or commit that project's baked output folder. Create a dedicated IAM user scoped to only <code>polly:SynthesizeSpeech</code>, not your root/admin AWS credentials.</div>
    </div>
    <div id="pf-kokoroFields">
      <div class="field">
        <label>Kokoro voice</label>
        <select id="pf-kokoroVoice">
          ${KOKORO_VOICE_OPTIONS.map((v) => `<option value="${v.value}" ${p.kokoroVoice === v.value ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <div id="pf-kokoroStatus" class="hint">Checking local voice service status…</div>
        <div class="field-row">
          <button type="button" id="pf-kokoroDownloadBtn">Download voice model (~110MB, one-time)</button>
          <button type="button" id="pf-kokoroStartBtn">Start local voice service</button>
          <button type="button" id="pf-kokoroStopBtn">Stop</button>
        </div>
        <div id="pf-kokoroProgress" class="hint" style="display:none;"></div>
      </div>
      <div class="hint-warn">The local voice service is a <strong>separate process</strong> from Stream Composer Suite itself — it does NOT close when you close this app, on purpose (so it keeps working while you're live in OBS with the editor closed), and it does NOT start itself automatically. Start it here before going live, and use Stop when you're done streaming if you'd rather not leave it running in the background.</div>
    </div>
    <div id="pf-chatterboxFields">
      <div class="field">
        <div id="pf-chatterboxStatus" class="hint">Checking local voice service status…</div>
        <div class="field-row">
          <button type="button" id="pf-chatterboxDownloadBtn">Download voice engine (~1-3GB, one-time)</button>
          <button type="button" id="pf-chatterboxStartBtn">Start local voice service</button>
          <button type="button" id="pf-chatterboxStopBtn">Stop</button>
        </div>
        <div id="pf-chatterboxProgress" class="hint" style="display:none;"></div>
      </div>
      <div class="hint-warn">Chatterbox is a much larger download than Kokoro (it needs a full Python + PyTorch runtime, not just one small model file) — expect several minutes even on a fast connection. Same separate-process behavior as Kokoro applies: it keeps running after you close this app, and you start/stop it manually here. Both Kokoro and Chatterbox can run at the same time if you want to A/B them directly.</div>
    </div>
    <div class="field">
      <label><input type="checkbox" id="pf-filterCommands" ${p.filterCommands ? 'checked' : ''}> Skip messages starting with "!"</label>
    </div>
    <div class="field">
      <label><input type="checkbox" id="pf-filterEmoteOnly" ${p.filterEmoteOnly ? 'checked' : ''}> Skip emote-only messages (Twitch only for now — Kick's feed doesn't expose emote position data)</label>
    </div>
    <div class="field-row">
      <div class="field"><label>Max visible messages</label><input type="number" id="pf-maxVisibleMessages" min="1" max="10" value="${p.maxVisibleMessages}"></div>
      <div class="field"><label>Message display (sec)</label><input type="number" id="pf-messageDisplaySeconds" min="1" max="60" step="0.5" value="${p.messageDisplayMs / 1000}"></div>
    </div>
    <div class="hint">Chat connections only run in the baked overlay (in OBS) — there's no live preview of real messages here in the editor.</div>
    <div class="hint">After changing these settings and re-baking, OBS keeps showing the old version until you refresh it: right-click the Browser Source → Properties → "Refresh cache of current page".</div>
  `;
  wirePlatformPicker();

  document.getElementById('pf-showAdultPlatforms').addEventListener('change', (e) => {
    p.showAdultPlatforms = e.target.checked;
    document.getElementById('pf-chatPlatformList').innerHTML = renderPlatformPicker();
    wirePlatformPicker();
  });

  // The editor window is Chromium (WebView2), same as the baked overlay, so
  // it has its own real speechSynthesis.getVoices() list to populate this
  // from — no need to guess or hardcode voice names. getVoices() can return
  // empty until the 'voiceschanged' event fires once, so re-populate on it.
  const voiceSelect = document.getElementById('pf-ttsVoice');
  function populateVoiceOptions() {
    const voices = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    const options = ['<option value="">System default</option>']
      .concat(voices.map((v) => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`));
    voiceSelect.innerHTML = options.join('');
    voiceSelect.value = voices.some((v) => v.name === p.ttsVoiceName) ? p.ttsVoiceName : '';
  }
  populateVoiceOptions();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoiceOptions;

  const providerSelect = document.getElementById('pf-ttsProvider');
  const browserFieldsEl = document.getElementById('pf-browserVoiceFields');
  const pollyFieldsEl = document.getElementById('pf-pollyFields');
  const kokoroFieldsEl = document.getElementById('pf-kokoroFields');
  const chatterboxFieldsEl = document.getElementById('pf-chatterboxFields');
  function updateProviderFieldVisibility() {
    const provider = providerSelect.value;
    browserFieldsEl.style.display = provider === 'browser' ? '' : 'none';
    pollyFieldsEl.style.display = provider === 'polly' ? '' : 'none';
    kokoroFieldsEl.style.display = provider === 'kokoro' ? '' : 'none';
    chatterboxFieldsEl.style.display = provider === 'chatterbox' ? '' : 'none';
  }
  updateProviderFieldVisibility();
  providerSelect.addEventListener('change', updateProviderFieldVisibility);

  // ---- Kokoro local voice service controls ----
  // This is the one part of the properties panel that talks to the Rust
  // backend rather than just editing props - the model download and the
  // sidecar process both need real filesystem/process access no baked
  // overlay or editor-frontend-only code could do. See lib.rs's Kokoro
  // section header comment for the full architecture.
  const kokoroStatusEl = document.getElementById('pf-kokoroStatus');
  const kokoroProgressEl = document.getElementById('pf-kokoroProgress');
  const kokoroDownloadBtn = document.getElementById('pf-kokoroDownloadBtn');
  const kokoroStartBtn = document.getElementById('pf-kokoroStartBtn');
  const kokoroStopBtn = document.getElementById('pf-kokoroStopBtn');

  async function refreshKokoroStatus() {
    try {
      const hasModel = await invoke('kokoro_model_status');
      kokoroStatusEl.textContent = hasModel
        ? 'Voice model downloaded. Click "Start local voice service" before going live.'
        : 'Voice model not downloaded yet - click Download below (one-time, ~110MB).';
      kokoroDownloadBtn.disabled = hasModel;
      kokoroStartBtn.disabled = !hasModel;
    } catch (e) {
      kokoroStatusEl.textContent = 'Could not check local voice service status: ' + e;
    }
  }
  refreshKokoroStatus();

  kokoroDownloadBtn.addEventListener('click', async () => {
    kokoroDownloadBtn.disabled = true;
    kokoroProgressEl.style.display = '';
    kokoroProgressEl.textContent = 'Starting download…';
    const unlisten = await window.__TAURI__.event.listen('kokoro-download-progress', (event) => {
      const { index, total, file } = event.payload;
      kokoroProgressEl.textContent = 'Downloading voice files: ' + (index + 1) + ' / ' + total + ' (' + file + ')';
    });
    try {
      await invoke('kokoro_download_model');
      kokoroProgressEl.textContent = 'Download complete.';
    } catch (e) {
      kokoroProgressEl.textContent = 'Download failed: ' + e;
      kokoroDownloadBtn.disabled = false;
    } finally {
      unlisten();
      await refreshKokoroStatus();
    }
  });

  kokoroStartBtn.addEventListener('click', async () => {
    try {
      await invoke('kokoro_start');
      kokoroStatusEl.textContent = 'Local voice service is running on 127.0.0.1:5757.';
    } catch (e) {
      kokoroStatusEl.textContent = 'Could not start the local voice service: ' + e;
    }
  });

  kokoroStopBtn.addEventListener('click', async () => {
    try {
      await invoke('kokoro_stop');
      kokoroStatusEl.textContent = 'Local voice service stopped.';
    } catch (e) {
      kokoroStatusEl.textContent = 'Could not stop the local voice service: ' + e;
    }
  });

  // ---- Chatterbox local voice service controls ----
  // Same pattern as Kokoro's controls above, just a much heavier download
  // (a portable Python + PyTorch + the model, not one small binary) - see
  // lib.rs's Chatterbox section header comment for the full architecture.
  const chatterboxStatusEl = document.getElementById('pf-chatterboxStatus');
  const chatterboxProgressEl = document.getElementById('pf-chatterboxProgress');
  const chatterboxDownloadBtn = document.getElementById('pf-chatterboxDownloadBtn');
  const chatterboxStartBtn = document.getElementById('pf-chatterboxStartBtn');
  const chatterboxStopBtn = document.getElementById('pf-chatterboxStopBtn');

  async function refreshChatterboxStatus() {
    try {
      const hasModel = await invoke('chatterbox_model_status');
      chatterboxStatusEl.textContent = hasModel
        ? 'Voice engine downloaded. Click "Start local voice service" before going live.'
        : 'Voice engine not downloaded yet - click Download below (one-time, ~1-3GB, several minutes).';
      chatterboxDownloadBtn.disabled = hasModel;
      chatterboxStartBtn.disabled = !hasModel;
    } catch (e) {
      chatterboxStatusEl.textContent = 'Could not check local voice service status: ' + e;
    }
  }
  refreshChatterboxStatus();

  chatterboxDownloadBtn.addEventListener('click', async () => {
    chatterboxDownloadBtn.disabled = true;
    chatterboxProgressEl.style.display = '';
    chatterboxProgressEl.textContent = 'Starting download…';
    const unlisten = await window.__TAURI__.event.listen('chatterbox-download-progress', (event) => {
      chatterboxProgressEl.textContent = event.payload.stage;
    });
    try {
      await invoke('chatterbox_download_model');
      chatterboxProgressEl.textContent = 'Download complete.';
    } catch (e) {
      chatterboxProgressEl.textContent = 'Download failed: ' + e;
      chatterboxDownloadBtn.disabled = false;
    } finally {
      unlisten();
      await refreshChatterboxStatus();
    }
  });

  chatterboxStartBtn.addEventListener('click', async () => {
    try {
      await invoke('chatterbox_start');
      chatterboxStatusEl.textContent = 'Local voice service is running on 127.0.0.1:5758. First request after starting may be slow while the model loads.';
    } catch (e) {
      chatterboxStatusEl.textContent = 'Could not start the local voice service: ' + e;
    }
  });

  chatterboxStopBtn.addEventListener('click', async () => {
    try {
      await invoke('chatterbox_stop');
      chatterboxStatusEl.textContent = 'Local voice service stopped.';
    } catch (e) {
      chatterboxStatusEl.textContent = 'Could not stop the local voice service: ' + e;
    }
  });

  const applyGeneral = () => {
    p.ttsEnabled = document.getElementById('pf-ttsEnabled').checked;
    p.ttsProvider = providerSelect.value;
    p.ttsRate = parseFloat(document.getElementById('pf-ttsRate').value) || 1;
    p.ttsVolume = parseFloat(document.getElementById('pf-ttsVolume').value);
    if (Number.isNaN(p.ttsVolume)) p.ttsVolume = 1;
    p.ttsVoiceName = voiceSelect.value;
    p.pollyAccessKeyId = document.getElementById('pf-pollyAccessKeyId').value.trim();
    p.pollySecretAccessKey = document.getElementById('pf-pollySecretAccessKey').value.trim();
    p.pollyRegion = document.getElementById('pf-pollyRegion').value.trim() || 'us-east-1';
    p.pollyVoiceId = document.getElementById('pf-pollyVoiceId').value.trim() || 'Joanna';
    p.pollyEngine = document.getElementById('pf-pollyEngine').value;
    p.kokoroVoice = document.getElementById('pf-kokoroVoice').value;
    p.filterCommands = document.getElementById('pf-filterCommands').checked;
    p.filterEmoteOnly = document.getElementById('pf-filterEmoteOnly').checked;
    p.maxVisibleMessages = parseInt(document.getElementById('pf-maxVisibleMessages').value, 10) || 3;
    p.messageDisplayMs = Math.round((parseFloat(document.getElementById('pf-messageDisplaySeconds').value) || 6) * 1000);
  };
  [
    'pf-ttsEnabled', 'pf-ttsProvider', 'pf-ttsRate', 'pf-ttsVolume', 'pf-ttsVoice',
    'pf-pollyAccessKeyId', 'pf-pollySecretAccessKey', 'pf-pollyRegion', 'pf-pollyVoiceId', 'pf-pollyEngine',
    'pf-kokoroVoice',
    'pf-filterCommands', 'pf-filterEmoteOnly', 'pf-maxVisibleMessages', 'pf-messageDisplaySeconds',
  ].forEach((id) => document.getElementById(id).addEventListener('change', applyGeneral));
}

function renderCountdownTimerProperties(item, body) {
  const p = item.props;

  body.innerHTML = `
    <div class="field">
      <label for="pf-targetDateTime">Counts down to</label>
      <input type="datetime-local" id="pf-targetDateTime" value="${escapeHtml(p.targetDateTime)}">
    </div>
    <div class="field">
      <label for="pf-label">Label (shown above the countdown)</label>
      <input type="text" id="pf-label" value="${escapeHtml(p.label)}">
    </div>
    <div class="field">
      <label for="pf-completedText">Text shown once it reaches zero</label>
      <input type="text" id="pf-completedText" value="${escapeHtml(p.completedText)}">
    </div>
    <div class="field">
      <label><input type="checkbox" id="pf-showDays" ${p.showDays ? 'checked' : ''}> Show a separate "days" segment</label>
      <div class="hint">When off, days are folded into the hours figure instead of being dropped (e.g. 2 days becomes "48" hours).</div>
    </div>
    <div class="field-row">
      <div class="field"><label>Text color</label><input type="color" id="pf-fontColor" value="${p.fontColor}"></div>
      <div class="field"><label>Number color</label><input type="color" id="pf-accentColor" value="${p.accentColor}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Background color</label><input type="color" id="pf-backgroundColor" value="${p.backgroundColor}"></div>
      <div class="field"><label>Background opacity (<span id="pf-backgroundOpacityValue">${Math.round(p.backgroundOpacity * 100)}</span>%)</label><input type="range" id="pf-backgroundOpacity" min="0" max="100" step="1" value="${Math.round(p.backgroundOpacity * 100)}"></div>
    </div>
    <div class="hint">Ticks down live in the baked output — there's no live preview here in the editor, same as the Chat + TTS Overlay and Popup Slide items.</div>
  `;

  const applyGeneral = () => {
    p.targetDateTime = document.getElementById('pf-targetDateTime').value;
    p.label = document.getElementById('pf-label').value;
    p.completedText = document.getElementById('pf-completedText').value;
    p.showDays = document.getElementById('pf-showDays').checked;
    p.fontColor = document.getElementById('pf-fontColor').value;
    p.accentColor = document.getElementById('pf-accentColor').value;
    p.backgroundColor = document.getElementById('pf-backgroundColor').value;
    p.backgroundOpacity = parseInt(document.getElementById('pf-backgroundOpacity').value, 10) / 100;
    document.getElementById('pf-backgroundOpacityValue').textContent = document.getElementById('pf-backgroundOpacity').value;
  };
  ['pf-targetDateTime', 'pf-label', 'pf-completedText', 'pf-showDays', 'pf-fontColor', 'pf-accentColor', 'pf-backgroundColor', 'pf-backgroundOpacity']
    .forEach((id) => document.getElementById(id).addEventListener('input', applyGeneral));
}

const PNGTUBER_STYLE_LABELS = {
  swap: 'Image Swap (idle / talking)',
  bounce: 'Bounce / Bob',
  brightness: 'Brightness Pulse (lighten when talking)',
  mouthFlap: 'Mouth Flap (body + mouth cutout)',
};

function pngtuberImagePicker(fieldId, label, pathValue, btnId) {
  return `
    <div class="field"><label>${label}</label>
      <div class="hint">${escapeHtml(pathValue || 'No image chosen yet')}</div>
    </div>
    <button class="secondary block" id="${btnId}" type="button">Choose image…</button>
  `;
}

function renderPngtuberProperties(item, body) {
  const p = item.props;
  const style = p.style || 'swap';

  let stylePropsHtml = '';
  if (style === 'swap') {
    stylePropsHtml =
      pngtuberImagePicker('idle', 'Idle image (shown when quiet)', p.idleImagePath, 'pf-pickIdleImage') +
      pngtuberImagePicker('talking', "Talking image (shown while you're speaking)", p.talkingImagePath, 'pf-pickTalkingImage');
  } else if (style === 'bounce' || style === 'brightness') {
    stylePropsHtml = pngtuberImagePicker('idle', 'Character image', p.idleImagePath, 'pf-pickIdleImage');
  } else if (style === 'mouthFlap') {
    stylePropsHtml = `
      ${pngtuberImagePicker('body', "Body image (always visible)", p.bodyImagePath, 'pf-pickBodyImage')}
      ${pngtuberImagePicker('mouthOpen', 'Mouth — open', p.mouthOpenImagePath, 'pf-pickMouthOpenImage')}
      ${pngtuberImagePicker('mouthClosed', 'Mouth — closed', p.mouthClosedImagePath, 'pf-pickMouthClosedImage')}
      <div class="field">
        <label>Mouth width (<span id="pf-mouthWidthValue">${p.mouthWidthPercent ?? 30}</span>% of stage)</label>
        <input type="range" id="pf-mouthWidthPercent" min="5" max="80" step="1" value="${p.mouthWidthPercent ?? 30}">
      </div>
      <div class="field">
        <label>Mouth position — horizontal (<span id="pf-mouthLeftValue">${p.mouthLeftPercent ?? 50}</span>% from left)</label>
        <input type="range" id="pf-mouthLeftPercent" min="0" max="100" step="1" value="${p.mouthLeftPercent ?? 50}">
      </div>
      <div class="field">
        <label>Mouth position — vertical (<span id="pf-mouthTopValue">${p.mouthTopPercent ?? 55}</span>% from top)</label>
        <input type="range" id="pf-mouthTopPercent" min="0" max="100" step="1" value="${p.mouthTopPercent ?? 55}">
        <div class="hint">Line these up against your body image — a face's mouth usually sits somewhere around 50-70% down from the top.</div>
      </div>
      <div class="field">
        <label>Flap speed (<span id="pf-flapIntervalValue">${p.flapIntervalMs ?? 120}</span>ms per toggle)</label>
        <input type="range" id="pf-flapIntervalMs" min="60" max="400" step="10" value="${p.flapIntervalMs ?? 120}">
        <div class="hint">Lower = faster, more chattery flapping. Higher = slower, more deliberate.</div>
      </div>
    `;
  }

  body.innerHTML = `
    <div class="field">
      <label>Animation style</label>
      <select id="pf-pngtuberStyle">
        ${Object.entries(PNGTUBER_STYLE_LABELS).map(([key, label]) => `<option value="${key}" ${style === key ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>
    ${stylePropsHtml}
    <div class="field">
      <label>Mic sensitivity (<span id="pf-micThresholdValue">${p.micThreshold}</span>%)</label>
      <input type="range" id="pf-micThreshold" min="1" max="80" step="1" value="${p.micThreshold}">
      <div class="hint">Lower = reacts more easily (picks up quieter sounds). Raise this if it's triggering on background noise or your mic's natural hiss.</div>
    </div>
    <div class="field">
      <label>Hold time after you stop talking (ms)</label>
      <input type="number" id="pf-holdMs" min="0" max="2000" step="50" value="${p.holdMs}">
      <div class="hint">Keeps the talking reaction up briefly through short pauses (like mid-sentence breaths) instead of flickering back to idle on every gap.</div>
    </div>
    <div class="hint">Reacts to your live microphone only in the baked output (in OBS) — there's no live preview here in the editor. The first time this loads in OBS, you'll need to grant it microphone access: right-click the Browser Source → Interact → allow the microphone prompt, then refresh.</div>
  `;

  document.getElementById('pf-pngtuberStyle').addEventListener('change', (e) => {
    p.style = e.target.value;
    renderPropertiesPanel();
  });

  const wireImagePicker = (btnId, propKey) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const path = await invoke('pick_image_file');
      if (!path) return;
      p[propKey] = path;
      renderPropertiesPanel();
    });
  };
  wireImagePicker('pf-pickIdleImage', 'idleImagePath');
  wireImagePicker('pf-pickTalkingImage', 'talkingImagePath');
  wireImagePicker('pf-pickBodyImage', 'bodyImagePath');
  wireImagePicker('pf-pickMouthOpenImage', 'mouthOpenImagePath');
  wireImagePicker('pf-pickMouthClosedImage', 'mouthClosedImagePath');

  const applyGeneral = () => {
    p.micThreshold = parseInt(document.getElementById('pf-micThreshold').value, 10) || 15;
    p.holdMs = parseInt(document.getElementById('pf-holdMs').value, 10) || 0;
    document.getElementById('pf-micThresholdValue').textContent = document.getElementById('pf-micThreshold').value;
    if (style === 'mouthFlap') {
      p.mouthWidthPercent = parseInt(document.getElementById('pf-mouthWidthPercent').value, 10) || 30;
      p.mouthLeftPercent = parseInt(document.getElementById('pf-mouthLeftPercent').value, 10) || 50;
      p.mouthTopPercent = parseInt(document.getElementById('pf-mouthTopPercent').value, 10) || 55;
      p.flapIntervalMs = parseInt(document.getElementById('pf-flapIntervalMs').value, 10) || 120;
      document.getElementById('pf-mouthWidthValue').textContent = document.getElementById('pf-mouthWidthPercent').value;
      document.getElementById('pf-mouthLeftValue').textContent = document.getElementById('pf-mouthLeftPercent').value;
      document.getElementById('pf-mouthTopValue').textContent = document.getElementById('pf-mouthTopPercent').value;
      document.getElementById('pf-flapIntervalValue').textContent = document.getElementById('pf-flapIntervalMs').value;
    }
  };
  const generalIds = ['pf-micThreshold', 'pf-holdMs'];
  if (style === 'mouthFlap') generalIds.push('pf-mouthWidthPercent', 'pf-mouthLeftPercent', 'pf-mouthTopPercent', 'pf-flapIntervalMs');
  generalIds.forEach((id) => document.getElementById(id).addEventListener('input', applyGeneral));
}

function renderViewerPetProperties(item, body) {
  const p = item.props;

  body.innerHTML = `
    <div class="field"><label>Pet image</label>
      <div class="hint">${escapeHtml(p.petImagePath || 'No image chosen yet')}</div>
    </div>
    <button class="secondary block" id="pf-pickPetImage" type="button">Choose pet image…</button>
    <div class="field">
      <label>Chat platform</label>
      <select id="pf-petPlatform">
        <option value="twitch" ${p.platformKey !== 'kick' ? 'selected' : ''}>Twitch</option>
        <option value="kick" ${p.platformKey === 'kick' ? 'selected' : ''}>Kick</option>
      </select>
      <div class="hint">TikTok isn't supported for Viewer Pets yet — Twitch and Kick only for now.</div>
    </div>
    <div class="field">
      <label>Channel name</label>
      <input type="text" id="pf-petChannelName" value="${escapeHtml(p.channelName)}">
    </div>
    <div class="hint">Bounces once for every real chat message on the connected platform — only reacts in the baked output (in OBS), there's no live preview here in the editor.</div>
  `;

  document.getElementById('pf-pickPetImage').addEventListener('click', async () => {
    const path = await invoke('pick_image_file');
    if (!path) return;
    p.petImagePath = path;
    renderPropertiesPanel();
  });

  const applyGeneral = () => {
    p.platformKey = document.getElementById('pf-petPlatform').value;
    p.channelName = document.getElementById('pf-petChannelName').value;
  };
  ['pf-petPlatform', 'pf-petChannelName'].forEach((id) => document.getElementById(id).addEventListener('input', applyGeneral));
}

function renderPetRosterProperties(item, body) {
  const p = item.props;

  body.innerHTML = `
    <div class="field"><label>Pet image (shared by every chatter's pet)</label>
      <div class="hint">${escapeHtml(p.petImagePath || 'No image chosen yet')}</div>
    </div>
    <button class="secondary block" id="pf-pickRosterImage" type="button">Choose pet image…</button>
    <div class="field">
      <label>Chat platform</label>
      <select id="pf-rosterPlatform">
        <option value="twitch" ${p.platformKey !== 'kick' ? 'selected' : ''}>Twitch</option>
        <option value="kick" ${p.platformKey === 'kick' ? 'selected' : ''}>Kick</option>
      </select>
      <div class="hint">TikTok isn't supported here yet — Twitch and Kick only for now.</div>
    </div>
    <div class="field">
      <label>Channel name</label>
      <input type="text" id="pf-rosterChannelName" value="${escapeHtml(p.channelName)}">
    </div>
    <div class="field">
      <label>Max pets on screen at once (<span id="pf-maxPetsValue">${p.maxPets ?? 6}</span>)</label>
      <input type="range" id="pf-maxPets" min="1" max="20" step="1" value="${p.maxPets ?? 6}">
      <div class="hint">The most-recently-active chatters get a pet. Once this many are on screen, a new chatter's pet replaces whoever's been quietest longest.</div>
    </div>
    <div class="hint">One pet per active chatter, each wandering freely and bouncing when its own chatter sends a message — only reacts in the baked output (in OBS), there's no live preview here in the editor.</div>
  `;

  document.getElementById('pf-pickRosterImage').addEventListener('click', async () => {
    const path = await invoke('pick_image_file');
    if (!path) return;
    p.petImagePath = path;
    renderPropertiesPanel();
  });

  const applyGeneral = () => {
    p.platformKey = document.getElementById('pf-rosterPlatform').value;
    p.channelName = document.getElementById('pf-rosterChannelName').value;
    p.maxPets = parseInt(document.getElementById('pf-maxPets').value, 10) || 6;
    document.getElementById('pf-maxPetsValue').textContent = document.getElementById('pf-maxPets').value;
  };
  ['pf-rosterPlatform', 'pf-rosterChannelName', 'pf-maxPets'].forEach((id) => document.getElementById(id).addEventListener('input', applyGeneral));
}

function renderNowPlayingProperties(item, body) {
  const p = item.props;

  body.innerHTML = `
    <div class="field">
      <label>Refresh interval (<span id="pf-npRefreshValue">${p.refreshIntervalMs ?? 2000}</span>ms)</label>
      <input type="range" id="pf-npRefresh" min="500" max="10000" step="250" value="${p.refreshIntervalMs ?? 2000}">
      <div class="hint">How often it re-checks what's playing. Lower feels snappier when tracks change; higher is gentler on your system.</div>
    </div>
    <div class="field">
      <label><input type="checkbox" id="pf-npShowAlbum" ${p.showAlbum !== false ? 'checked' : ''}> Show album name</label>
    </div>
    <div class="hint">Shows whatever's currently playing on this PC — Spotify, a YouTube Music tab, Apple Music, anything Windows itself tracks as "now playing." No account, login, or API key needed. Automatically hides itself when nothing's playing.</div>
    <div class="hint"><strong>Only works while Stream Composer Suite is running on this PC</strong> (it can be minimized) — closing the app fully stops this from updating, same as the local TTS engines.</div>
  `;

  const applyGeneral = () => {
    p.refreshIntervalMs = parseInt(document.getElementById('pf-npRefresh').value, 10) || 2000;
    p.showAlbum = document.getElementById('pf-npShowAlbum').checked;
    document.getElementById('pf-npRefreshValue').textContent = document.getElementById('pf-npRefresh').value;
  };
  ['pf-npRefresh', 'pf-npShowAlbum'].forEach((id) => document.getElementById(id).addEventListener('input', applyGeneral));
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- BAKE -----------------------------------------------------------------
// project.lastBakeFolder remembers where this project was last baked to
// (part of the saved project.json, so it survives close/reopen), so a
// repeat bake — the common case while iterating on a design — doesn't
// need to re-pick the same folder every time. bakeNewFolderBtn is the
// escape hatch for baking somewhere else instead.
let lastBakeInfo = null; // { path, width, height } for the "copy instructions" action

async function copyAssetsAndBuildScene(outputFolder, projectOverride) {
  const targetProject = projectOverride || project;
  const assetCopies = collectAssetCopies(targetProject);
  const assetPathsById = {};
  for (const copy of assetCopies) {
    const base64 = await invoke('read_binary_file_base64', { path: copy.sourcePath });
    const destPath = joinPath(outputFolder, copy.destRelativePath.replace(/\//g, sepFor(outputFolder)));
    await invoke('write_binary_file', { path: destPath, base64Data: base64 });
    assetPathsById[copy.itemId] = copy.destRelativePath;
  }
  return buildSceneHtml(targetProject, assetPathsById);
}

function updateBakeButtonLabels() {
  const hasLastFolder = !!(project && project.lastBakeFolder);
  els.bakeBtn.textContent = hasLastFolder ? 'Bake (same folder as last time)…' : 'Bake Browser Source…';
  els.bakeNewFolderBtn.hidden = !hasLastFolder;
}

// Strips characters Windows/macOS/Linux all disallow in filenames, so
// whatever the user types is always a safe "<name>.html" — falls back to
// "scene" if that leaves nothing usable.
function sanitizeSceneName(name) {
  const cleaned = (name || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 80);
  return cleaned || 'scene';
}

// Only shown when a bake is about to pick a NEW output folder (first bake,
// or "Bake to new folder…") — resolves to null if the user cancels, which
// aborts the bake entirely rather than baking with a stale/empty name.
function promptSceneName(defaultName) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('bakeSceneNameDialog');
    const input = document.getElementById('bakeSceneNameInput');
    const confirmBtn = document.getElementById('bakeSceneNameConfirmBtn');
    const cancelBtn = document.getElementById('bakeSceneNameCancelBtn');
    input.value = defaultName;

    function cleanup() {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
    }
    function onConfirm() {
      cleanup();
      dialog.close();
      resolve(input.value);
    }
    function onCancel() {
      cleanup();
      dialog.close();
      resolve(null);
    }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onCancel); // Esc key closes <dialog>, fires 'cancel'

    dialog.showModal();
    input.focus();
    input.select();
  });
}

async function bakeProject(forceNewFolder) {
  if (!project || !projectFolder) return;

  let outputFolder = !forceNewFolder && project.lastBakeFolder ? project.lastBakeFolder : null;
  const isNewFolderPick = !outputFolder;
  if (!outputFolder) {
    outputFolder = await invoke('pick_project_folder');
    if (!outputFolder) return;
  }

  let sceneName = project.sceneName || 'scene';
  if (isNewFolderPick) {
    const typed = await promptSceneName(sceneName);
    if (typed === null) return; // user cancelled naming — abort the bake, don't write anything
    sceneName = sanitizeSceneName(typed);
  }

  let html;
  try {
    html = await copyAssetsAndBuildScene(outputFolder);
  } catch (err) {
    setStatus('Couldn\'t copy an image asset while baking: ' + err, 'err');
    return;
  }

  const scenePath = joinPath(outputFolder, sceneName + '.html');
  await invoke('write_text_file', { path: scenePath, contents: html });

  project.lastBakeFolder = outputFolder;
  project.sceneName = sceneName;
  await saveProject();
  updateBakeButtonLabels();

  lastBakeInfo = { path: scenePath, width: project.canvasWidth, height: project.canvasHeight };
  els.bakeResultActions.hidden = false;

  setStatus('Baked to ' + scenePath + ' — add this as an OBS Browser Source, ' +
    project.canvasWidth + 'x' + project.canvasHeight + '.', 'ok');
}

function obsSetupInstructions() {
  if (!lastBakeInfo) return '';
  return `OBS Browser Source setup:\n` +
    `1. Add a "Browser Source"\n` +
    `2. Check "Local file" and browse to:\n   ${lastBakeInfo.path}\n` +
    `3. Set Width = ${lastBakeInfo.width}, Height = ${lastBakeInfo.height}\n` +
    `4. Leave "Shutdown source when not visible" unchecked`;
}

// ---- SINGLE-ITEM PREVIEW ----------------------------------------------------
// Lets a popup-slide item be checked in a real browser without doing a
// full Bake first (which writes into the project folder and copies every
// asset) — builds a synthetic one-item project through the same
// buildSceneHtml() bake.js already uses, writes it to a temp file next to
// the project, and opens it via the same cache-busted preview_overlay
// trick the standalone Popup Slide Editor used to prove out.
async function previewItem(item) {
  if (!projectFolder) return;
  // Writes into a dedicated .preview/ subfolder, never into the real
  // bake output folder — previewing shouldn't touch or pollute a real
  // Bake's assets/scene.html.
  const previewFolder = joinPath(projectFolder, '.preview');
  const syntheticProject = { canvasWidth: item.width, canvasHeight: item.height, items: [{ ...item, x: 0, y: 0 }] };
  let html;
  try {
    html = await copyAssetsAndBuildScene(previewFolder, syntheticProject);
  } catch (err) {
    setStatus('Couldn\'t prepare the preview: ' + err, 'err');
    return;
  }
  const previewPath = joinPath(previewFolder, 'preview-' + item.id + '.html');
  try {
    await invoke('write_text_file', { path: previewPath, contents: html });
    const url = pathToFileUrl(previewPath) + '?t=' + Date.now();
    await invoke('preview_overlay', { url });
  } catch (err) {
    setStatus('Couldn\'t open the preview: ' + err, 'err');
  }
}

function pathToFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : '/' + normalized;
  return 'file://' + encodeURI(withLeadingSlash);
}

function sepFor(folder) {
  return folder.includes('\\') ? '\\' : '/';
}

// ---- NEW PROJECT DIALOG -----------------------------------------------------
function wireNewProjectDialog() {
  const dialog = document.getElementById('newProjectDialog');
  const preset = document.getElementById('resolutionPreset');
  const customRow = document.getElementById('customResolutionRow');

  els.newProjectBtn.addEventListener('click', () => {
    pendingLegacyImport = null; // starting a blank project cancels any pending import
    dialog.showModal();
  });
  document.getElementById('cancelNewProjectBtn').addEventListener('click', () => {
    pendingLegacyImport = null;
    dialog.close();
  });

  preset.addEventListener('change', () => {
    customRow.hidden = preset.value !== 'custom';
  });

  document.getElementById('createProjectBtn').addEventListener('click', async () => {
    let width, height;
    if (preset.value === 'custom') {
      width = parseInt(document.getElementById('customWidth').value, 10);
      height = parseInt(document.getElementById('customHeight').value, 10);
    } else {
      [width, height] = preset.value.split('x').map((n) => parseInt(n, 10));
    }
    dialog.close();
    if (pendingLegacyImport) {
      const importedProps = pendingLegacyImport;
      pendingLegacyImport = null;
      await createProjectFromImport(width, height, importedProps);
    } else {
      await createProject(width, height);
    }
  });
}

// ---- STARTER KIT DIALOG -----------------------------------------------------
function wireStarterKitDialog() {
  const dialog = document.getElementById('starterKitDialog');
  const listEl = document.getElementById('starterTemplateList');
  const createBtn = document.getElementById('createStarterProjectBtn');

  listEl.innerHTML = STARTER_TEMPLATES.map((t) => `
    <label class="starter-template-option">
      <input type="checkbox" class="starterTemplateCheck" value="${t.key}">
      <span><strong>${t.label}</strong><div class="hint">${t.description}</div></span>
    </label>
  `).join('');
  const checkboxes = () => Array.from(listEl.querySelectorAll('.starterTemplateCheck'));

  function updateCreateEnabled() {
    createBtn.disabled = !checkboxes().some((c) => c.checked);
  }
  checkboxes().forEach((c) => c.addEventListener('change', updateCreateEnabled));

  document.getElementById('starterSelectAllBtn').addEventListener('click', () => {
    checkboxes().forEach((c) => (c.checked = true));
    updateCreateEnabled();
  });
  document.getElementById('starterSelectNoneBtn').addEventListener('click', () => {
    checkboxes().forEach((c) => (c.checked = false));
    updateCreateEnabled();
  });

  const personalizeToggle = document.getElementById('starterPersonalizeToggle');
  const personalizeFields = document.getElementById('starterPersonalizeFields');
  personalizeToggle.addEventListener('change', () => {
    personalizeFields.style.display = personalizeToggle.checked ? '' : 'none';
  });

  els.starterKitBtn.addEventListener('click', () => {
    checkboxes().forEach((c, i) => (c.checked = i === 0)); // default: first template only, like the old single-select
    updateCreateEnabled();
    personalizeToggle.checked = false;
    personalizeFields.style.display = 'none';
    document.getElementById('starterAccentColor').value = '#7c5cff';
    document.getElementById('starterSiteText').value = '';
    document.getElementById('starterSocialText').value = '';
    dialog.showModal();
  });
  document.getElementById('cancelStarterKitBtn').addEventListener('click', () => dialog.close());

  createBtn.addEventListener('click', async () => {
    const pickedKeys = new Set(checkboxes().filter((c) => c.checked).map((c) => c.value));
    const templates = STARTER_TEMPLATES.filter((t) => pickedKeys.has(t.key));
    if (templates.length === 0) return;
    const personalization = personalizeToggle.checked ? {
      accentColor: document.getElementById('starterAccentColor').value,
      siteText: document.getElementById('starterSiteText').value.trim(),
      socialText: document.getElementById('starterSocialText').value.trim(),
    } : null;
    dialog.close();
    await createProjectFromTemplates(templates, personalization);
  });
}

// ---- STINGER BUILDER DIALOG -------------------------------------------------
// A standalone tool, not tied to any open project — a stinger has no x/y
// position on the stream canvas, it's an exportable clip. See
// stinger-templates.js/stinger-render.js/stinger-export.js for the actual
// animation/encoding logic; this is just the dialog's DOM wiring.
let stingerProps = null;
let stingerLogoImage = null; // HTMLImageElement, or null if none picked yet
let stingerAnimHandle = null;
let stingerAnimStartTime = null;
let stingerScrubbing = false;

function currentStingerTemplate() {
  const key = document.getElementById('stingerTemplate').value;
  return STINGER_TEMPLATES.find((t) => t.key === key) || STINGER_TEMPLATES[0];
}

function stingerExportMode() {
  return document.querySelector('input[name="stingerExportMode"]:checked').value;
}

function stingerBackground() {
  return stingerExportMode() === 'alpha' ? null : document.getElementById('stingerKeyColor').value;
}

function drawStingerPreviewFrame(tMs) {
  const canvas = document.getElementById('stingerPreviewCanvas');
  const ctx = canvas.getContext('2d');
  const template = currentStingerTemplate();
  const frameData = template.renderFrame(tMs, stingerProps.durationMs, stingerProps);
  renderStingerFrame(ctx, frameData, { logo: stingerLogoImage }, stingerBackground());
}

function stingerAnimLoop(now) {
  if (stingerAnimStartTime === null) stingerAnimStartTime = now;
  if (!stingerScrubbing) {
    const elapsed = (now - stingerAnimStartTime) % stingerProps.durationMs;
    document.getElementById('stingerScrub').value = String(Math.round((elapsed / stingerProps.durationMs) * 1000));
    drawStingerPreviewFrame(elapsed);
  }
  stingerAnimHandle = requestAnimationFrame(stingerAnimLoop);
}

// Recomputes logoWidth/logoHeight from the current "Logo size" slider
// percentage, the canvas height, and the picked image's own aspect ratio
// (or a square placeholder if none picked yet). Called whenever any of
// those three inputs change — resolution, the slider, or the logo image.
function recalcStingerLogoSize() {
  const aspect = stingerLogoImage ? stingerLogoImage.naturalWidth / stingerLogoImage.naturalHeight : 1;
  stingerProps.logoHeight = Math.round(stingerProps.canvasHeight * (stingerProps.logoScalePercent / 100));
  stingerProps.logoWidth = Math.round(stingerProps.logoHeight * aspect);
}

async function resizeStingerCanvas() {
  const [width, height] = document.getElementById('stingerResolution').value.split('x').map((n) => parseInt(n, 10));
  stingerProps.canvasWidth = width;
  stingerProps.canvasHeight = height;
  recalcStingerLogoSize();

  const canvas = document.getElementById('stingerPreviewCanvas');
  canvas.width = width;
  canvas.height = height;

  const alphaOk = await checkAlphaSupport(width, height).catch(() => false);
  document.getElementById('stingerModeAlpha').disabled = !alphaOk;
  if (!alphaOk && stingerExportMode() === 'alpha') {
    document.getElementById('stingerModeChromakey').checked = true;
    document.getElementById('stingerKeyColorField').hidden = false;
  }
}

async function openStingerBuilderDialog() {
  stingerProps = defaultStingerProps();
  stingerLogoImage = null;
  stingerScrubbing = false;
  stingerAnimStartTime = null;

  const templateSelect = document.getElementById('stingerTemplate');
  templateSelect.innerHTML = STINGER_TEMPLATES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('');
  document.getElementById('stingerTemplateDescription').textContent = STINGER_TEMPLATES[0].description;

  document.getElementById('stingerDuration').value = String(stingerProps.durationMs / 1000);
  document.getElementById('stingerResolution').value = '1920x1080';
  document.getElementById('stingerPrimaryColor').value = stingerProps.primaryColor;
  document.getElementById('stingerKeyColor').value = stingerProps.keyColor;
  document.getElementById('stingerModeChromakey').checked = true;
  document.getElementById('stingerKeyColorField').hidden = false;
  document.getElementById('stingerLogoStatus').textContent = 'No image chosen yet — the animation will still preview, just without a logo.';
  document.getElementById('stingerExportStatus').textContent = '';
  document.getElementById('stingerLogoScale').value = String(stingerProps.logoScalePercent);
  document.getElementById('stingerLogoScaleValue').textContent = String(stingerProps.logoScalePercent);

  await resizeStingerCanvas();

  document.getElementById('stingerBuilderDialog').showModal();
  stingerAnimHandle = requestAnimationFrame(stingerAnimLoop);
}

function closeStingerBuilderDialog() {
  if (stingerAnimHandle) cancelAnimationFrame(stingerAnimHandle);
  stingerAnimHandle = null;
  document.getElementById('stingerBuilderDialog').close();
}

// Converts a (potentially several-MB) video ArrayBuffer to base64 without
// spreading it into String.fromCharCode's argument list all at once —
// that would blow the call stack on anything but a tiny file. Chunking
// keeps each String.fromCharCode.apply call well under the argument-count
// limit.
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function exportStingerNow() {
  const statusEl = document.getElementById('stingerExportStatus');
  const outputPath = await invoke('pick_project_folder');
  if (!outputPath) return;

  statusEl.textContent = 'Exporting…';
  const exportBtn = document.getElementById('stingerExportBtn');
  exportBtn.disabled = true;

  try {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = stingerProps.canvasWidth;
    exportCanvas.height = stingerProps.canvasHeight;

    const buffer = await exportStinger({
      canvas: exportCanvas,
      template: currentStingerTemplate(),
      props: stingerProps,
      assets: { logo: stingerLogoImage },
    });

    const base64 = arrayBufferToBase64(buffer);
    const filePath = joinPath(outputPath, `stinger-${currentStingerTemplate().key}.webm`);
    await invoke('write_binary_file', { path: filePath, base64Data: base64 });

    const modeNote = stingerExportMode() === 'alpha'
      ? 'Exported with real transparency (experimental) — add it to OBS as a Stinger Transition.'
      : `Exported with a solid ${document.getElementById('stingerKeyColor').value} background — add it to OBS as a Stinger Transition, then add the built-in Chroma Key filter set to that color.`;
    statusEl.textContent = `Saved to ${filePath}. ${modeNote}`;
  } catch (err) {
    statusEl.textContent = 'Export failed: ' + err;
  } finally {
    exportBtn.disabled = false;
  }
}

function wireStingerBuilderDialog() {
  els.stingerBuilderBtn.addEventListener('click', openStingerBuilderDialog);
  document.getElementById('stingerCloseBtn').addEventListener('click', closeStingerBuilderDialog);

  document.getElementById('stingerTemplate').addEventListener('change', (e) => {
    const t = STINGER_TEMPLATES.find((t) => t.key === e.target.value);
    document.getElementById('stingerTemplateDescription').textContent = t ? t.description : '';
  });

  document.getElementById('stingerDuration').addEventListener('change', (e) => {
    const seconds = parseFloat(e.target.value);
    if (seconds > 0) stingerProps.durationMs = Math.round(seconds * 1000);
  });

  document.getElementById('stingerResolution').addEventListener('change', resizeStingerCanvas);
  document.getElementById('stingerPrimaryColor').addEventListener('input', (e) => { stingerProps.primaryColor = e.target.value; });

  document.getElementById('stingerLogoScale').addEventListener('input', (e) => {
    stingerProps.logoScalePercent = parseInt(e.target.value, 10);
    document.getElementById('stingerLogoScaleValue').textContent = e.target.value;
    recalcStingerLogoSize();
  });

  document.getElementById('stingerPickLogoBtn').addEventListener('click', async () => {
    const path = await invoke('pick_image_file');
    if (!path) return;
    try {
      const base64 = await invoke('read_binary_file_base64', { path });
      const ext = (path.split('.').pop() || 'png').toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = `data:${mime};base64,${base64}`;
      });
      stingerLogoImage = img;
      document.getElementById('stingerLogoStatus').textContent = 'Using: ' + path;
      await resizeStingerCanvas();
    } catch (err) {
      setStatus('Couldn\'t load that image: ' + err, 'err');
    }
  });

  document.querySelectorAll('input[name="stingerExportMode"]').forEach((el) => el.addEventListener('change', () => {
    document.getElementById('stingerKeyColorField').hidden = stingerExportMode() === 'alpha';
  }));
  document.getElementById('stingerKeyColor').addEventListener('input', (e) => { stingerProps.keyColor = e.target.value; });

  const scrub = document.getElementById('stingerScrub');
  scrub.addEventListener('pointerdown', () => { stingerScrubbing = true; });
  scrub.addEventListener('pointerup', () => { stingerScrubbing = false; stingerAnimStartTime = null; });
  scrub.addEventListener('input', () => {
    const tMs = (parseInt(scrub.value, 10) / 1000) * stingerProps.durationMs;
    drawStingerPreviewFrame(tMs);
  });

  document.getElementById('stingerExportBtn').addEventListener('click', exportStingerNow);
}

// ---- BACKGROUND GENERATOR DIALOG -------------------------------------------
// A standalone tool, same "works with no project open" pattern as the
// Stinger Builder — see background-generator.js for the actual fill logic.
let bgProps = null;
let bgImage = null; // HTMLImageElement, or null if none picked yet (only used in 'image-gradient' mode)

function bgUpdateFieldVisibility() {
  document.getElementById('bgSolidColorField').hidden = bgProps.fillType !== 'solid';
  document.getElementById('bgImagePickField').hidden = bgProps.fillType !== 'image-gradient';
  document.getElementById('bgGradientFields').hidden = bgProps.fillType === 'solid';
  document.getElementById('bgOverlayOpacityField').hidden = bgProps.fillType !== 'image-gradient';
  document.getElementById('bgGradientAngleField').hidden = bgProps.gradientStyle === 'radial';
}

function bgRedrawPreview() {
  const canvas = document.getElementById('bgPreviewCanvas');
  canvas.width = bgProps.canvasWidth;
  canvas.height = bgProps.canvasHeight;
  drawBackground(canvas.getContext('2d'), bgProps.canvasWidth, bgProps.canvasHeight, bgProps, bgImage);
}

function openBackgroundGeneratorDialog() {
  bgProps = defaultBackgroundProps();
  bgImage = null;

  document.getElementById('bgResolution').value = `${bgProps.canvasWidth}x${bgProps.canvasHeight}`;
  document.getElementById('bgFillType').value = bgProps.fillType;
  document.getElementById('bgSolidColor').value = bgProps.solidColor;
  document.getElementById('bgGradientFrom').value = bgProps.gradientFrom;
  document.getElementById('bgGradientTo').value = bgProps.gradientTo;
  document.getElementById('bgGradientStyle').value = bgProps.gradientStyle;
  document.getElementById('bgGradientAngle').value = String(bgProps.gradientAngle);
  document.getElementById('bgOverlayOpacity').value = String(Math.round(bgProps.overlayOpacity * 100));
  document.getElementById('bgOverlayOpacityValue').textContent = String(Math.round(bgProps.overlayOpacity * 100));
  document.getElementById('bgImageStatus').textContent = 'No image chosen yet.';
  document.getElementById('bgExportStatus').textContent = '';

  bgUpdateFieldVisibility();
  bgRedrawPreview();
  document.getElementById('backgroundGeneratorDialog').showModal();
}

async function exportBackgroundNow() {
  const statusEl = document.getElementById('bgExportStatus');
  const outputFolder = await invoke('pick_project_folder');
  if (!outputFolder) return;

  statusEl.textContent = 'Exporting…';
  const exportBtn = document.getElementById('bgExportBtn');
  exportBtn.disabled = true;

  try {
    const canvas = document.getElementById('bgPreviewCanvas');
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
    const filePath = joinPath(outputFolder, 'background.png');
    await invoke('write_binary_file', { path: filePath, base64Data });
    statusEl.textContent = `Saved to ${filePath} — add it to OBS as an Image Source.`;
  } catch (err) {
    statusEl.textContent = 'Export failed: ' + err;
  } finally {
    exportBtn.disabled = false;
  }
}

function wireBackgroundGeneratorDialog() {
  els.backgroundGeneratorBtn.addEventListener('click', openBackgroundGeneratorDialog);
  document.getElementById('bgCloseBtn').addEventListener('click', () => document.getElementById('backgroundGeneratorDialog').close());

  document.getElementById('bgResolution').addEventListener('change', (e) => {
    const [width, height] = e.target.value.split('x').map((n) => parseInt(n, 10));
    bgProps.canvasWidth = width;
    bgProps.canvasHeight = height;
    bgRedrawPreview();
  });

  document.getElementById('bgFillType').addEventListener('change', (e) => {
    bgProps.fillType = e.target.value;
    bgUpdateFieldVisibility();
    bgRedrawPreview();
  });

  document.getElementById('bgSolidColor').addEventListener('input', (e) => {
    bgProps.solidColor = e.target.value;
    bgRedrawPreview();
  });

  ['bgGradientFrom', 'bgGradientTo'].forEach((id) => {
    document.getElementById(id).addEventListener('input', (e) => {
      bgProps[id === 'bgGradientFrom' ? 'gradientFrom' : 'gradientTo'] = e.target.value;
      bgRedrawPreview();
    });
  });

  document.getElementById('bgGradientStyle').addEventListener('change', (e) => {
    bgProps.gradientStyle = e.target.value;
    bgUpdateFieldVisibility();
    bgRedrawPreview();
  });

  document.getElementById('bgGradientAngle').addEventListener('input', (e) => {
    bgProps.gradientAngle = parseFloat(e.target.value) || 0;
    bgRedrawPreview();
  });

  document.getElementById('bgOverlayOpacity').addEventListener('input', (e) => {
    bgProps.overlayOpacity = parseInt(e.target.value, 10) / 100;
    document.getElementById('bgOverlayOpacityValue').textContent = e.target.value;
    bgRedrawPreview();
  });

  document.getElementById('bgPickImageBtn').addEventListener('click', async () => {
    const path = await invoke('pick_image_file');
    if (!path) return;
    try {
      const base64 = await invoke('read_binary_file_base64', { path });
      const ext = (path.split('.').pop() || 'png').toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = `data:${mime};base64,${base64}`;
      });
      bgImage = img;
      document.getElementById('bgImageStatus').textContent = 'Using: ' + path;
      bgRedrawPreview();
    } catch (err) {
      setStatus('Couldn\'t load that image: ' + err, 'err');
    }
  });

  document.getElementById('bgExportBtn').addEventListener('click', exportBackgroundNow);
}

// ---- BOOTSTRAP ----------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  els = {
    workspace: document.getElementById('workspace'),
    subtitle: document.getElementById('subtitle'),
    status: document.getElementById('status'),
    newProjectBtn: document.getElementById('newProjectBtn'),
    starterKitBtn: document.getElementById('starterKitBtn'),
    openProjectBtn: document.getElementById('openProjectBtn'),
    importLegacyBtn: document.getElementById('importLegacyBtn'),
    saveProjectBtn: document.getElementById('saveProjectBtn'),
    bakeBtn: document.getElementById('bakeBtn'),
    addFrameBtn: document.getElementById('addFrameBtn'),
    addImageBtn: document.getElementById('addImageBtn'),
    addPopupSlideBtn: document.getElementById('addPopupSlideBtn'),
    addChatOverlayBtn: document.getElementById('addChatOverlayBtn'),
    addCountdownTimerBtn: document.getElementById('addCountdownTimerBtn'),
    addPngtuberBtn: document.getElementById('addPngtuberBtn'),
    addViewerPetBtn: document.getElementById('addViewerPetBtn'),
    addPetRosterBtn: document.getElementById('addPetRosterBtn'),
    addNowPlayingBtn: document.getElementById('addNowPlayingBtn'),
    canvasSizeLabel: document.getElementById('canvasSizeLabel'),
    fabricCanvasEl: document.getElementById('fabricCanvas'),
    propertiesBody: document.getElementById('propertiesBody'),
    deleteItemBtn: document.getElementById('deleteItemBtn'),
    saveToLibraryBtn: document.getElementById('saveToLibraryBtn'),
    libraryList: document.getElementById('libraryList'),
    bakeNewFolderBtn: document.getElementById('bakeNewFolderBtn'),
    bakeResultActions: document.getElementById('bakeResultActions'),
    stingerBuilderBtn: document.getElementById('stingerBuilderBtn'),
    backgroundGeneratorBtn: document.getElementById('backgroundGeneratorBtn'),
  };

  wireNewProjectDialog();
  wireStarterKitDialog();
  wireStingerBuilderDialog();
  wireBackgroundGeneratorDialog();
  wireChromaKeyDialog();
  wireCropDialog();
  wirePadDialog();
  wireColorAdjustDialog();
  wireOutlineDialog();
  wireBlurDialog();
  wireSharpenDialog();
  wireVignetteDialog();
  els.openProjectBtn.addEventListener('click', openProject);
  els.importLegacyBtn.addEventListener('click', importLegacyProject);
  els.saveProjectBtn.addEventListener('click', saveProject);
  els.bakeBtn.addEventListener('click', () => bakeProject(false));
  els.bakeNewFolderBtn.addEventListener('click', () => bakeProject(true));
  document.getElementById('copyObsInstructionsBtn').addEventListener('click', async () => {
    try {
      await invoke('copy_to_clipboard', { text: obsSetupInstructions() });
      setStatus('OBS setup instructions copied to clipboard.', 'ok');
    } catch (err) {
      setStatus('Couldn\'t copy to clipboard: ' + err, 'err');
    }
  });
  els.addFrameBtn.addEventListener('click', () => addItem('frame'));
  els.addImageBtn.addEventListener('click', addImageItem);
  els.addPopupSlideBtn.addEventListener('click', () => addItem('popup-slide'));
  els.addChatOverlayBtn.addEventListener('click', () => addItem('chat-overlay'));
  els.addCountdownTimerBtn.addEventListener('click', () => addItem('countdown-timer'));
  els.addPngtuberBtn.addEventListener('click', () => addItem('pngtuber'));
  els.addViewerPetBtn.addEventListener('click', () => addItem('viewer-pet'));
  els.addPetRosterBtn.addEventListener('click', () => addItem('pet-roster'));
  els.addNowPlayingBtn.addEventListener('click', () => addItem('now-playing'));
  els.deleteItemBtn.addEventListener('click', deleteSelectedItem);
  els.saveToLibraryBtn.addEventListener('click', saveSelectedItemToLibrary);
  loadLibrary();

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemId && document.activeElement.tagName !== 'INPUT') {
      deleteSelectedItem();
    }
  });
});
