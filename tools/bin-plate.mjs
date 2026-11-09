// Build print-ready plates of bin labels from a small JSON list, laid out for the Snapmaker U1.
//   node tools/bin-plate.mjs spec.json [outdir]
//
// spec.json:
// {
//   "name": "5-bin set 3",              // file names come from this
//   "preset": "tipout-5",               // a size preset id from js/presets.js (or "size": { "w": mm, "h": mm })
//   "labels": [
//     { "title": "3\" Deck Screws", "sub": "Torx T25", "icon": "torx" },
//     { "title": "2\" Drywall", "sub": "Phillips", "icon": "phillips", "qty": 2 }
//   ],
//   "style": { ... },                   // optional overrides of the house style below
//   "print": { ... }                    // optional overrides of the house print settings below
// }
//
// House defaults, from the labels printed so far:
//   - raised text: 1.6 mm black plate, letters 0.6 mm (3 layers) on top, one tool change, printed face up.
//     2 layers of letters looked thin. Slice with Top shell layers 3, Bottom 2, both shell thicknesses 0.
//   - Atkinson Hyperlegible Bold, main line 7.75 mm, second line 4.75 mm, icon on top, centered.
//     If a title doesn't fit, the text shrinks for the whole plate, so put words like "Coarse"
//     on the second line instead ("2 1/2\" Drywall" / "Coarse, Phillips").
//   - U1 bed 270 x 270: the front 15 mm stays clear for the purge lines, and a 65 x 60 mm corner at
//     the back right stays clear for the prime tower. Spare width on the right takes labels turned
//     sideways.
// Writes <name>_U1.3mf (one per plate), <name>.labels.json (open it in the app), and preview.svg/png.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ManifoldModule from '../vendor/manifold/manifold.js';
import { zipSync, strToU8 } from '../vendor/fflate/fflate.js';
import { LabelFont } from '../js/fonts.js';
import { ICONS } from '../js/icons.js';
import { iconPolys } from '../js/iconkit.js';
import { layoutLabel, buildParts, DEFAULT_STYLE, DEFAULT_PRINT } from '../js/label.js';
import { polysToPath, write3MF, translateMesh, rotateMesh90 } from '../js/geom.js';
import { findPreset } from '../js/presets.js';

const HOUSE_STYLE = { font: 'atkinson', sizeMode: 'fixed', titleH: 7.75, subH: 4.75, squeeze: 85, lineGap: 2.6, align: 'center', iconSide: 'top', iconPct: 100 };
const HOUSE_PRINT = { method: 'multi', textStyle: 'raised', faceDown: false, thick: 1.6, ink: 0.6, layer: 0.2, firstLayer: 0.2, baseColor: '#1f1f22', inkColor: '#ff8a1f', baseSlot: 1, inkSlot: 2 };
const BED = 270, MARGIN = 4, GAP = 4, FRONT = 15, TOWER = { w: 65, h: 60 };

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = resolve(process.argv[3] || '.');
mkdirSync(out, { recursive: true });
const slug = (spec.name || 'labels').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

const pre = spec.preset ? findPreset(spec.preset) : null;
if (spec.preset && !pre) throw new Error('unknown preset ' + spec.preset);
const size = { w: spec.size?.w ?? pre.w, h: spec.size?.h ?? pre.h, r: spec.size?.r ?? 1.5 };
const print = { ...DEFAULT_PRINT, ...HOUSE_PRINT, ...spec.print };

const wasm = await ManifoldModule();
wasm.setup();
const buf = readFileSync(new URL('../fonts/AtkinsonHyperlegible-Bold.ttf', import.meta.url));
const font = new LabelFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const iconCache = new Map();
const ctx = { wasm, font, icon: (id) => {
  if (!iconCache.has(id)) {
    const icon = ICONS.find((i) => i.id === id);
    if (!icon) throw new Error('unknown icon ' + id);
    iconCache.set(id, iconPolys(wasm, icon.draw));
  }
  return iconCache.get(id);
} };

// the house size, or the largest size (0.25 mm steps) where every label fits, second line at 60%
let style = null;
const want = { ...DEFAULT_STYLE, ...HOUSE_STYLE, ...spec.style };
for (let t = want.titleH; t >= 3 && !style; t -= 0.25) {
  const st = t === want.titleH ? want : { ...want, titleH: t, subH: Math.round(t * 0.6 * 4) / 4 };
  const bad = spec.labels.filter((l) => layoutLabel(ctx, l, size, st).overflow);
  if (!bad.length) style = st;
  else if (t === want.titleH) console.log('Too long at', t, 'mm:', bad.map((l) => l.title).join(' | '), '-> shrinking the whole plate');
}
console.log('text: main', style.titleH, 'mm, second', style.subH, 'mm');
const lays = spec.labels.map((l) => layoutLabel(ctx, l, size, style));
lays.forEach((lay, i) => { if (lay.warnings.length) console.log('  ', spec.labels[i].title, lay.warnings.join('; ')); });

// spots on one plate: a grid from the front, then a sideways column in the spare width on the right
const clearOfTower = (x, y, w, h) => x + w <= BED - TOWER.w || y + h <= BED - TOWER.h;
const spots = [];
const { w, h } = size;
const cols = Math.floor((BED - 2 * MARGIN + GAP) / (w + GAP));
const rows = Math.floor((BED - FRONT - MARGIN + GAP) / (h + GAP));
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const x = MARGIN + c * (w + GAP), y = FRONT + r * (h + GAP);
  if (clearOfTower(x, y, w, h)) spots.push({ x, y });
}
const sideX = MARGIN + cols * (w + GAP);
if (BED - MARGIN - sideX >= h) {
  for (let r = 0; ; r++) {
    const y = FRONT + r * (w + GAP);
    if (y + w > BED - MARGIN) break;
    if (clearOfTower(sideX, y, h, w)) spots.push({ x: sideX, y, rot: true });
  }
}
if (!spots.length) throw new Error('label too big for the bed');

const copies = spec.labels.flatMap((l, i) => Array.from({ length: l.qty || 1 }, () => i));
const plates = [];
for (let k = 0; k < copies.length; k += spots.length) plates.push(copies.slice(k, k + spots.length));
console.log(copies.length, 'labels,', spots.length, 'per plate,', plates.length, plates.length === 1 ? 'plate' : 'plates');

const partsOf = lays.map((lay) => buildParts(wasm, lay, print));
plates.forEach((plate, p) => {
  const objs = plate.map((i, n) => {
    const s = spots[n], l = spec.labels[i];
    return { name: l.title + (l.sub ? ' ' + l.sub : ''), parts: partsOf[i].map((part) => ({
      name: part.role === 'ink' ? 'text' : 'plate',
      extruder: part.role === 'ink' ? print.inkSlot : print.baseSlot,
      color: part.role === 'ink' ? print.inkColor : print.baseColor,
      mesh: s.rot ? translateMesh(rotateMesh90(part.mesh), s.x + h, s.y) : translateMesh(part.mesh, s.x, s.y),
    })) };
  });
  const file = `${out}/${slug}${plates.length > 1 ? '-' + (p + 1) : ''}_U1.3mf`;
  writeFileSync(file, write3MF(objs, { zipSync, strToU8, title: spec.name || 'labels' }));
  console.log('->', file);
});

// a project file the app opens (Projects > Open a project file)
const uid = () => Math.random().toString(36).slice(2, 10);
const project = {
  id: uid(), name: spec.name || 'labels', created: Date.now(), updated: Date.now(), version: 1, units: 'in', exportFormat: '3mf',
  size: { ...size, preset: spec.preset || null }, style, print,
  plate: { printer: 'Snapmaker / U1 (toolchanger)', w: BED, h: BED, margin: MARGIN, gap: GAP },
  labels: spec.labels.map(({ qty, ...l }) => ({ id: uid(), qty: qty || 1, size: null, sub: '', ...l })),
};
writeFileSync(`${out}/${slug}.labels.json`, JSON.stringify({ app: '3d-labels', version: 1, project, assets: [] }, null, 1));

// preview of the first plate, looking down with the back of the bed at the top
let body = `<rect width="${BED}" height="${BED}" fill="#d8d8d8"/><rect x="${BED - TOWER.w}" y="${BED - TOWER.h}" width="${TOWER.w - 4}" height="${TOWER.h - 4}" fill="none" stroke="#888" stroke-dasharray="3 3"/>`;
plates[0].forEach((i, n) => {
  const s = spots[n], lay = lays[i];
  const tf = s.rot ? `translate(${s.x + h} ${s.y}) rotate(90)` : `translate(${s.x} ${s.y})`;
  body += `<g transform="${tf}"><path d="${polysToPath(lay.outline)}" fill="${print.baseColor}" transform="scale(1,-1)"/><path d="${polysToPath(lay.ink)}" fill="${print.inkColor}" transform="scale(1,-1)"/></g>`;
});
const svg = `${out}/preview.svg`;
writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1100" viewBox="-2 -272 274 274"><g transform="scale(1,-1)">${body}</g></svg>`);
try {
  const { chromium } = createRequire(import.meta.url)('/var/www/html/claude-browser/node_modules/playwright');
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.goto('file://' + svg);
  await (await pg.$('svg')).screenshot({ path: `${out}/preview.png` });
  await b.close();
  console.log('-> preview.png');
} catch (e) { console.log('(no preview.png: Playwright not available)'); }
