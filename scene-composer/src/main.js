// ============================================================================
// Scene Composer — app logic
// ============================================================================
// A Project is { canvasWidth, canvasHeight, items: [...] }, saved as a real
// file (project.json) via Tauri's fs commands (see src-tauri/src/lib.rs) —
// same "real save, not browser storage" principle as the Popup Slide
// Editor's app/.
//
// Each item: { id, type, x, y, width, height, rotation, zIndex, props }.
// x/y/width/height/rotation are always stored in REAL stream-resolution
// pixels (e.g. against a 1920x1080 canvas), never in on-screen display
// pixels — see DISPLAY SCALING below for why that distinction matters.
// ============================================================================

import { Canvas, Rect, FabricImage } from 'fabric';
import { buildSceneHtml, collectAssetCopies } from './bake.js';
import { applyChromaKey } from './chromakey.js';
import { cropImageData, padImageData } from './croppad.js';
import { applyColorAdjustments } from './coloradjust.js';
import { applyOutline } from './outline.js';
import { applyBlur } from './blur.js';
import { applyFlip, applyRotate } from './transform.js';

const { invoke } = window.__TAURI__.core;

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
    return { strokeColor: '#7c5cff', strokeWidth: 3, cornerRadius: 12, fillEnabled: false, fillColor: '#0a0a12' };
  }
  if (type === 'image') {
    return { sourcePath: '' };
  }
  if (type === 'popup-slide') {
    return {
      slides: [{ tag: 'WEB', text: 'YourSite.com' }],
      transitionStyle: 'fade',
      perSlideMs: 2600,
      pauseMs: 500,
      colors: { void: '#0a0a12', violet: '#7c5cff', violetSoft: '#a594ff', ink: '#f2f1f9', mute: '#918eae' },
    };
  }
  return {};
}

function defaultSizeFor(type) {
  if (type === 'popup-slide') return { width: 640, height: 220 }; // matches v1's established canvas convention
  if (type === 'frame') return { width: 480, height: 270 };       // a reasonable webcam-frame-ish starting box
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

async function openProject() {
  const folder = await invoke('pick_project_folder');
  if (!folder) return;
  const projectPath = joinPath(folder, 'project.json');
  const exists = await invoke('file_exists', { path: projectPath });
  if (!exists) {
    setStatus('That folder doesn\'t have a project.json — not a Scene Composer project.', 'err');
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

function createRectFabricObject(item) {
  const isPopupSlide = item.type === 'popup-slide';
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
    fill: isPopupSlide
      ? 'rgba(124,92,255,0.15)'
      : (p.fillEnabled ? p.fillColor : 'transparent'),
    stroke: isPopupSlide ? '#a594ff' : p.strokeColor,
    strokeWidth: isPopupSlide ? 2 : p.strokeWidth,
    strokeDashArray: isPopupSlide ? [8, 5] : null,
    rx: isPopupSlide ? 10 : p.cornerRadius,
    ry: isPopupSlide ? 10 : p.cornerRadius,
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

// ---- SELECTION + PROPERTIES PANEL ---------------------------------------------
function selectItem(itemId) {
  selectedItemId = itemId;
  els.deleteItemBtn.hidden = !itemId;
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
}

function renderFrameProperties(item, body) {
  const p = item.props;
  body.innerHTML = `
    <div class="field"><label>Stroke color</label><input type="color" id="pf-strokeColor" value="${p.strokeColor}"></div>
    <div class="field"><label>Stroke width (px)</label><input type="number" id="pf-strokeWidth" min="0" value="${p.strokeWidth}"></div>
    <div class="field"><label>Corner radius (px)</label><input type="number" id="pf-cornerRadius" min="0" value="${p.cornerRadius}"></div>
    <div class="field">
      <label><input type="checkbox" id="pf-fillEnabled" ${p.fillEnabled ? 'checked' : ''}> Fill</label>
    </div>
    <div class="field"><label>Fill color</label><input type="color" id="pf-fillColor" value="${p.fillColor}"></div>
  `;
  const apply = async () => {
    p.strokeColor = document.getElementById('pf-strokeColor').value;
    p.strokeWidth = parseFloat(document.getElementById('pf-strokeWidth').value) || 0;
    p.cornerRadius = parseFloat(document.getElementById('pf-cornerRadius').value) || 0;
    p.fillEnabled = document.getElementById('pf-fillEnabled').checked;
    p.fillColor = document.getElementById('pf-fillColor').value;
    await refreshFabricObjectForItem(item.id);
  };
  body.querySelectorAll('input').forEach((el) => el.addEventListener('change', apply));
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

  // Default key color: sample the top-left corner, a reasonable guess for
  // "probably background" until the user picks for real.
  const d = ckOriginalImageData.data;
  ckKeyColor = { r: d[0], g: d[1], b: d[2] };
  ckUpdateSwatch();
  ckUpdateSliderLabels();
  ckRedrawPreview();

  dialog.showModal();
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

  document.getElementById('ckApplyBtn').addEventListener('click', async () => {
    const canvas = document.getElementById('ckPreviewCanvas');
    const outputPath = joinPath(dirname(ckItem.props.sourcePath), ckItem.id + '-keyed.png');
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

function dirname(path) {
  const sep = path.includes('\\') ? '\\' : '/';
  const idx = path.lastIndexOf(sep);
  return idx === -1 ? path : path.slice(0, idx);
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
  const outputPath = joinPath(dirname(item.props.sourcePath), item.id + '-' + suffix + '.png');
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

  document.getElementById('olStrokeWidthValue').textContent = document.getElementById('olStrokeWidth').value;
  olRedrawPreview();

  document.getElementById('outlineDialog').showModal();
}

function wireOutlineDialog() {
  document.getElementById('olStrokeWidth').addEventListener('input', () => {
    document.getElementById('olStrokeWidthValue').textContent = document.getElementById('olStrokeWidth').value;
    olRedrawPreview();
  });
  document.getElementById('olStrokeColor').addEventListener('input', olRedrawPreview);

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

  document.getElementById('blRadius').value = 4;
  document.getElementById('blRadiusValue').textContent = '4';
  blRedrawPreview();

  document.getElementById('blurDialog').showModal();
}

function wireBlurDialog() {
  document.getElementById('blRadius').addEventListener('input', () => {
    document.getElementById('blRadiusValue').textContent = document.getElementById('blRadius').value;
    blRedrawPreview();
  });

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

function renderPopupSlideProperties(item, body) {
  const p = item.props;
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
    <div class="field"><label>Slides</label></div>
    <div id="pf-slideList"></div>
    <button class="secondary block" id="pf-addSlide" type="button">+ Add slide</button>
    <div class="hint">Icons/images per slide aren't supported here yet — for now every slide shows plain tag + text. Use the Popup Slide Editor (app/) if you need per-slide icons.</div>
  `;

  function renderSlideList() {
    const list = document.getElementById('pf-slideList');
    list.innerHTML = p.slides.map((s, i) => `
      <div class="slide-card">
        <div class="slide-card-head"><span>SLIDE ${i + 1}</span>
          <button class="remove-btn" style="margin:0;width:auto;padding:2px 8px;" data-i="${i}" data-action="remove-slide" type="button">Remove</button>
        </div>
        <div class="field"><label>Tag</label><input type="text" data-i="${i}" data-field="tag" value="${escapeHtml(s.tag)}"></div>
        <div class="field"><label>Text</label><input type="text" data-i="${i}" data-field="text" value="${escapeHtml(s.text)}"></div>
      </div>
    `).join('');
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
  }
  renderSlideList();

  document.getElementById('pf-addSlide').addEventListener('click', () => {
    p.slides.push({ tag: '', text: '' });
    renderSlideList();
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

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- BAKE -----------------------------------------------------------------
async function bakeProject() {
  if (!project || !projectFolder) return;
  const outputFolder = await invoke('pick_project_folder');
  if (!outputFolder) return;

  const assetCopies = collectAssetCopies(project);
  const assetPathsById = {};
  for (const copy of assetCopies) {
    try {
      const base64 = await invoke('read_binary_file_base64', { path: copy.sourcePath });
      const destPath = joinPath(outputFolder, copy.destRelativePath.replace(/\//g, sepFor(outputFolder)));
      await invoke('write_binary_file', { path: destPath, base64Data: base64 });
      assetPathsById[copy.itemId] = copy.destRelativePath;
    } catch (err) {
      setStatus('Couldn\'t copy an image asset while baking: ' + err, 'err');
      return;
    }
  }

  const html = buildSceneHtml(project, assetPathsById);
  const scenePath = joinPath(outputFolder, 'scene.html');
  await invoke('write_text_file', { path: scenePath, contents: html });
  setStatus('Baked to ' + scenePath + ' — add this as an OBS Browser Source, ' +
    project.canvasWidth + 'x' + project.canvasHeight + '.', 'ok');
}

function sepFor(folder) {
  return folder.includes('\\') ? '\\' : '/';
}

// ---- NEW PROJECT DIALOG -----------------------------------------------------
function wireNewProjectDialog() {
  const dialog = document.getElementById('newProjectDialog');
  const preset = document.getElementById('resolutionPreset');
  const customRow = document.getElementById('customResolutionRow');

  els.newProjectBtn.addEventListener('click', () => dialog.showModal());
  document.getElementById('cancelNewProjectBtn').addEventListener('click', () => dialog.close());

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
    await createProject(width, height);
  });
}

// ---- BOOTSTRAP ----------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  els = {
    workspace: document.getElementById('workspace'),
    subtitle: document.getElementById('subtitle'),
    status: document.getElementById('status'),
    newProjectBtn: document.getElementById('newProjectBtn'),
    openProjectBtn: document.getElementById('openProjectBtn'),
    saveProjectBtn: document.getElementById('saveProjectBtn'),
    bakeBtn: document.getElementById('bakeBtn'),
    addFrameBtn: document.getElementById('addFrameBtn'),
    addImageBtn: document.getElementById('addImageBtn'),
    addPopupSlideBtn: document.getElementById('addPopupSlideBtn'),
    canvasSizeLabel: document.getElementById('canvasSizeLabel'),
    fabricCanvasEl: document.getElementById('fabricCanvas'),
    propertiesBody: document.getElementById('propertiesBody'),
    deleteItemBtn: document.getElementById('deleteItemBtn'),
  };

  wireNewProjectDialog();
  wireChromaKeyDialog();
  wireCropDialog();
  wirePadDialog();
  wireColorAdjustDialog();
  wireOutlineDialog();
  wireBlurDialog();
  els.openProjectBtn.addEventListener('click', openProject);
  els.saveProjectBtn.addEventListener('click', saveProject);
  els.bakeBtn.addEventListener('click', bakeProject);
  els.addFrameBtn.addEventListener('click', () => addItem('frame'));
  els.addImageBtn.addEventListener('click', addImageItem);
  els.addPopupSlideBtn.addEventListener('click', () => addItem('popup-slide'));
  els.deleteItemBtn.addEventListener('click', deleteSelectedItem);

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemId && document.activeElement.tagName !== 'INPUT') {
      deleteSelectedItem();
    }
  });
});
