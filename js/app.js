import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import ManifoldModule from '../vendor/manifold/manifold.js';
import { zipSync, strToU8 } from '../vendor/fflate/fflate.js';
import { polysToPath, writeSTL, write3MF, translateMesh, rotateMesh90, mergeMeshes } from './geom.js';
import { LabelFont, BUILTIN_FONTS, DEFAULT_FONT } from './fonts.js';
import { ICONS, CATEGORIES } from './icons.js';
import { iconPolys } from './iconkit.js';
import { layoutLabel, buildParts, buildSolid, printPlan, roundToLayers, packPlates, stack, DEFAULT_STYLE, DEFAULT_PRINT, DEFAULT_SIZE } from './label.js';
import { SIZE_PRESETS, findPreset } from './presets.js';
import { PRINTERS, DEFAULT_PRINTER, findPrinter } from './printers.js';
import * as U from './util.js';
import * as DB from './store.js';
import { svgToPolys, inkMask, traceMask, ringsToPolys, hasTransparency } from './graphics.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LAST_KEY = '3d-labels-last';

// Surface any uncaught error instead of failing silently.
window.addEventListener('error', (e) => setStatus('Error: ' + (e.error?.message || e.message), true));
window.addEventListener('unhandledrejection', (e) => setStatus('Error: ' + (e.reason?.message || e.reason), true));

const S = {
  wasm: null,
  P: null,                 // the open project
  sel: null,               // selected label id
  fonts: new Map(),        // font key -> Promise<LabelFont>
  fontReady: new Map(),    // font key -> LabelFont
  assets: [],              // your fonts and graphics
  iconCache: new Map(),
  layCache: new Map(),
  plates: null,
  plateIdx: 0,
  view: 'labels',
  threeWhat: 'label',
  undo: null,
  filter: '',
};

const SAMPLE = [
  { title: '3" Deck Screws', sub: '#9 Torx T25', icon: 'torx' },
  { title: '1/4-20 Hex Nuts', sub: 'Zinc plated', icon: 'hex-nut' },
  { title: '#8 Wood Screws', sub: '1 1/4" Phillips flat head', icon: 'phillips' },
  { title: '1/4" Washers', sub: 'SAE flat', icon: 'washer' },
  { title: 'Wire Nuts', sub: 'Yellow 18-12 AWG', icon: 'wire-nut' },
  { title: 'M3 Inserts', sub: 'Heat-set, 5.7 mm long', icon: 'heat-set-insert' },
];

const blankLabel = () => ({ id: U.uid(), title: '', sub: '', icon: '', qty: 1, size: null });

function newProject(name = 'My labels', sample = false) {
  return fixProject({
    id: U.uid(), name, created: Date.now(), updated: Date.now(),
    labels: sample ? SAMPLE.map((l) => ({ ...blankLabel(), ...l })) : [blankLabel()],
  });
}

// Fill in anything missing (older saves, hand-written files).
function fixProject(p) {
  const base = {
    version: 1, units: 'in', exportFormat: 'stl',
    size: { ...DEFAULT_SIZE, w: 76.2, h: 19.05, preset: 'in-3x075' },
    style: { ...DEFAULT_STYLE },
    print: { ...DEFAULT_PRINT, baseSlot: 1, inkSlot: 2 },
    plate: { printer: DEFAULT_PRINTER, w: 225, h: 225, margin: 5, gap: 3 },
    labels: [],
  };
  const out = { ...base, ...p };
  for (const k of ['size', 'style', 'print', 'plate']) out[k] = { ...base[k], ...(p[k] || {}) };
  out.labels = (p.labels || []).map((l) => ({ ...blankLabel(), ...l, id: l.id || U.uid() }));
  return out;
}

// ---------------------------------------------------------------- status

let statusTimer = 0;
function setStatus(msg, isError = false, action = null) {
  const el = $('status');
  el.textContent = msg || '';
  el.classList.toggle('error', isError);
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn small'; b.style.marginLeft = '8px'; b.textContent = action.label;
    b.onclick = () => { action.run(); setStatus(''); };
    el.appendChild(b);
  }
  clearTimeout(statusTimer);
  if (msg && !isError) statusTimer = setTimeout(() => { if (el.firstChild?.nodeValue === msg) el.textContent = ''; }, action ? 12000 : 6000);
}

// ---------------------------------------------------------------- paths into the project

const getPath = (path) => path.split('.').reduce((o, k) => o?.[k], S.P);
function setPath(path, v) {
  const ks = path.split('.');
  let o = S.P;
  for (const k of ks.slice(0, -1)) o = o[k];
  o[ks.at(-1)] = v;
}

// ---------------------------------------------------------------- fonts and icons

const fontKey = () => S.P.style.font || DEFAULT_FONT;

function loadFont(key) {
  if (S.fonts.has(key)) return S.fonts.get(key);
  const p = (async () => {
    let buf, name;
    if (key.startsWith('u:')) {
      const a = S.assets.find((x) => x.id === key.slice(2));
      if (!a) throw new Error('That font is no longer saved in this browser.');
      buf = a.data; name = a.name;
    } else {
      const def = BUILTIN_FONTS.find((f) => f.id === key) || BUILTIN_FONTS[0];
      const r = await fetch(def.file);
      if (!r.ok) throw new Error('Could not load ' + def.name);
      buf = await r.arrayBuffer(); name = def.name;
    }
    const f = new LabelFont(buf, name);
    S.fontReady.set(key, f);
    return f;
  })();
  S.fonts.set(key, p);
  p.catch(() => S.fonts.delete(key));
  return p;
}

async function ensureFont() {
  const key = fontKey();
  try { await loadFont(key); }
  catch (e) {
    setStatus(e.message + ' Using ' + BUILTIN_FONTS[0].name + '.', true);
    S.P.style.font = DEFAULT_FONT;
    await loadFont(DEFAULT_FONT);
  }
}

// built-in icons plus your graphics, in one list for pickers and CSV matching
function allIcons() {
  const mine = S.assets.filter((a) => a.kind === 'graphic').map((a) => ({ id: 'u:' + a.id, name: a.name, cat: 'mine', tags: a.tags || [] }));
  return [...mine, ...ICONS];
}

function iconPolysOf(id) {
  if (!id) return null;
  if (S.iconCache.has(id)) return S.iconCache.get(id);
  let polys = null;
  if (id.startsWith('u:')) polys = S.assets.find((a) => a.id === id.slice(2))?.polys || null;
  else {
    const def = ICONS.find((i) => i.id === id);
    if (def) polys = iconPolys(S.wasm, def.draw);
  }
  if (polys) S.iconCache.set(id, polys);
  return polys;
}
const iconName = (id) => (id ? allIcons().find((i) => i.id === id)?.name || id : '');

function iconSVG(id, cls = '') {
  const polys = iconPolysOf(id);
  if (!polys) return `<svg class="${cls}" viewBox="0 0 100 100"></svg>`;
  return `<svg class="${cls}" viewBox="-4 -104 108 108"><path class="ink" d="${polysToPath(polys, 1)}"/></svg>`;
}

// ---------------------------------------------------------------- layout

const sizeOf = (l) => (l.size ? { w: l.size.w, h: l.size.h, r: S.P.size.r } : { w: S.P.size.w, h: S.P.size.h, r: S.P.size.r });

function layoutOf(l) {
  const sz = sizeOf(l);
  const key = JSON.stringify([l.title, l.sub, l.icon, sz, S.P.style]);
  let lay = S.layCache.get(key);
  if (lay) return lay;
  const font = S.fontReady.get(fontKey());
  if (!font) return null;
  try {
    lay = layoutLabel({ wasm: S.wasm, font, icon: iconPolysOf }, l, sz, S.P.style);
  } catch (e) {
    lay = { w: sz.w, h: sz.h, outline: [], ink: [], warnings: [e.message], overflow: true, lines: [] };
  }
  if (S.layCache.size > 3000) S.layCache.clear();
  S.layCache.set(key, lay);
  return lay;
}

const selLabel = () => S.P.labels.find((l) => l.id === S.sel) || null;

// ---------------------------------------------------------------- saving

let saveTimer = 0;
function save() {
  $('save-state').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
async function saveNow() {
  clearTimeout(saveTimer);
  S.P.updated = Date.now();
  try {
    await DB.putProject(JSON.parse(JSON.stringify(S.P)));
    try { localStorage.setItem(LAST_KEY, S.P.id); } catch (e) { /* ignore */ }
    $('save-state').textContent = DB.persistent ? 'Saved' : 'Not saved (storage blocked)';
  } catch (e) {
    $('save-state').textContent = 'Save failed';
    setStatus('Could not save: ' + e.message, true);
  }
}
window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });

// ---------------------------------------------------------------- settings panel

function fillSelects() {
  const sp = $('size-preset');
  sp.innerHTML = '<option value="custom">Custom size</option>' + SIZE_PRESETS.map((g) =>
    `<optgroup label="${esc(g.group)}">${g.items.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
  const pr = $('printer');
  pr.innerHTML = '<option value="custom">Custom bed size</option>' + PRINTERS.map((g) =>
    `<optgroup label="${esc(g.group)}">${g.items.map(([n]) => `<option value="${esc(g.group + ' / ' + n)}">${esc(n)}</option>`).join('')}</optgroup>`).join('');
  fillFonts();
}

function fillFonts() {
  const mine = S.assets.filter((a) => a.kind === 'font');
  $('font').innerHTML = BUILTIN_FONTS.map((f) => `<option value="${f.id}" title="${esc(f.note)}">${esc(f.name)}</option>`).join('') +
    (mine.length ? `<optgroup label="Your fonts">${mine.map((a) => `<option value="u:${a.id}">${esc(a.name)}</option>`).join('')}</optgroup>` : '') +
    '<option value="__add">Add your own font…</option>';
}

function syncInputs() {
  const P = S.P;
  for (const el of document.querySelectorAll('[data-k]')) {
    const v = getPath(el.dataset.k);
    if (el.classList.contains('seg')) {
      for (const b of el.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === String(v));
    } else if (el.type === 'checkbox') el.checked = !!v;
    else if (document.activeElement !== el) el.value = v ?? '';
  }
  for (const el of document.querySelectorAll('[data-len]')) {
    if (document.activeElement !== el) { el.value = U.fmtLen(getPath(el.dataset.len), P.units); el.classList.remove('bad'); }
  }
  $('size-preset').value = findPreset(P.size.preset) ? P.size.preset : 'custom';
  $('printer').value = findPrinter(P.plate.printer) ? P.plate.printer : 'custom';
  $('btn-font-del').hidden = !fontKey().startsWith('u:');
  renderDerived();
}

// the bits of the settings panel that depend on other settings
function renderDerived() {
  const P = S.P, pr = P.print;
  const preset = findPreset(P.size.preset);
  let note = preset?.note || '';
  const thick = stack(pr).total;
  if (preset?.t && thick > preset.t + 1e-6) note += ` This label is ${thick.toFixed(2)} mm thick; the holder takes about ${preset.t} mm.`;
  $('size-note').textContent = note;
  const ts = pr.textStyle;
  $('facedown-row').hidden = ts === 'raised';
  $('thick-label').firstChild.nodeValue = ts === 'raised' ? 'Plate ' : 'Thickness ';
  $('ink-label').firstChild.nodeValue = ts === 'raised' ? 'Text height ' : ts === 'inlay' ? 'Inlay depth ' : 'Letter depth ';
  $('slot-row').hidden = pr.method !== 'multi';
  const printer = findPrinter(P.plate.printer);
  $('printer-note').textContent = printer?.multi === 'built-in' && pr.method === 'swap'
    ? 'This printer prints several colors: Multi-material (under Printing) skips the filament swap.' : '';
  renderPlan();
  renderDlNote();
}

function renderPlan() {
  const pr = S.P.print;
  const plan = printPlan(pr);
  const sw = (c) => `<span class="swatch" style="background:${esc(c)}"></span>`;
  const colOf = (role) => (role === 'base' ? pr.baseColor : pr.inkColor);
  const nameOf = (role) => (role === 'base' ? 'plate color' : 'text color');
  let h = '';
  const fmt = (z) => (Math.round(z * 100) / 100).toFixed(2);
  if (pr.method === 'multi') {
    h += `<div class="big">Multi-material: no pausing</div>`;
    h += `<div>The 3MF sets the plate to filament ${pr.baseSlot} ${sw(pr.baseColor)} and the text to filament ${pr.inkSlot} ${sw(pr.inkColor)}. ${plan.layers} layers in all.</div>`;
    h += `<details><summary>Which file for my slicer?</summary><ul>
      <li><b>Bambu Studio, OrcaSlicer, Elegoo Slicer, Snapmaker Orca:</b> 3MF for Bambu Studio / Orca.</li>
      <li><b>PrusaSlicer:</b> 3MF for PrusaSlicer.</li>
      <li><b>Cura and others:</b> STL per color. Load both files at once, say <b>Yes</b> if asked to load them as one object with several parts (in Cura: select both, right-click › Merge models), then set the text part to your second filament.</li></ul></details>`;
  } else if (plan.s.multiOnly) {
    h += `<div class="bad">${esc(plan.notes[0])}</div>`;
  } else if (plan.swaps.length) {
    const s = plan.swaps[0];
    h += `<div class="big">Swap filament before layer ${s.layer}</div>`;
    h += `<div>Layers 1–${s.layer - 1} (to ${fmt(s.printedZ)} mm): ${sw(colOf(s.from))} ${nameOf(s.from)}.<br>Layers ${s.layer}–${plan.layers} (from ${fmt(s.nextZ)} mm): ${sw(colOf(s.to))} ${nameOf(s.to)}.</div>`;
    h += `<details><summary>How, in your slicer</summary><ul>
      <li><b>PrusaSlicer:</b> slice, drag the layer slider up to <b>${fmt(s.nextZ)}</b> mm and click the <b>+</b> (color change, M600). Right-click it for a pause instead.</li>
      <li><b>Orca / Bambu Studio / Elegoo Slicer:</b> slice, drag the slider to layer <b>${s.layer}</b> (${fmt(s.nextZ)} mm), right-click the <b>+</b> and choose <b>Add pause</b> (or change filament).</li>
      <li><b>Cura:</b> Extensions › Post Processing › Modify G-Code › Add a script › <b>Pause at height</b>: pause at <b>Layer number</b> ${s.layer}.</li>
      </ul>Your printer needs to handle the pause: M600 (Marlin with filament change) or PAUSE (Klipper).</details>`;
  }
  for (const n of plan.notes) if (!(plan.s.multiOnly && pr.method === 'swap' && n === plan.notes[0])) h += `<div class="warn">${esc(n)}</div>`;
  const rounded = roundToLayers(pr);
  if (Math.abs(rounded.thick - pr.thick) > 1e-6 || Math.abs(rounded.ink - pr.ink) > 1e-6) {
    h += `<div style="margin-top:6px"><button class="btn small" id="btn-round" type="button">Round to layers (${rounded.thick} / ${rounded.ink} mm)</button></div>`;
  }
  $('print-plan').innerHTML = h;
  $('btn-round')?.addEventListener('click', () => {
    Object.assign(S.P.print, roundToLayers(S.P.print));
    settingChanged('print.thick');
  });
}

function renderDlNote() {
  const f = S.P.exportFormat, m = S.P.print.method;
  let t = '';
  if (f === 'stl' && m === 'multi') t = 'A one-body STL is one color. For multi-material pick 3MF or STL per color.';
  else if (f !== 'stl' && m === 'swap') t = 'For a filament swap, one-body STL is all you need.';
  $('dl-note').textContent = t;
}

function bindSettings() {
  for (const el of document.querySelectorAll('[data-k]')) {
    const path = el.dataset.k;
    if (el.classList.contains('seg')) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        setPath(path, b.dataset.v);
        settingChanged(path);
      });
      continue;
    }
    const ev = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') { v = parseFloat(el.value); if (!isFinite(v)) return; }
      else v = el.value;
      if (path === 'style.font' && v === '__add') { el.value = fontKey(); $('font-file').click(); return; }
      setPath(path, v);
      settingChanged(path);
    });
    if (el.type === 'color') el.addEventListener('input', () => { setPath(path, el.value); settingChanged(path, true); });
  }
  for (const el of document.querySelectorAll('[data-len]')) {
    el.addEventListener('input', () => {
      const v = U.parseLen(el.value, S.P.units);
      const ok = v > 1 && v < 2000;
      el.classList.toggle('bad', !ok && el.value.trim() !== '');
      if (!ok) return;
      setPath(el.dataset.len, v);
      S.P.size.preset = 'custom';
      settingChanged(el.dataset.len);
    });
    el.addEventListener('blur', () => { el.value = U.fmtLen(getPath(el.dataset.len), S.P.units); el.classList.remove('bad'); });
  }
  $('size-preset').addEventListener('change', (e) => {
    const p = findPreset(e.target.value);
    if (p) { S.P.size.w = p.w; S.P.size.h = p.h; }
    S.P.size.preset = e.target.value;
    settingChanged('size.w');
  });
  $('printer').addEventListener('change', (e) => {
    const p = findPrinter(e.target.value);
    S.P.plate.printer = e.target.value;
    if (p) { S.P.plate.w = p.w; S.P.plate.h = p.h; }
    settingChanged('plate.w');
  });
  $('calc-apply').addEventListener('click', () => {
    const row = U.parseLen($('calc-row').value, S.P.units), n = parseInt($('calc-n').value, 10);
    const less = U.parseLen($('calc-less').value || '0', S.P.units) || 0;
    const w = row / n - less;
    if (!(w > 5)) { setStatus('Check the row width and bin count.', true); return; }
    S.P.size.w = Math.round(w * 100) / 100;
    S.P.size.preset = 'custom';
    settingChanged('size.w');
    setStatus(`Label width set to ${U.fmtLen(S.P.size.w, S.P.units)}${S.P.units === 'in' ? '"' : ' mm'}.`);
  });
  $('font-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = await f.arrayBuffer();
      // the font's own name; the file name only when it has none
      const font = new LabelFont(data);
      if (!font.font.names?.fullName?.en && !font.font.names?.fontFamily?.en) font.name = f.name.replace(/\.(ttf|otf|woff)$/i, '');
      const a = { id: U.uid(), kind: 'font', name: font.name, data };
      await DB.putAsset(a);
      S.assets.push(a);
      fillFonts();
      S.P.style.font = 'u:' + a.id;
      settingChanged('style.font');
      setStatus(`Added ${font.name}. It's saved in this browser for every project.`);
    } catch (err) {
      setStatus('Could not read that font: ' + err.message + ' (TTF, OTF and WOFF work; WOFF2 does not.)', true);
    }
  });
  $('btn-font-del').addEventListener('click', async () => {
    const key = fontKey();
    if (!key.startsWith('u:')) return;
    const a = S.assets.find((x) => x.id === key.slice(2));
    if (!confirm(`Remove the font "${a?.name}" from this browser? Projects using it switch to ${BUILTIN_FONTS[0].name}.`)) return;
    await removeAsset(key.slice(2));
  });
}

function settingChanged(path, light = false) {
  if (path === 'print.method') {
    if (S.P.print.method === 'multi' && S.P.exportFormat === 'stl') S.P.exportFormat = '3mf';
    if (S.P.print.method === 'swap' && S.P.exportFormat !== 'stl') S.P.exportFormat = 'stl';
  }
  if (path === 'units') renderList();
  syncInputs();
  save();
  if (path.startsWith('print.') || path === 'exportFormat') {
    if (path.endsWith('Color')) { refreshThumbs(); renderPreview(); }
    S.plates = null;
    if (!light) schedule3D();
    if (S.view === 'plates') renderPlates();
    return;
  }
  if (path.startsWith('plate.')) { S.plates = null; renderPlateCount(); if (S.view === 'plates') renderPlates(); schedule3D(); return; }
  // a new font has to load before anything can be laid out with it
  if (path === 'style.font') { ensureFont().then(() => { syncInputs(); refreshAll(); }); return; }
  refreshAll();
}

// ---------------------------------------------------------------- label list

function rowHTML(l) {
  return `<tr data-id="${l.id}">
    <td class="thumb"><canvas width="240" height="72"></canvas></td>
    <td><input class="f-title" type="text" spellcheck="false" value="${esc(l.title)}" placeholder="Main text"></td>
    <td><input class="f-sub" type="text" spellcheck="false" value="${esc(l.sub)}" placeholder="—"></td>
    <td class="c-icon"><button class="btn icon-pick f-icon" type="button">${iconSVG(l.icon)}<span class="ic-name">${esc(iconName(l.icon) || 'None')}</span></button></td>
    <td class="c-size"><input class="f-size" type="text" spellcheck="false" value="${esc(l.size ? sizeText(l.size) : '')}" placeholder="default"></td>
    <td class="c-qty"><input class="f-qty" type="number" min="0" step="1" value="${l.qty}"></td>
    <td class="c-act"><button class="btn icon f-dup" type="button" title="Duplicate">⧉</button> <button class="btn icon danger f-del" type="button" title="Delete">×</button></td>
  </tr>`;
}
const sizeText = (s) => `${U.fmtLen(s.w, S.P.units)} x ${U.fmtLen(s.h, S.P.units)}`;

function matchesFilter(l) {
  if (!S.filter) return true;
  const t = (l.title + ' ' + l.sub + ' ' + iconName(l.icon)).toLowerCase();
  return S.filter.toLowerCase().split(/\s+/).every((w) => t.includes(w));
}

function renderList() {
  const labels = S.P.labels;
  $('list-body').innerHTML = labels.filter(matchesFilter).map(rowHTML).join('');
  $('empty-list').hidden = labels.length > 0;
  const copies = labels.reduce((a, l) => a + (l.qty || 0), 0);
  $('list-count').textContent = `${labels.length} label${labels.length === 1 ? '' : 's'}${copies !== labels.length ? `, ${copies} to print` : ''}`;
  markSel();
  refreshThumbs();
  renderPlateCount();
}

const rowOf = (id) => $('list-body').querySelector(`tr[data-id="${CSS.escape(id)}"]`);

function markSel() {
  for (const tr of $('list-body').children) tr.classList.toggle('sel', tr.dataset.id === S.sel);
}

function select(id, { scroll = false } = {}) {
  S.sel = id;
  markSel();
  renderSelected();
  if (scroll) rowOf(id)?.scrollIntoView({ block: 'nearest' });
  if (S.view === 'plates') renderPlates();
  if (S.threeWhat === 'label') schedule3D();
}

// thumbnails render a few at a time so a long list stays responsive
const thumbQueue = new Set();
let thumbRaf = 0;
function refreshThumbs(ids) {
  for (const id of ids || S.P.labels.map((l) => l.id)) thumbQueue.add(id);
  if (!thumbRaf) thumbRaf = requestAnimationFrame(drainThumbs);
}
function drainThumbs() {
  thumbRaf = 0;
  const t0 = performance.now();
  for (const id of thumbQueue) {
    thumbQueue.delete(id);
    const l = S.P.labels.find((x) => x.id === id);
    const tr = rowOf(id);
    if (!l || !tr) continue;
    const lay = layoutOf(l);
    if (lay) {
      drawThumb(tr.querySelector('canvas'), lay);
      tr.classList.toggle('over', !!lay.overflow);
    }
    if (performance.now() - t0 > 12) break;
  }
  if (thumbQueue.size) thumbRaf = requestAnimationFrame(drainThumbs);
}

function tracePolys(ctx, polys, s, ox, oy, H) {
  ctx.beginPath();
  for (const r of polys) {
    r.forEach(([x, y], i) => { const px = ox + x * s, py = oy + (H - y) * s; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.closePath();
  }
}

function drawThumb(cv, lay) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const s = Math.min((W - 4) / lay.w, (H - 4) / lay.h);
  const ox = (W - lay.w * s) / 2, oy = (H - lay.h * s) / 2;
  ctx.fillStyle = S.P.print.baseColor;
  tracePolys(ctx, lay.outline, s, ox, oy, lay.h); ctx.fill('nonzero');
  ctx.fillStyle = S.P.print.inkColor;
  tracePolys(ctx, lay.ink, s, ox, oy, lay.h); ctx.fill('nonzero');
}

function addLabel(after = null, data = {}) {
  const l = { ...blankLabel(), ...data };
  const i = after ? S.P.labels.findIndex((x) => x.id === after) : -1;
  if (i >= 0) S.P.labels.splice(i + 1, 0, l); else S.P.labels.push(l);
  S.sel = l.id;
  labelsChanged();
  return l;
}

function snapshot() {
  const before = JSON.stringify(S.P.labels);
  const sel = S.sel;
  S.undo = () => { S.P.labels = JSON.parse(before); S.sel = sel; labelsChanged(); setStatus('Undone.'); };
  return { label: 'Undo', run: () => S.undo?.() };
}

function labelsChanged() {
  S.plates = null;
  if (!S.P.labels.some((l) => l.id === S.sel)) S.sel = S.P.labels[0]?.id || null;
  renderList();
  renderSelected();
  save();
  schedule3D();
  if (S.view === 'plates') renderPlates();
}

// one label edited: update just its row, the preview and the plates
function labelEdited(l, from) {
  const tr = rowOf(l.id);
  if (tr) {
    if (from !== 'row') {
      tr.querySelector('.f-title').value = l.title;
      tr.querySelector('.f-sub').value = l.sub;
      tr.querySelector('.f-size').value = l.size ? sizeText(l.size) : '';
      tr.querySelector('.f-qty').value = l.qty;
    }
    tr.querySelector('.f-icon').innerHTML = `${iconSVG(l.icon)}<span class="ic-name">${esc(iconName(l.icon) || 'None')}</span>`;
  }
  refreshThumbs([l.id]);
  if (l.id === S.sel) renderSelected(from === 'editor');
  S.plates = null;
  renderPlateCount();
  if (S.view === 'plates') renderPlates();
  if (S.threeWhat === 'label' && l.id === S.sel) schedule3D();
  save();
}

function bindList() {
  const body = $('list-body');
  body.addEventListener('focusin', (e) => {
    const tr = e.target.closest('tr');
    if (tr && tr.dataset.id !== S.sel) select(tr.dataset.id);
  });
  body.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const l = S.P.labels.find((x) => x.id === tr.dataset.id);
    if (!l) return;
    if (e.target.closest('.f-del')) {
      const undo = snapshot();
      S.P.labels = S.P.labels.filter((x) => x !== l);
      labelsChanged();
      setStatus(`Deleted "${l.title || 'label'}".`, false, undo);
      return;
    }
    if (e.target.closest('.f-dup')) { addLabel(l.id, { ...l, id: U.uid() }); return; }
    if (e.target.closest('.f-icon')) { select(l.id); openIconPicker(l.id); return; }
    if (e.target.closest('.thumb')) select(l.id);
  });
  body.addEventListener('input', (e) => {
    const tr = e.target.closest('tr');
    const l = tr && S.P.labels.find((x) => x.id === tr.dataset.id);
    if (!l) return;
    const t = e.target;
    if (t.classList.contains('f-title')) l.title = t.value;
    else if (t.classList.contains('f-sub')) l.sub = t.value;
    else if (t.classList.contains('f-qty')) { const v = parseInt(t.value, 10); if (!(v >= 0)) return; l.qty = v; }
    else if (t.classList.contains('f-size')) {
      if (!t.value.trim()) { l.size = null; t.classList.remove('bad'); }
      else {
        const s = U.parseSize(t.value, S.P.units);
        t.classList.toggle('bad', !s);
        if (!s) return;
        l.size = { w: Math.round(s.w * 100) / 100, h: Math.round(s.h * 100) / 100 };
      }
    } else return;
    labelEdited(l, 'row');
    if (t.classList.contains('f-qty')) renderList();
  });
  // Enter moves down a row, adding one at the end; Shift+Enter moves up
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    const tr = e.target.closest('tr');
    const cls = [...e.target.classList].find((c) => c.startsWith('f-'));
    let next = e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling;
    if (!next && !e.shiftKey) { addLabel(tr.dataset.id); next = rowOf(S.sel); }
    next?.querySelector('.' + cls)?.focus();
  });
  body.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('f-size')) {
      const l = S.P.labels.find((x) => x.id === e.target.closest('tr').dataset.id);
      if (l) { e.target.value = l.size ? sizeText(l.size) : ''; e.target.classList.remove('bad'); }
    }
  });

  $('btn-add').addEventListener('click', () => { addLabel(S.sel); rowOf(S.sel)?.querySelector('.f-title')?.focus(); });
  $('filter').addEventListener('input', (e) => { S.filter = e.target.value.trim(); renderList(); });
  $('btn-guess').addEventListener('click', () => {
    const icons = allIcons();
    let n = 0;
    const undo = snapshot();
    for (const l of S.P.labels) {
      if (l.icon) continue;
      const g = U.guessIcon(l.title + ' ' + l.sub, icons);
      if (g) { l.icon = g.id; n++; }
    }
    labelsChanged();
    setStatus(n ? `Picked icons for ${n} label${n === 1 ? '' : 's'}.` : 'No icons matched. Icons are matched on words like screw, nut, washer, torx.', false, n ? undo : null);
  });

  // selected-label editor
  const ed = (id, fn) => $(id).addEventListener('input', (e) => { const l = selLabel(); if (l) { fn(l, e.target); labelEdited(l, 'editor'); } });
  ed('e-title', (l, t) => { l.title = t.value; });
  ed('e-sub', (l, t) => { l.sub = t.value; });
  $('e-size').addEventListener('input', (e) => {
    const l = selLabel();
    if (!l) return;
    const t = e.target;
    if (!t.value.trim()) { l.size = null; t.classList.remove('bad'); }
    else {
      const s = U.parseSize(t.value, S.P.units);
      t.classList.toggle('bad', !s);
      if (!s) return;
      l.size = { w: Math.round(s.w * 100) / 100, h: Math.round(s.h * 100) / 100 };
    }
    labelEdited(l, 'editor');
  });
  $('e-size').addEventListener('blur', (e) => { const l = selLabel(); e.target.value = l?.size ? sizeText(l.size) : ''; e.target.classList.remove('bad'); });
  $('e-icon').addEventListener('click', () => { if (S.sel) openIconPicker(S.sel); });
}

// ---------------------------------------------------------------- selected label preview

function renderSelected(fromEditor = false) {
  const l = selLabel();
  $('sel-edit').style.visibility = l ? '' : 'hidden';
  if (!l) { $('preview').innerHTML = ''; $('warns').innerHTML = ''; return; }
  if (!fromEditor) {
    if (document.activeElement !== $('e-title')) $('e-title').value = l.title;
    if (document.activeElement !== $('e-sub')) $('e-sub').value = l.sub;
    if (document.activeElement !== $('e-size')) $('e-size').value = l.size ? sizeText(l.size) : '';
    $('e-size').placeholder = 'default ' + sizeText(S.P.size);
  }
  $('e-icon').innerHTML = `${iconSVG(l.icon)}<span>${esc(iconName(l.icon) || 'None: click to choose')}</span>`;
  renderPreview();
}

function renderPreview() {
  const l = selLabel();
  if (!l) return;
  const lay = layoutOf(l);
  if (!lay) return;
  const pad = Math.max(lay.w, lay.h) * 0.04 + 2;
  const svg = $('preview');
  const vbH = lay.h + pad * 2 + 6;
  svg.setAttribute('viewBox', `${-pad} ${-lay.h - pad} ${lay.w + pad * 2} ${vbH}`);
  const u = S.P.units;
  const dim = `${U.fmtLen(lay.w, u)} × ${U.fmtLen(lay.h, u)}${u === 'in' ? ' in' : ' mm'}` + (u === 'in' ? `  ·  ${lay.w.toFixed(1)} × ${lay.h.toFixed(1)} mm` : '');
  svg.innerHTML = `<path d="${polysToPath(lay.outline)}" fill="${esc(S.P.print.baseColor)}"${lay.overflow ? ' stroke="#e03131" stroke-width="0.4" stroke-dasharray="1.2 0.8"' : ''}/>` +
    `<path d="${polysToPath(lay.ink)}" fill="${esc(S.P.print.inkColor)}"/>` +
    `<text x="${lay.w / 2}" y="${pad + 3}" text-anchor="middle" font-size="${Math.min(2.6, vbH * 0.07)}" fill="currentColor" opacity=".6" font-family="system-ui, sans-serif">${esc(dim)}</text>`;
  svg.style.color = 'var(--muted)';
  $('warns').innerHTML = lay.warnings.map((w) => `<div class="${lay.overflow && /too long|tall but/.test(w) ? 'bad' : ''}">${esc(w)}</div>`).join('') +
    (lay.lines.some((x) => x.squeeze < 0.999) ? `<div class="muted">Letters squeezed to ${Math.round(Math.min(...lay.lines.map((x) => x.squeeze)) * 100)}% to fit.</div>` : '');
}

function refreshAll() {
  renderSelected();
  refreshThumbs();
  S.plates = null;
  renderPlateCount();
  if (S.view === 'plates') renderPlates();
  schedule3D();
}

// ---------------------------------------------------------------- icon picker

let pickTarget = null, pickCat = 'all';

function openIconPicker(labelId) {
  pickTarget = labelId;
  $('icon-search').value = '';
  renderIconCats();
  renderIconGrid();
  $('dlg-icon').showModal();
  $('icon-search').focus();
}

function renderIconCats() {
  const mine = S.assets.some((a) => a.kind === 'graphic');
  const cats = [{ id: 'all', name: 'All' }, ...(mine ? [{ id: 'mine', name: 'Your graphics' }] : []), ...CATEGORIES];
  if (!cats.some((c) => c.id === pickCat)) pickCat = 'all';
  $('icon-cats').innerHTML = cats.map((c) => `<button class="chip${c.id === pickCat ? ' on' : ''}" data-cat="${c.id}" type="button">${esc(c.name)}</button>`).join('');
}

function renderIconGrid() {
  const q = $('icon-search').value.trim().toLowerCase();
  const cur = S.P.labels.find((l) => l.id === pickTarget)?.icon;
  const list = allIcons().filter((i) => (pickCat === 'all' || i.cat === pickCat) &&
    (!q || q.split(/\s+/).every((w) => (i.name + ' ' + i.id + ' ' + (i.tags || []).join(' ')).toLowerCase().includes(w))));
  const cats = [{ id: 'mine', name: 'Your graphics' }, ...CATEGORIES];
  let h = '';
  for (const c of cats) {
    const items = list.filter((i) => i.cat === c.id);
    if (!items.length) continue;
    if (pickCat === 'all' && !q) h += `<div class="cat-head">${esc(c.name)}</div>`;
    h += items.map((i) => `<button class="icon-cell${i.id === cur ? ' on' : ''}" type="button" data-icon="${esc(i.id)}" title="${esc((i.tags || []).join(', '))}">${iconSVG(i.id)}<span>${esc(i.name)}</span>${i.cat === 'mine' ? '<span class="del" data-del title="Delete this graphic">×</span>' : ''}</button>`).join('');
  }
  $('icon-grid').innerHTML = h || '<p class="muted">No icons match. Add your own below.</p>';
}

function setIcon(id) {
  const l = S.P.labels.find((x) => x.id === pickTarget);
  if (l) { l.icon = id; labelEdited(l); }
  $('dlg-icon').close();
}

function bindIconPicker() {
  $('icon-search').addEventListener('input', renderIconGrid);
  $('icon-cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    pickCat = b.dataset.cat;
    renderIconCats(); renderIconGrid();
  });
  $('icon-grid').addEventListener('click', async (e) => {
    const cell = e.target.closest('[data-icon]');
    if (!cell) return;
    if (e.target.closest('[data-del]')) {
      const id = cell.dataset.icon.slice(2);
      const a = S.assets.find((x) => x.id === id);
      if (!confirm(`Delete "${a?.name}" from your graphics? Labels using it lose their icon.`)) return;
      await removeAsset(id);
      renderIconCats(); renderIconGrid();
      return;
    }
    setIcon(cell.dataset.icon);
  });
  $('icon-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = $('icon-grid').querySelector('[data-icon]'); if (first) setIcon(first.dataset.icon); }
  });
  $('icon-none').addEventListener('click', () => setIcon(''));
  $('gfx-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openGraphic(f); });
}

// ---------------------------------------------------------------- your graphics

const G = { polys: null, img: null };

async function openGraphic(file) {
  G.polys = null; G.img = null;
  $('gfx-name').value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  $('gfx-tags').value = '';
  $('gfx-note').textContent = '';
  const isSvg = /svg/.test(file.type) || /\.svg$/i.test(file.name);
  $('gfx-trace').hidden = isSvg;
  try {
    if (isSvg) {
      const r = svgToPolys(S.wasm, await file.text());
      G.polys = r.polys;
      $('gfx-note').textContent = r.note || 'Filled shapes and strokes are kept; white shapes cut holes.';
    } else {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
      const cv = new OffscreenCanvas(w, h);
      const ctx = cv.getContext('2d');
      ctx.drawImage(bmp, 0, 0, w, h);
      G.img = { data: ctx.getImageData(0, 0, w, h).data, w, h };
      $('gfx-mode').value = hasTransparency(G.img.data) ? 'alpha' : 'dark';
      traceGraphic();
    }
  } catch (e) {
    setStatus('Could not read that graphic: ' + e.message, true);
    return;
  }
  drawGraphicPreview();
  if (!$('dlg-gfx').open) $('dlg-gfx').showModal();
}

function traceGraphic() {
  if (!G.img) return;
  const mode = $('gfx-mode').value;
  const thr = +$('gfx-thr').value;
  const mask = inkMask(G.img.data, G.img.w, G.img.h, { threshold: mode === 'alpha' ? Math.max(1, thr) : thr, mode });
  const rings = traceMask(mask, G.img.w, G.img.h, { smooth: +$('gfx-smooth').value, minArea: 8 });
  G.polys = ringsToPolys(S.wasm, rings);
  $('gfx-note').textContent = G.polys.length ? 'Orange is what prints in the text color. Thin lines under about 1/40 of the image width get lost.' : 'Nothing traced: try another threshold or "Ink is" setting.';
}

function drawGraphicPreview() {
  $('gfx-prev').innerHTML = G.polys?.length ? `<path class="ink" d="${polysToPath(G.polys, 1)}"/>` : '';
  $('gfx-save').disabled = !G.polys?.length;
}

function bindGraphic() {
  let t = 0;
  const retrace = () => { clearTimeout(t); t = setTimeout(() => { traceGraphic(); drawGraphicPreview(); }, 60); };
  for (const id of ['gfx-mode', 'gfx-thr', 'gfx-smooth']) $(id).addEventListener('input', retrace);
  $('gfx-save').addEventListener('click', async () => {
    if (!G.polys?.length) return;
    const a = {
      id: U.uid(), kind: 'graphic', name: $('gfx-name').value.trim() || 'Graphic',
      tags: $('gfx-tags').value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      polys: G.polys.map((r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])),
    };
    await DB.putAsset(a);
    S.assets.push(a);
    $('dlg-gfx').close();
    if (pickTarget) setIcon('u:' + a.id);
    setStatus(`Saved "${a.name}" to your graphics. Use it in a CSV as: ${a.name}`);
  });
}

async function removeAsset(id) {
  await DB.deleteAsset(id);
  S.assets = S.assets.filter((a) => a.id !== id);
  S.iconCache.delete('u:' + id);
  S.fonts.delete('u:' + id); S.fontReady.delete('u:' + id);
  if (fontKey() === 'u:' + id) S.P.style.font = DEFAULT_FONT;
  for (const l of S.P.labels) if (l.icon === 'u:' + id) l.icon = '';
  fillFonts();
  S.layCache.clear();
  await ensureFont();
  syncInputs();
  renderList();
  renderSelected();
  save();
  if ($('dlg-project').open) renderProjectDlg();
}

// ---------------------------------------------------------------- CSV

let csvRows = null;

function csvToLabels(rows, guess) {
  const { map, header } = U.mapColumns(rows);
  const icons = allIcons();
  const body = header ? rows.slice(1) : rows;
  let unmatched = 0;
  const labels = body.map((r) => {
    const get = (f) => (map[f] !== undefined ? String(r[map[f]] ?? '').trim() : '');
    const l = { ...blankLabel(), title: get('title'), sub: get('sub') };
    const ic = get('icon');
    if (ic && !/^(none|-)$/i.test(ic)) {
      const m = U.findIcon(ic, icons);
      if (m) l.icon = m.id; else unmatched++;
    }
    if (!l.icon && guess && !ic) l.icon = U.guessIcon(l.title + ' ' + l.sub, icons)?.id || '';
    const q = parseInt(get('qty'), 10);
    if (q >= 0) l.qty = q;
    let size = get('dims') ? U.parseSize(get('dims'), S.P.units) : null;
    if (!size && get('w') && get('h')) {
      const w = U.parseLen(get('w'), S.P.units), h = U.parseLen(get('h'), S.P.units);
      if (w > 0 && h > 0) size = { w, h };
    }
    if (size) l.size = { w: Math.round(size.w * 100) / 100, h: Math.round(size.h * 100) / 100 };
    return l;
  }).filter((l) => l.title || l.sub || l.icon);
  return { labels, map, header, unmatched };
}

function renderCsvPreview() {
  const text = $('csv-text').value;
  csvRows = text.trim() ? U.parseCSV(text) : null;
  if (!csvRows?.length) { $('csv-prev').innerHTML = ''; $('csv-import').disabled = true; return; }
  const r = csvToLabels(csvRows, $('csv-guess').checked);
  const fields = Object.keys(r.map).map((f) => ({ title: 'title', sub: 'subtitle', icon: 'icon', qty: 'qty', w: 'width', h: 'height', dims: 'size' }[f]));
  const head = r.header ? `Header found: ${fields.join(', ')}.` : 'No header row: reading columns as title, subtitle, icon, qty.';
  const show = r.labels.slice(0, 8);
  $('csv-prev').innerHTML = `<p class="muted">${esc(head)} ${r.labels.length} label${r.labels.length === 1 ? '' : 's'}.${r.unmatched ? ` <b>${r.unmatched}</b> icon name${r.unmatched === 1 ? '' : 's'} not found (left blank).` : ''}</p>` +
    `<table><tr><th>Main text</th><th>Second line</th><th>Icon</th><th>Copies</th><th>Size</th></tr>${show.map((l) =>
      `<tr><td>${esc(l.title)}</td><td>${esc(l.sub)}</td><td>${esc(iconName(l.icon))}</td><td>${l.qty}</td><td>${l.size ? esc(sizeText(l.size)) : '<span class="muted">default</span>'}</td></tr>`).join('')}</table>` +
    (r.labels.length > show.length ? `<p class="muted">…and ${r.labels.length - show.length} more.</p>` : '');
  $('csv-import').disabled = !r.labels.length;
}

function bindCsv() {
  $('btn-csv').addEventListener('click', () => { $('csv-text').value = ''; renderCsvPreview(); $('dlg-csv').showModal(); });
  $('csv-text').addEventListener('input', renderCsvPreview);
  $('csv-guess').addEventListener('change', renderCsvPreview);
  $('csv-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) { $('csv-text').value = await f.text(); renderCsvPreview(); }
  });
  $('csv-template').addEventListener('click', () => {
    const rows = [['title', 'subtitle', 'icon', 'qty', 'size'],
      ['3" Deck Screws', '#9 Torx T25', 'torx', 1, ''],
      ['1/4-20 Hex Nuts', 'Zinc plated', 'hex-nut', 2, ''],
      ['#8 Wood Screws', '1 1/4" Phillips', '', 1, ''],
      ['Wire Nuts', 'Yellow', 'wire-nut', 1, S.P.units === 'in' ? '1 3/4 x 5/8' : '45 x 16']];
    download(new Blob([U.toCSV(rows)], { type: 'text/csv' }), 'labels-template.csv');
  });
  $('csv-import').addEventListener('click', () => {
    if (!csvRows) return;
    const r = csvToLabels(csvRows, $('csv-guess').checked);
    const undo = snapshot();
    const replace = $('csv-mode').value === 'replace';
    if (replace) S.P.labels = r.labels;
    else {
      // drop a lone empty starter label
      if (S.P.labels.length === 1 && !S.P.labels[0].title && !S.P.labels[0].sub && !S.P.labels[0].icon) S.P.labels = [];
      S.P.labels.push(...r.labels);
    }
    S.sel = r.labels[0]?.id || S.sel;
    $('dlg-csv').close();
    labelsChanged();
    setStatus(`Imported ${r.labels.length} label${r.labels.length === 1 ? '' : 's'}.${r.unmatched ? ` ${r.unmatched} icon name${r.unmatched === 1 ? " wasn't" : "s weren't"} found.` : ''}`, false, undo);
  });
  $('btn-csv-out').addEventListener('click', () => {
    const rows = [['title', 'subtitle', 'icon', 'qty', 'size']];
    for (const l of S.P.labels) {
      const ic = l.icon.startsWith('u:') ? iconName(l.icon) : l.icon;
      rows.push([l.title, l.sub, ic, l.qty, l.size ? sizeText(l.size) + (S.P.units === 'in' ? '"' : ' mm') : '']);
    }
    download(new Blob([U.toCSV(rows)], { type: 'text/csv' }), U.fileSafe(S.P.name, 'labels') + '.csv');
  });
}

// ---------------------------------------------------------------- plates

function computePlates() {
  if (S.plates) return S.plates;
  const items = [];
  for (const l of S.P.labels) {
    const sz = sizeOf(l);
    for (let n = 0; n < (l.qty || 0); n++) items.push({ key: l.id + '#' + n, id: l.id, w: sz.w, h: sz.h });
  }
  const r = packPlates(items, S.P.plate);
  S.plates = r;
  if (S.plateIdx >= r.plates.length) S.plateIdx = Math.max(0, r.plates.length - 1);
  return r;
}

function renderPlateCount() {
  const r = computePlates();
  $('plate-count').textContent = r.plates.length || '';
}

function renderPlates() {
  const r = computePlates();
  const P = S.P;
  const n = r.plates.length;
  $('plate-chips').innerHTML = r.plates.map((p, i) => `<button class="chip${i === S.plateIdx ? ' on' : ''}" type="button" data-i="${i}">Plate ${i + 1} · ${p.length}</button>`).join('');
  const total = r.plates.reduce((a, p) => a + p.length, 0);
  $('plate-info').textContent = n ? `${total} label${total === 1 ? '' : 's'} on ${n} plate${n === 1 ? '' : 's'} (${P.plate.w} × ${P.plate.h} mm bed).` + (r.tooBig.length ? ` ${r.tooBig.length} too big for this bed.` : '') : (r.tooBig.length ? 'Every label is too big for this bed.' : 'No labels to print. Set Copies above 0.');
  const svg = $('plate');
  const W = P.plate.w, H = P.plate.h;
  svg.setAttribute('viewBox', `-4 ${-H - 4} ${W + 8} ${H + 8}`);
  let h = `<rect class="p-bed" x="0" y="${-H}" width="${W}" height="${H}" rx="3"/>`;
  for (let x = 50; x < W; x += 50) h += `<line class="p-grid" x1="${x}" y1="${-H}" x2="${x}" y2="0"/>`;
  for (let y = 50; y < H; y += 50) h += `<line class="p-grid" x1="0" y1="${-y}" x2="${W}" y2="${-y}"/>`;
  h += `<rect class="p-usable" x="${P.plate.margin}" y="${-H + P.plate.margin}" width="${W - 2 * P.plate.margin}" height="${H - 2 * P.plate.margin}"/>`;
  const plate = r.plates[S.plateIdx] || [];
  const paths = new Map();
  for (const it of plate) {
    const l = P.labels.find((x) => x.id === it.id);
    const lay = l && layoutOf(l);
    if (!lay) continue;
    if (!paths.has(it.id)) paths.set(it.id, { o: polysToPath(lay.outline, 2), i: polysToPath(lay.ink, 2) });
    const p = paths.get(it.id);
    // label coords are y up; the SVG paths are already flipped (y -> -y)
    const tf = it.rot ? `translate(${it.x + it.w} ${-it.y}) rotate(-90)` : `translate(${it.x} ${-it.y})`;
    h += `<g class="p-item${it.id === S.sel ? ' sel' : ''}" data-id="${it.id}" transform="${tf}"><path class="p-out" d="${p.o}" fill="${esc(P.print.baseColor)}"/><path d="${p.i}" fill="${esc(P.print.inkColor)}"/></g>`;
  }
  svg.innerHTML = h;
}

function bindPlates() {
  $('plate-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    S.plateIdx = +b.dataset.i;
    renderPlates();
    if (S.threeWhat === 'plate') schedule3D();
  });
  $('plate').addEventListener('click', (e) => {
    const g = e.target.closest('.p-item');
    if (g) select(g.dataset.id, { scroll: true });
  });
}

// ---------------------------------------------------------------- building and downloads

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// meshes for one label in the current format: { solid } or { base, ink }
function meshesFor(l, cache) {
  if (cache?.has(l.id)) return cache.get(l.id);
  const lay = layoutOf(l);
  if (!lay || !lay.outline.length) throw new Error(`"${l.title}" has no shape to build.`);
  let m;
  if (S.P.exportFormat === 'stl') m = { solid: buildSolid(S.wasm, lay, S.P.print) };
  else {
    const parts = buildParts(S.wasm, lay, S.P.print);
    m = { base: parts.find((p) => p.role === 'base')?.mesh, ink: parts.find((p) => p.role === 'ink')?.mesh };
  }
  cache?.set(l.id, m);
  return m;
}

const partList = (m) => [
  m.base && { name: 'plate', mesh: m.base, extruder: S.P.print.baseSlot || 1 },
  m.ink && { name: 'text', mesh: m.ink, extruder: S.P.print.inkSlot || 2 },
].filter(Boolean);

const flavorOf = (f) => (f === '3mf-prusa' ? 'prusa' : 'bambu');

// files for one label: [{ name, data }]
function labelFiles(l, stem, cache) {
  const m = meshesFor(l, cache);
  const f = S.P.exportFormat;
  if (f === 'stl') return [{ name: stem + '.stl', data: writeSTL(m.solid, l.title) }];
  if (f.startsWith('3mf')) return [{ name: stem + '.3mf', data: write3MF([{ name: l.title || 'label', parts: partList(m) }], { zipSync, strToU8, title: l.title, flavor: flavorOf(f) }) }];
  return [m.base && { name: stem + '_plate.stl', data: writeSTL(m.base) }, m.ink && { name: stem + '_text.stl', data: writeSTL(m.ink) }].filter(Boolean);
}

// files for one plate
async function plateFiles(idx, stem, cache, progress) {
  const plate = computePlates().plates[idx];
  if (!plate?.length) throw new Error('That plate is empty.');
  const placed = [];
  for (let i = 0; i < plate.length; i++) {
    const it = plate[i];
    const l = S.P.labels.find((x) => x.id === it.id);
    const m = meshesFor(l, cache);
    const place = (mesh) => mesh && (it.rot ? translateMesh(rotateMesh90(mesh), it.x + it.w, it.y) : translateMesh(mesh, it.x, it.y));
    placed.push({ l, it, solid: place(m.solid), base: place(m.base), ink: place(m.ink) });
    progress?.(i + 1, plate.length);
    if (i % 4 === 3) await tick();
  }
  const f = S.P.exportFormat;
  if (f === 'stl') return [{ name: stem + '.stl', data: writeSTL(mergeMeshes(placed.map((p) => p.solid)), stem) }];
  if (f.startsWith('3mf')) {
    const objs = placed.map((p, i) => ({ name: `${i + 1} ${p.l.title || 'label'}`, parts: partList(p) }));
    return [{ name: stem + '.3mf', data: write3MF(objs, { zipSync, strToU8, title: stem, flavor: flavorOf(f) }) }];
  }
  const bases = placed.map((p) => p.base).filter(Boolean), inks = placed.map((p) => p.ink).filter(Boolean);
  return [bases.length && { name: stem + '_plate.stl', data: writeSTL(mergeMeshes(bases)) }, inks.length && { name: stem + '_text.stl', data: writeSTL(mergeMeshes(inks)) }].filter(Boolean);
}

const asBlob = (files, zipName) => {
  if (files.length === 1) return { blob: new Blob([files[0].data]), name: files[0].name };
  const z = {};
  for (const f of files) z[f.name] = f.data;
  return { blob: new Blob([zipSync(z, { level: 6 })], { type: 'application/zip' }), name: zipName };
};

let busy = false;
async function run(fn) {
  if (busy) return;
  busy = true;
  document.body.style.cursor = 'progress';
  try { await ensureFont(); await fn(); }
  catch (e) { setStatus(e.message, true); console.error(e); }
  finally { busy = false; document.body.style.cursor = ''; }
}

function uniqueStem(names, stem) {
  let s = stem, n = 2;
  while (names.has(s)) s = `${stem}_${n++}`;
  names.add(s);
  return s;
}

function bindDownloads() {
  const proj = () => U.fileSafe(S.P.name, 'labels');
  $('dl-label').addEventListener('click', () => run(async () => {
    const l = selLabel();
    if (!l) throw new Error('Select a label first.');
    const stem = U.fileSafe(l.title);
    const { blob, name } = asBlob(labelFiles(l, stem), stem + '.zip');
    download(blob, name);
    setStatus(`Downloaded ${name}.`);
  }));
  $('dl-labels').addEventListener('click', () => run(async () => {
    const files = [], names = new Set(), cache = new Map();
    const list = S.P.labels;
    for (let i = 0; i < list.length; i++) {
      const stem = uniqueStem(names, String(i + 1).padStart(2, '0') + '_' + U.fileSafe(list[i].title));
      files.push(...labelFiles(list[i], stem, cache));
      setStatus(`Building ${i + 1} of ${list.length}…`);
      await tick();
    }
    if (!files.length) throw new Error('No labels to download.');
    const z = {};
    for (const f of files) z[f.name] = f.data;
    download(new Blob([zipSync(z, { level: 6 })], { type: 'application/zip' }), proj() + '_labels.zip');
    setStatus(`Downloaded ${list.length} labels.`);
  }));
  $('dl-plate').addEventListener('click', () => run(async () => {
    const idx = S.plateIdx;
    const n = computePlates().plates.length;
    if (!n) throw new Error('No labels to put on a plate. Set Copies above 0.');
    const stem = `${proj()}_plate${n > 1 ? idx + 1 : ''}`;
    const files = await plateFiles(idx, stem, new Map(), (i, t) => setStatus(`Building plate ${idx + 1}: ${i} of ${t}…`));
    const { blob, name } = asBlob(files, stem + '.zip');
    download(blob, name);
    setStatus(`Downloaded ${name}${n > 1 ? ` (plate ${idx + 1} of ${n}; pick others on the Plates tab)` : ''}.`);
  }));
  $('dl-plates').addEventListener('click', () => run(async () => {
    const r = computePlates();
    if (!r.plates.length) throw new Error('No labels to put on a plate. Set Copies above 0.');
    const cache = new Map(), z = {};
    for (let i = 0; i < r.plates.length; i++) {
      const files = await plateFiles(i, `${proj()}_plate${i + 1}`, cache, (a, t) => setStatus(`Building plate ${i + 1} of ${r.plates.length}: ${a} of ${t}…`));
      for (const f of files) z[f.name] = f.data;
    }
    download(new Blob([zipSync(z, { level: 6 })], { type: 'application/zip' }), proj() + '_plates.zip');
    setStatus(`Downloaded ${r.plates.length} plate${r.plates.length === 1 ? '' : 's'}.`);
  }));
}

// ---------------------------------------------------------------- 3D preview

const T3 = { renderer: null, scene: null, camera: null, controls: null, group: null, timer: 0, framed: '' };

function init3D() {
  if (T3.renderer !== null) return !!T3.renderer;
  const canvas = $('three');
  try {
    T3.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    T3.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  } catch (e) {
    T3.renderer = false;
    $('no-webgl').hidden = false;
    return false;
  }
  T3.scene = new THREE.Scene();
  T3.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
  T3.camera.up.set(0, 0, 1);
  T3.controls = new OrbitControls(T3.camera, canvas);
  T3.controls.enableDamping = true;
  T3.scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-0.5, -0.8, 1.4);
  T3.scene.add(sun);
  T3.group = new THREE.Group();
  T3.scene.add(T3.group);
  new ResizeObserver(resize3D).observe(canvas);
  T3.renderer.setAnimationLoop(() => {
    if (S.view !== 'three') return;
    T3.controls.update();
    T3.renderer.render(T3.scene, T3.camera);
  });
  return true;
}

function resize3D() {
  const r = $('three').getBoundingClientRect();
  if (!r.width || !r.height || !T3.renderer) return;
  T3.renderer.setSize(r.width, r.height, false);
  T3.camera.aspect = r.width / r.height;
  T3.camera.updateProjectionMatrix();
}

function geom3(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.pos, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.idx, 1));
  g.computeVertexNormals();
  return g;
}

function schedule3D() {
  if (S.view !== 'three') return;
  clearTimeout(T3.timer);
  T3.timer = setTimeout(build3D, 120);
}

async function build3D() {
  if (!init3D()) return;
  await ensureFont();
  $('busy').hidden = false;
  await tick();
  try {
    for (const c of [...T3.group.children]) { c.geometry.dispose(); c.material.dispose(); T3.group.remove(c); }
    const pr = S.P.print;
    const mat = (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.65, metalness: 0.02 });
    const add = (mesh, color, dx = 0, dy = 0) => { if (!mesh) return; const m = new THREE.Mesh(geom3(mesh), mat(color)); m.position.set(dx, dy, 0); T3.group.add(m); };
    const addRot = (mesh, color, x, y) => { if (!mesh) return; add(rotateMesh90(mesh), color, x, y); };
    let bw, bh, key;
    if (S.threeWhat === 'plate') {
      const plate = computePlates().plates[S.plateIdx] || [];
      const cache = new Map();
      for (const it of plate) {
        const l = S.P.labels.find((x) => x.id === it.id);
        const lay = layoutOf(l);
        if (!cache.has(l.id)) cache.set(l.id, buildParts(S.wasm, lay, pr));
        for (const p of cache.get(l.id)) {
          const c = p.role === 'ink' ? pr.inkColor : pr.baseColor;
          if (it.rot) addRot(p.mesh, c, it.x + it.w, it.y); else add(p.mesh, c, it.x, it.y);
        }
      }
      bw = S.P.plate.w; bh = S.P.plate.h; key = 'plate' + bw + 'x' + bh;
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.9 }));
      bed.position.set(bw / 2, bh / 2, -0.01);
      T3.group.add(bed);
    } else {
      const l = selLabel();
      const lay = l && layoutOf(l);
      if (lay) {
        // a face-down label is shown the right way up, so you can see its face
        for (const p of buildParts(S.wasm, lay, { ...pr, faceDown: false })) add(p.mesh, p.role === 'ink' ? pr.inkColor : pr.baseColor);
        bw = lay.w; bh = lay.h; key = 'label' + bw + 'x' + bh;
      }
    }
    if (bw && key !== T3.framed) {
      T3.framed = key;
      const c = new THREE.Vector3(bw / 2, bh / 2, 0);
      const dist = Math.max(bw, bh) * 1.25 + 10;
      T3.camera.position.set(c.x - dist * 0.15, c.y - dist * 0.75, dist * 0.8);
      T3.controls.target.copy(c);
      T3.camera.near = dist / 100; T3.camera.far = dist * 20;
      T3.camera.updateProjectionMatrix();
    }
    const down = pr.faceDown && pr.textStyle !== 'raised';
    $('three-note').textContent = !down ? '' : S.threeWhat === 'plate' ? 'As printed: face down, so you see the back.' : 'Shown face up. It prints face down (see This plate).';
  } finally { $('busy').hidden = true; }
}

// ---------------------------------------------------------------- tabs

function showView(v) {
  S.view = v;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.view === v);
  for (const id of ['labels', 'plates', 'three']) $('view-' + id).classList.toggle('active', id === v);
  if (v === 'plates') renderPlates();
  if (v === 'three') { init3D(); resize3D(); build3D(); }
}

// ---------------------------------------------------------------- projects

async function openProject(p) {
  S.P = fixProject(p);
  S.sel = S.P.labels[0]?.id || null;
  S.layCache.clear();
  S.plates = null; S.plateIdx = 0;
  S.filter = ''; $('filter').value = '';
  T3.framed = '';
  $('project-name').textContent = S.P.name;
  await ensureFont();
  syncInputs();
  renderList();
  renderSelected();
  if (S.view === 'plates') renderPlates();
  schedule3D();
  try { localStorage.setItem(LAST_KEY, S.P.id); } catch (e) { /* ignore */ }
  $('save-state').textContent = '';
}

async function renderProjectDlg() {
  $('proj-persist').textContent = DB.persistent
    ? 'Projects save as you go, in this browser. Download a project file to keep a copy or move it to another computer.'
    : 'This browser is blocking storage, so nothing is saved. Download the project file to keep your work.';
  const list = await DB.listProjects();
  const when = (t) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
  $('proj-list').innerHTML = list.map((p) => `<div class="proj-item${p.id === S.P.id ? ' cur' : ''}" data-id="${p.id}">
    <span class="nm">${esc(p.name)}</span><span class="when">${(p.labels || []).length} labels · ${when(p.updated)}</span>
    ${p.id === S.P.id ? '<span class="muted small">open</span>' : '<button class="btn small" data-open type="button">Open</button>'}
    <button class="btn small danger" data-del type="button" title="Delete">×</button></div>`).join('') || '<p class="muted">Nothing saved yet.</p>';
  const assets = S.assets;
  $('asset-list').innerHTML = assets.map((a) => `<div class="proj-item" data-asset="${a.id}">
    ${a.kind === 'graphic' ? iconSVG('u:' + a.id).replace('<svg', '<svg width="22" height="22" style="color:var(--text)"') : '<span class="muted small">Font</span>'}
    <span class="nm">${esc(a.name)}</span><button class="btn small danger" data-adel type="button" title="Delete">×</button></div>`).join('') || '<p class="muted small">None yet. Add fonts in the Text panel and graphics from the icon picker.</p>';
}

function exportProject() {
  const used = new Set();
  if (fontKey().startsWith('u:')) used.add(fontKey().slice(2));
  for (const l of S.P.labels) if (l.icon.startsWith('u:')) used.add(l.icon.slice(2));
  const assets = S.assets.filter((a) => used.has(a.id)).map((a) => (a.kind === 'font' ? { ...a, data: U.b64FromBuf(a.data) } : a));
  return JSON.stringify({ app: '3d-labels', version: 1, project: S.P, assets }, null, 1);
}

async function importProject(text) {
  const j = JSON.parse(text);
  if (j.app !== '3d-labels' || !j.project) throw new Error('That is not a 3D Labels project file.');
  for (const a of j.assets || []) {
    if (S.assets.some((x) => x.id === a.id)) continue;
    const asset = a.kind === 'font' ? { ...a, data: U.bufFromB64(a.data) } : a;
    await DB.putAsset(asset);
    S.assets.push(asset);
  }
  fillFonts();
  const p = j.project;
  const existing = await DB.getProject(p.id);
  if (existing) { p.id = U.uid(); p.name += ' (opened)'; }
  await openProject(p);
  await saveNow();
}

function bindProjects() {
  $('btn-project').addEventListener('click', async () => { await renderProjectDlg(); $('dlg-project').showModal(); });
  $('proj-new').addEventListener('click', async () => {
    const name = prompt('Name for the new project:', 'New labels');
    if (name === null) return;
    await saveNow();
    const p = newProject(name.trim() || 'New labels');
    // keep the look of the current project: size, style, printing, bed
    for (const k of ['units', 'size', 'style', 'print', 'plate', 'exportFormat']) p[k] = structuredClone(S.P[k]);
    await openProject(p);
    await saveNow();
    $('dlg-project').close();
  });
  $('proj-rename').addEventListener('click', async () => {
    const name = prompt('Project name:', S.P.name);
    if (!name?.trim()) return;
    S.P.name = name.trim();
    $('project-name').textContent = S.P.name;
    await saveNow();
    renderProjectDlg();
  });
  $('proj-copy').addEventListener('click', async () => {
    const name = prompt('Name for the copy:', S.P.name + ' copy');
    if (!name?.trim()) return;
    await saveNow();
    const p = structuredClone(S.P);
    p.id = U.uid(); p.name = name.trim(); p.created = Date.now();
    await openProject(p);
    await saveNow();
    renderProjectDlg();
    setStatus(`Now working on "${p.name}".`);
  });
  $('proj-download').addEventListener('click', () => download(new Blob([exportProject()], { type: 'application/json' }), U.fileSafe(S.P.name, 'labels') + '.labels.json'));
  $('proj-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await saveNow(); await importProject(await f.text()); $('dlg-project').close(); setStatus(`Opened "${S.P.name}".`); }
    catch (err) { setStatus('Could not open that file: ' + err.message, true); }
  });
  $('proj-list').addEventListener('click', async (e) => {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.closest('[data-open]')) {
      await saveNow();
      const p = await DB.getProject(id);
      if (p) { await openProject(p); $('dlg-project').close(); }
    } else if (e.target.closest('[data-del]')) {
      const p = await DB.getProject(id);
      if (!confirm(`Delete the project "${p?.name}"? This can't be undone.`)) return;
      await DB.deleteProject(id);
      if (id === S.P.id) {
        const rest = await DB.listProjects();
        await openProject(rest[0] || newProject('My labels', true));
        await saveNow();
      }
      renderProjectDlg();
    }
  });
  $('asset-list').addEventListener('click', async (e) => {
    const item = e.target.closest('[data-asset]');
    if (!item || !e.target.closest('[data-adel]')) return;
    const a = S.assets.find((x) => x.id === item.dataset.asset);
    if (!confirm(`Delete "${a?.name}" from this browser? Labels and projects using it lose it.`)) return;
    await removeAsset(item.dataset.asset);
  });
}

// ---------------------------------------------------------------- help

function renderHelp() {
  $('help-body').innerHTML = `
  <h4>Pick how your printer makes two colors</h4>
  <p><b>One nozzle</b> (Neptune, Ender, MK4 without an MMU…): the label prints in the plate color, the printer pauses, you swap filament, and the rest prints in the text color. The Printing panel shows the layer to pause at. <b>Raised</b> text is the classic look. <b>Recessed</b> prints the text color first as a thin solid layer, then the plate color on top with the letters cut through, so the top is flat and nothing catches.</p>
  <p><b>Multi-material</b> (AMS, CFS, MMU, toolchanger such as the Snapmaker U1 or Prusa XL): no pausing. Download a 3MF and the plate and text arrive as two parts already set to filaments 1 and 2 (change these under Printing). <b>Flush inlay</b> needs this: both colors share the same layers, and the face is perfectly flat. Tick <b>Print face down</b> to get the smooth (or textured) finish of your bed on the face; the label is mirrored so it reads correctly once flipped.</p>
  <h4>Adding the pause</h4>
  <ul>
    <li><b>PrusaSlicer:</b> slice, drag the vertical slider to the height the Printing panel names, click the orange <b>+</b>. That adds an M600 color change; right-click the + for a plain pause.</li>
    <li><b>OrcaSlicer, Bambu Studio, Elegoo Slicer:</b> slice, drag the layer slider to the layer named, right-click the <b>+</b> › <b>Add pause</b>. On a printer with several filaments, choose <b>Change filament</b> instead.</li>
    <li><b>Cura:</b> Extensions › Post Processing › Modify G-Code › Add a script › <b>Pause at height</b>, Pause at: <b>Layer number</b>.</li>
    <li>Klipper printers (Neptune 4, Sovol SV08…) pause on <code>PAUSE</code>; Marlin printers on <code>M600</code> if filament change is turned on, otherwise <code>M0</code>/<code>M25</code>.</li>
  </ul>
  <h4>Getting crisp letters</h4>
  <ul>
    <li>Keep capital letters at least 3 mm tall (2.5 mm with a 0.4 mm nozzle is the edge), and use bold fonts.</li>
    <li>Make the thickness and text height whole layers. <b>Round to layers</b> does it for you.</li>
    <li>Two or three layers of text color (0.4–0.6 mm at 0.2 mm layers) hide the color underneath. Light colors over dark need three.</li>
    <li>Turn on "ironing" for the top of raised text or the face of a recessed label if your slicer has it.</li>
  </ul>
  <h4>Same size on every label</h4>
  <p>Under Text, <b>Always this size</b> keeps the capital-letter height fixed on every label. Long text gets narrower letters first, down to the <b>Squeeze to</b> limit, and is only flagged as too long after that. Rows that don't fit are outlined in red.</p>
  <h4>CSV</h4>
  <p>Columns <code>title</code>, <code>subtitle</code>, <code>icon</code>, <code>qty</code>, <code>size</code> in any order. Icons can be named by id (<code>torx</code>, <code>hex-nut</code>), name, or a search word; leave it empty and tick <b>Guess icons</b> to pick one from the text. <code>|</code> in a title starts a new line.</p>`;
}

// ---------------------------------------------------------------- start

async function start() {
  setStatus('Loading…');
  S.wasm = await ManifoldModule();
  S.wasm.setup();
  DB.askPersist();
  try { S.assets = await DB.listAssets(); } catch (e) { S.assets = []; }
  fillSelects();
  bindSettings();
  bindList();
  bindIconPicker();
  bindGraphic();
  bindCsv();
  bindPlates();
  bindDownloads();
  bindProjects();
  renderHelp();
  for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => showView(t.dataset.view));
  $('three-what').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.threeWhat = b.dataset.v;
    for (const x of $('three-what').children) x.classList.toggle('on', x === b);
    T3.framed = '';
    schedule3D();
  });
  $('btn-help').addEventListener('click', () => $('dlg-help').showModal());
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === d) d.close(); });
  }

  let p = null;
  try {
    const last = localStorage.getItem(LAST_KEY);
    if (last) p = await DB.getProject(last);
    if (!p) p = (await DB.listProjects())[0];
  } catch (e) { /* storage blocked */ }
  const first = !p;
  await openProject(p || newProject('My labels', true));
  if (first) await saveNow();
  setStatus(first ? 'Here are a few sample labels to start from. Everything saves in this browser as you go.' : '');
}

start();
