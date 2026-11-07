// Build labels from the command line, to check layout and geometry.
//   node tools/try-label.mjs <outdir> ["Title" "Subtitle" icon [w h]] [--style=raised|inlay|recessed] [--down]
// Writes preview.svg/png, label.stl and label.3mf (base and text as separate parts).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import ManifoldModule from '../vendor/manifold/manifold.js';
import { zipSync, strToU8 } from '../vendor/fflate/fflate.js';
import { LabelFont, BUILTIN_FONTS } from '../js/fonts.js';
import { ICONS } from '../js/icons.js';
import { iconPolys } from '../js/iconkit.js';
import { layoutLabel, buildParts, printPlan, DEFAULT_STYLE, DEFAULT_PRINT } from '../js/label.js';
import { polysToPath, writeSTL, write3MF } from '../js/geom.js';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const pos = args.filter((a) => !a.startsWith('--'));
const out = resolve(pos[0] || 'out');
mkdirSync(out, { recursive: true });
const [title = '3" Deck Screws', sub = '#9 Torx T25', icon = 'torx', w = '76.2', h = '19'] = pos.slice(1);

const wasm = await ManifoldModule();
wasm.setup();
const fontDef = BUILTIN_FONTS.find((f) => f.id === (flags.font || 'atkinson'));
const buf = readFileSync(new URL('../' + fontDef.file, import.meta.url));
const font = new LabelFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), fontDef.name);
const iconCache = new Map();
const ctx = {
  wasm, font,
  icon: (id) => {
    if (!iconCache.has(id)) { const d = ICONS.find((i) => i.id === id); iconCache.set(id, d ? iconPolys(wasm, d.draw) : null); }
    return iconCache.get(id);
  },
};
const style = { ...DEFAULT_STYLE, sizeMode: flags.mode || 'fixed', border: +(flags.border || 0), align: flags.align || 'left', iconSide: flags.icon || 'left' };
const print = { ...DEFAULT_PRINT, textStyle: flags.style || 'raised', faceDown: !!flags.down };
const t0 = performance.now();
const lay = layoutLabel(ctx, { title, sub, icon }, { w: +w, h: +h, r: 1.5 }, style);
const t1 = performance.now();
const parts = buildParts(wasm, lay, print);
const t2 = performance.now();
console.log(`layout ${(t1 - t0).toFixed(1)} ms, build ${(t2 - t1).toFixed(1)} ms`);
console.log('warnings:', lay.warnings, 'lines:', lay.lines);
console.log('plan:', JSON.stringify(printPlan(print)));
for (const p of parts) console.log(p.role, p.mesh.idx.length / 3, 'triangles');

const S = 10;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lay.w * S + 40}" height="${lay.h * S + 40}" viewBox="-2 ${-lay.h - 2} ${lay.w + 4} ${lay.h + 4}">` +
  `<rect x="-2" y="${-lay.h - 2}" width="${lay.w + 4}" height="${lay.h + 4}" fill="#eee"/>` +
  `<path d="${polysToPath(lay.outline)}" fill="${print.baseColor}"/><path d="${polysToPath(lay.ink)}" fill="${print.inkColor}"/></svg>`;
writeFileSync(out + '/preview.svg', svg);
writeFileSync(out + '/label.stl', writeSTL(parts.map((p) => p.mesh)));
writeFileSync(out + '/label.3mf', write3MF([{ name: title, parts: parts.map((p) => ({ name: p.role === 'ink' ? 'text' : 'base', mesh: p.mesh, extruder: p.role === 'ink' ? 2 : 1 })) }], { zipSync, strToU8 }));
try {
  execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${Math.round(lay.w * S + 40)},${Math.round(lay.h * S + 40)}`,
    `--screenshot=${out}/preview.png`, 'file://' + out + '/preview.svg'], { stdio: 'ignore', timeout: 60000 });
} catch (e) { /* no chrome */ }
console.log('->', out);
