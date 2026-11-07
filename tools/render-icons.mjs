// Draw every built-in icon onto one contact sheet, to check them by eye.
//   node tools/render-icons.mjs [out.svg] [filter]
// Writes an SVG, and a PNG next to it when Chrome is installed. `filter` keeps icons
// whose id contains it.

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import ManifoldModule from '../vendor/manifold/manifold.js';
import { ICONS, CATEGORIES } from '../js/icons.js';
import { iconPolys } from '../js/iconkit.js';
import { polysToPath, polysBounds } from '../js/geom.js';

const out = resolve(process.argv[2] || 'icons.svg');
const filter = process.argv[3] || '';
const wasm = await ManifoldModule();
wasm.setup();

const list = ICONS.filter((i) => i.id.includes(filter));
const cell = 130, cols = 10;
const rows = Math.ceil(list.length / cols);
let body = '';
const seen = new Set();
list.forEach((icon, n) => {
  if (seen.has(icon.id)) console.error('duplicate id', icon.id);
  seen.add(icon.id);
  if (!CATEGORIES.some((c) => c.id === icon.cat)) console.error('unknown category', icon.id, icon.cat);
  const x = (n % cols) * cell, y = Math.floor(n / cols) * cell;
  let d = '', note = '';
  try {
    const polys = iconPolys(wasm, icon.draw);
    d = polysToPath(polys, 2);
    const b = polysBounds(polys);
    if (!b) note = 'EMPTY';
    else if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > 100.5 || b.y1 > 100.5) note = 'OUT OF BOX';
  } catch (e) { note = 'ERROR ' + e.message; console.error(icon.id, e); }
  // dark label background, orange ink: what a printed label looks like
  body += `<g transform="translate(${x},${y})"><rect x="5" y="5" width="${cell - 10}" height="${cell - 10}" rx="6" fill="#222"/>` +
    `<rect x="15" y="10" width="100" height="100" fill="none" stroke="#444" stroke-dasharray="2 3"/>` +
    `<path transform="translate(15,110)" d="${d}" fill="#ff8a1f" fill-rule="nonzero"/>` +
    `<text x="${cell / 2}" y="${cell - 8}" font-size="10" fill="#ddd" text-anchor="middle" font-family="sans-serif">${icon.id}</text>` +
    (note ? `<text x="${cell / 2}" y="22" font-size="11" fill="#f55" text-anchor="middle" font-family="sans-serif">${note}</text>` : '') + '</g>';
});
const W = cols * cell, H = rows * cell;
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#111"/>${body}</svg>`);
console.log(`${list.length} icons -> ${out}`);

try {
  const png = out.replace(/\.svg$/, '') + '.png';
  execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`,
    `--screenshot=${png}`, 'file://' + out], { stdio: 'ignore', timeout: 60000 });
  console.log('png ->', png);
} catch (e) { console.log('(no PNG: Chrome not available)'); }
