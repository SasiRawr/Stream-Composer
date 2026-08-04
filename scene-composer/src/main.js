// ============================================================================
// Scene Composer — app logic
// ============================================================================
// A Project is { canvasWidth, canvasHeight, items: [...] }, saved as a real
// file (project.json) via Tauri's fs commands (see src-tauri/src/lib.rs) —
// same "real save, not browser storage" principle as Stream-Builder's app/.
//
// Each item: { id, type, x, y, width, height, rotation, zIndex, props }.
// x/y/width/height/rotation are always stored in REAL stream-resolution
// pixels (e.g. against a 1920x1080 canvas), never in on-screen display
// pixels — see DISPLAY SCALING below for why that distinction matters.
// ============================================================================

import { Canvas, Rect, FabricImage } from 'fabric';
import { buildSceneHtml, collectAssetCopies } from './bake.js';

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
  `;
  document.getElementById('pf-replaceImage').addEventListener('click', async () => {
    const path = await invoke('pick_image_file');
    if (!path) return;
    item.props.sourcePath = path;
    await refreshFabricObjectForItem(item.id);
    renderPropertiesPanel();
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
    <div class="hint">Icons/images per slide aren't supported here yet — for now every slide shows plain tag + text. Use Stream-Builder's popup-slide editor (app/) if you need per-slide icons.</div>
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
