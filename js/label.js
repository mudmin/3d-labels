// Label layout, 3D parts, print instructions and plate packing. No DOM code.
//
// A label is laid out in mm with its bottom-left corner at the origin, y up. Layout
// produces two polygon sets: the outline (the backing plate) and the ink (text, icon
// and border, in the second color). The 3D build extrudes them according to the
// print style.

import { Arena, polysToCS, mapPolys, polysBounds, meshOf } from './geom.js';

export const DEFAULT_STYLE = {
  font: 'atkinson',
  titleH: 5.5,        // capital-letter height of the main line, mm
  subH: 3.5,          // capital-letter height of the second line, mm
  sizeMode: 'fixed',  // fixed | shrink | fit
  squeeze: 80,        // narrowest letters allowed before a line counts as too long, %
  widthPct: 100,      // letter width, %
  track: 0,           // extra space between letters, mm
  lineGap: 1.6,       // space between lines, mm
  align: 'left',      // left | center | right
  upper: false,       // ALL CAPS
  padding: 2,         // mm from the edge (or border) to the content
  iconSide: 'left',   // left | right | top
  iconPct: 100,       // icon height, % of the content height
  iconGap: 2,         // mm between icon and text
  border: 0,          // border width, mm (0 = none)
  borderInset: 1,     // mm from the edge to the border
};

export const DEFAULT_PRINT = {
  method: 'swap',     // swap (one nozzle: pause and change filament) | multi (AMS, MMU, toolchanger)
  textStyle: 'raised',// raised | inlay | recessed
  faceDown: false,    // print the face on the bed (inlay and recessed only)
  thick: 1.2,         // label thickness: the backing for raised text, the whole label otherwise
  ink: 0.6,           // raised text height, or inlay / recess depth
  layer: 0.2,
  firstLayer: 0.2,
  baseColor: '#1f1f22',
  inkColor: '#ff8a1f',
};

export const DEFAULT_SIZE = { w: 76.2, h: 19, r: 1.5 };

const EPS = 1e-6;

// ---------------------------------------------------------------- layout

function roundRectPolys(w, h, r, segs = 8) {
  r = Math.max(0, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  if (r <= 0.01) return [[[0, 0], [w, 0], [w, h], [0, h]]];
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= segs; i++) {
      const a = (a0 + 90 * i / segs) * Math.PI / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(w - r, r, -90); corner(w - r, h - r, 0); corner(r, h - r, 90); corner(r, r, 180);
  return [pts];
}

const splitLines = (s) => String(s ?? '').split(/\||\n/).map((t) => t.trim()).filter((t, i, a) => t || a.length === 1).filter(Boolean);

// ctx: { wasm, font: LabelFont, icon(id) -> polys in a 100 box (y up) | null }
// Returns { w, h, outline, ink, warnings: [..], overflow, lines: [{text, cap, squeeze}] }
export function layoutLabel(ctx, label, size, style) {
  const { wasm, font } = ctx;
  const st = { ...DEFAULT_STYLE, ...style };
  const w = +size.w, h = +size.h;
  const warnings = [];
  let overflow = false;
  if (!(w > 1 && h > 1)) throw new Error('Label size must be more than 1 mm.');

  const outline = roundRectPolys(w, h, size.r ?? 0);
  const ink = [];

  // border
  let inset = st.padding;
  if (st.border > 0) {
    const bi = st.borderInset, bw = st.border;
    const ro = Math.max(0, (size.r ?? 0) - bi);
    const outer = roundRectPolys(w - 2 * bi, h - 2 * bi, ro).map((r) => r.map(([x, y]) => [x + bi, y + bi]));
    const ri = Math.max(0, ro - bw);
    const inner = roundRectPolys(w - 2 * (bi + bw), h - 2 * (bi + bw), ri).map((r) => r.map(([x, y]) => [x + bi + bw, y + bi + bw]).reverse());
    if (w - 2 * (bi + bw) > 0 && h - 2 * (bi + bw) > 0) ink.push(...outer, ...inner);
    inset += bi + bw;
  }
  let cx0 = inset, cx1 = w - inset;
  const cy0 = inset;
  let cy1 = h - inset;
  let ch = cy1 - cy0;
  if (cx1 - cx0 < 1 || ch < 1) {
    warnings.push('The padding and border leave no room for content.');
    return { w, h, outline, ink: [], warnings, overflow: true, lines: [] };
  }

  const upper = (t) => (st.upper ? t.toUpperCase() : t);
  const titleLines = splitLines(label.title).map(upper);
  const subLines = splitLines(label.sub).map(upper);
  const hasText = titleLines.length + subLines.length > 0;

  // icon
  const iconPolys = label.icon ? ctx.icon(label.icon) : null;
  if (label.icon && !iconPolys) warnings.push(`Icon "${label.icon}" not found.`);
  if (iconPolys?.length) {
    const b = polysBounds(iconPolys);
    const top = hasText && st.iconSide === 'top';
    let boxH, boxW;
    if (!hasText) { boxH = ch * st.iconPct / 100; boxW = cx1 - cx0; }
    // on top, the icon gets up to half the height and the text the rest
    else if (top) { boxH = ch * 0.5 * st.iconPct / 100; boxW = cx1 - cx0; }
    // beside the text, at most 40% of the width so a tall label's icon doesn't crowd it
    else { boxH = Math.min(ch, ch * st.iconPct / 100); boxW = Math.min(boxH, (cx1 - cx0) * 0.4); }
    const s = Math.min(boxW / b.w, boxH / b.h);
    const iw = b.w * s, ih = b.h * s;
    let ix, iy;
    if (top) {
      ix = st.align === 'left' ? cx0 : st.align === 'right' ? cx1 - iw : cx0 + (cx1 - cx0 - iw) / 2;
      iy = cy1 - ih;
    } else {
      if (!hasText) ix = cx0 + (cx1 - cx0 - iw) / 2;
      else if (st.iconSide === 'right') ix = cx1 - iw;
      else ix = cx0;
      iy = cy0 + (ch - ih) / 2;
    }
    ink.push(...mapPolys(iconPolys, s, s, ix - b.x0 * s, iy - b.y0 * s));
    if (top) { cy1 = iy - st.iconGap; ch = cy1 - cy0; }
    else if (hasText) {
      if (st.iconSide === 'right') cx1 = ix - st.iconGap;
      else cx0 = ix + iw + st.iconGap;
    }
    if (ih < 6) warnings.push('The icon is very small; fine details may not print.');
  }

  const lines = [];
  if (hasText) {
    const availW = cx1 - cx0;
    const widthScale = st.widthPct / 100;
    const minSqueeze = Math.min(1, st.squeeze / 100);
    const shape = (text, cap, ws) => font.line(wasm, text, cap, ws, st.track);
    const inkW = (l) => l.x1 - Math.min(0, l.x0);

    // natural widths at nominal size
    const roles = [
      { key: 'title', texts: titleLines, cap: st.titleH },
      { key: 'sub', texts: subLines, cap: st.subH },
    ].filter((r) => r.texts.length);

    // Fit mode scales every line together, keeping the main / second line ratio,
    // until the widest line fills the width or the block fills the height
    if (st.sizeMode === 'fit') {
      const nLines = roles.reduce((a, r) => a + r.texts.length, 0);
      const capSum = roles.reduce((a, r) => a + r.texts.length * r.cap, 0);
      let k = (ch - (nLines - 1) * st.lineGap) / capSum;
      for (const r of roles) {
        const nat = Math.max(...r.texts.map((x) => inkW(shape(x, 1, widthScale))));
        // the squeeze step below narrows letters before anything counts as too long
        if (nat > 0) k = Math.min(k, availW / minSqueeze / (nat * r.cap));
      }
      for (const r of roles) r.cap = Math.max(1, r.cap * k);
    }

    // per role: squeeze letters, then (shrink/fit modes) shrink, until every line fits
    for (const r of roles) {
      let ws = widthScale, cap = r.cap;
      let widest = Math.max(...r.texts.map((x) => inkW(shape(x, cap, ws))));
      if (widest > availW + EPS) {
        const need = availW / widest;
        const sq = Math.max(minSqueeze, need);
        ws *= sq;
        widest *= sq;
        if (widest > availW + EPS) {
          if (st.sizeMode === 'fixed') {
            overflow = true;
            warnings.push(`"${r.texts.join(' ')}" is too long for the label at ${cap.toFixed(1)} mm.`);
          } else {
            cap *= availW / widest;
          }
        }
      }
      r.ws = ws; r.capUsed = cap;
    }

    // vertical fit
    const blockH = () => roles.reduce((a, r) => a + r.texts.length * r.capUsed, 0) + (roles.reduce((a, r) => a + r.texts.length, 0) - 1) * st.lineGap;
    let bh = blockH();
    if (bh > ch + EPS) {
      if (st.sizeMode === 'fixed') {
        overflow = true;
        warnings.push(`The text is ${bh.toFixed(1)} mm tall but only ${ch.toFixed(1)} mm fits: lower the text heights or the line gap, or drop the second line.`);
      } else {
        const gaps = (roles.reduce((a, r) => a + r.texts.length, 0) - 1) * st.lineGap;
        const k = Math.max(0.1, (ch - gaps) / (bh - gaps));
        for (const r of roles) r.capUsed *= k;
        bh = blockH();
      }
    }

    // place lines from the top of the block
    let y = cy0 + (ch + bh) / 2;
    for (const r of roles) {
      for (const text of r.texts) {
        y -= r.capUsed;
        const l = shape(text, r.capUsed, r.ws);
        if (l.missing.length) warnings.push(`This font has no ${[...new Set(l.missing)].join(' ')}.`);
        const lw = inkW(l);
        let x;
        if (st.align === 'center') x = cx0 + (availW - lw) / 2;
        else if (st.align === 'right') x = cx1 - lw;
        else x = cx0;
        x -= Math.min(0, l.x0);
        ink.push(...l.polys.map((ring) => ring.map(([px, py]) => [px + x, py + y])));
        lines.push({ text, cap: r.capUsed, squeeze: r.ws / widthScale, role: r.key });
        y -= st.lineGap;
      }
    }
    const smallest = Math.min(...lines.map((l) => l.cap));
    if (smallest < 2.5) warnings.push(`Text ${smallest.toFixed(1)} mm tall is small for a 0.4 mm nozzle.`);
  }

  // merge and clip everything to the label
  const A = new Arena();
  let inkOut = [];
  try {
    if (ink.length) {
      const cs = A.k(A.k(polysToCS(wasm, ink, 'Positive')).intersect(A.k(polysToCS(wasm, outline))));
      inkOut = cs.toPolygons().map((r) => r.map((p) => [p[0], p[1]]));
    }
  } finally { A.free(); }

  return { w, h, outline, ink: inkOut, warnings: [...new Set(warnings)], overflow, lines };
}

// ---------------------------------------------------------------- 3D

// Height ranges each color occupies, bottom up, for the chosen style.
// Returns { base: [[z0,z1]...], ink: [[z0,z1]...], total, multiOnly }
export function stack(print) {
  const p = { ...DEFAULT_PRINT, ...print };
  const T = +p.thick, D = Math.min(+p.ink, p.textStyle === 'raised' ? Infinity : T - 0.2);
  const down = p.faceDown && p.textStyle !== 'raised';
  if (p.textStyle === 'raised') return { base: [[0, T]], ink: [[T, T + D]], total: T + D, multiOnly: false, D, T, down: false };
  if (p.textStyle === 'inlay') {
    return down
      ? { base: [[0, T]], ink: [[0, D]], total: T, multiOnly: true, D, T, down }
      : { base: [[0, T]], ink: [[T - D, T]], total: T, multiOnly: true, D, T, down };
  }
  // recessed: the ink color is a solid layer under a top layer with the letters cut through
  return down
    ? { base: [[0, D]], ink: [[D, T]], total: T, multiOnly: false, D, T, down }
    : { base: [[T - D, T]], ink: [[0, T - D]], total: T, multiOnly: false, D, T, down };
}

// Build the printable parts of one laid-out label.
// Returns [{ role: 'base' | 'ink', mesh }] in mm, sitting on z = 0, footprint 0..w x 0..h.
// With merge, returns a single { role: 'solid' } part.
export function buildParts(wasm, lay, print, { merge = false } = {}) {
  const p = { ...DEFAULT_PRINT, ...print };
  const s = stack(p);
  const { T, D } = s;
  const A = new Arena();
  try {
    const outline = A.k(polysToCS(wasm, lay.outline));
    const hasInk = lay.ink.length > 0;
    const inkCS = hasInk ? A.k(polysToCS(wasm, lay.ink)) : null;
    let base, ink = null;
    if (p.textStyle === 'raised') {
      base = A.k(outline.extrude(T));
      if (hasInk) ink = A.k(A.k(inkCS.extrude(D)).translate([0, 0, T]));
    } else if (p.textStyle === 'inlay') {
      base = A.k(outline.extrude(T));
      if (hasInk) {
        ink = A.k(A.k(inkCS.extrude(D)).translate([0, 0, T - D]));
        base = A.k(base.subtract(A.k(A.k(inkCS.extrude(D + 1)).translate([0, 0, T - D]))));
      }
    } else {
      // recessed
      const top = hasInk ? A.k(outline.subtract(inkCS)) : outline;
      base = A.k(A.k(top.extrude(D)).translate([0, 0, T - D]));
      ink = A.k(outline.extrude(T - D));
    }
    if (s.down) {
      const flip = (m) => A.k(A.k(m.rotate([0, 180, 0])).translate([lay.w, 0, T]));
      base = flip(base);
      if (ink) ink = flip(ink);
    }
    if (merge) return [{ role: 'solid', mesh: meshOf(ink ? A.k(base.add(ink)) : base) }];
    const parts = [{ role: 'base', mesh: meshOf(base) }];
    if (ink && !ink.isEmpty()) parts.push({ role: 'ink', mesh: meshOf(ink) });
    return parts;
  } finally { A.free(); }
}

// One solid, for printing with a filament change (both colors come from one nozzle,
// so the slicer only needs the shape).
export const buildSolid = (wasm, lay, print) => buildParts(wasm, lay, print, { merge: true })[0].mesh;

// ---------------------------------------------------------------- print instructions

// Layer maths for a color change at height z: the change goes before layer `layer`,
// the first layer that prints above z.
export function layerAt(z, layer, first) {
  if (z < first - EPS) return { layer: 2, aligned: false, z, printedZ: first };
  const below = 1 + Math.floor((z - first) / layer + 1e-6);
  const top = first + (below - 1) * layer;
  return { layer: below + 1, aligned: Math.abs(top - z) < 0.005, z, printedZ: top, nextZ: top + layer };
}

export function totalLayers(z, layer, first) {
  return z <= first ? 1 : 1 + Math.round((z - first) / layer);
}

// Everything the printing panel shows: color changes, layer counts, warnings.
export function printPlan(print) {
  const p = { ...DEFAULT_PRINT, ...print };
  const s = stack(p);
  const L = +p.layer, L1 = +p.firstLayer;
  const notes = [];
  const swaps = [];
  if (!(L > 0 && L1 > 0)) return { s, swaps, notes: ['Enter a layer height.'], layers: 0 };
  const layers = totalLayers(s.total, L, L1);
  const offGrid = (z) => Math.abs((z - L1) / L - Math.round((z - L1) / L)) > 0.02 && Math.abs(z - L1) > 0.005;

  if (s.multiOnly && p.method === 'swap') {
    notes.push('A flush inlay has both colors on the same layers, so it needs a multi-material printer (AMS, MMU, toolchanger). Use raised or recessed text to print with one filament change.');
  }
  if (!s.multiOnly) {
    // the single height where the color changes
    const first = s.base[0][0] === 0 ? 'base' : 'ink';
    const z = first === 'base' ? s.base[0][1] : s.ink[0][1];
    const at = layerAt(z, L, L1);
    swaps.push({ ...at, from: first, to: first === 'base' ? 'ink' : 'base' });
    if (!at.aligned) notes.push(`${z.toFixed(2)} mm isn't a whole number of ${L} mm layers (after a ${L1} mm first layer), so the slicer will round it. Round to layers fixes this.`);
  }
  if (offGrid(s.total)) notes.push(`The total height ${s.total.toFixed(2)} mm doesn't land on a layer.`);
  if (s.D < 2 * L - EPS) notes.push(`The ${p.textStyle === 'raised' ? 'text height' : 'depth'} is under two layers; three layers (${(3 * L).toFixed(2)} mm) hide the color underneath better.`);
  return { s, swaps, notes, layers };
}

// Thickness and ink height rounded to whole layers.
export function roundToLayers(print) {
  const p = { ...DEFAULT_PRINT, ...print };
  const L = +p.layer, L1 = +p.firstLayer;
  const snapZ = (z) => (z <= L1 ? L1 : L1 + Math.max(0, Math.round((z - L1) / L)) * L);
  const snapD = (d) => Math.max(L, Math.round(d / L) * L);
  const r = (v) => Math.round(v * 1000) / 1000;
  if (p.textStyle === 'raised') return { thick: r(snapZ(p.thick)), ink: r(snapD(p.ink)) };
  const thick = r(snapZ(p.thick));
  let ink = r(snapD(p.ink));
  // keep the color change itself on a layer boundary
  if (p.textStyle === 'recessed' && !p.faceDown) ink = r(thick - snapZ(thick - ink));
  if (p.textStyle === 'recessed' && p.faceDown) ink = r(snapZ(ink));
  return { thick, ink: Math.min(ink, r(thick - L)) };
}

// ---------------------------------------------------------------- plates

// MaxRects (best short side fit): fills odd corners, turning labels where that helps.
function maxRects(list, W, H, g) {
  const plates = [];
  const contains = (a, b) => b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;
  const newPlate = () => ({ items: [], free: [{ x: 0, y: 0, w: W + g, h: H + g }] });
  const place = (pl, r) => {
    const out = [];
    for (const f of pl.free) {
      if (r.x >= f.x + f.w - EPS || r.x + r.w <= f.x + EPS || r.y >= f.y + f.h - EPS || r.y + r.h <= f.y + EPS) { out.push(f); continue; }
      if (r.x > f.x + EPS) out.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w - EPS) out.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y + EPS) out.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h - EPS) out.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    pl.free = out.filter((f, i) => !out.some((o, j) => j !== i && contains(o, f) && (!contains(f, o) || j < i)));
  };
  for (const it of list) {
    let best = null;
    for (const pl of plates) {
      for (const f of pl.free) {
        for (const rot of [false, true]) {
          const iw = (rot ? it.h : it.w) + g, ih = (rot ? it.w : it.h) + g;
          if (iw > f.w + EPS || ih > f.h + EPS) continue;
          const short = Math.min(f.w - iw, f.h - ih) + (rot ? 0.01 : 0), long = Math.max(f.w - iw, f.h - ih);
          if (!best || short < best.short - EPS || (Math.abs(short - best.short) < EPS && long < best.long)) best = { pl, f, rot, iw, ih, short, long };
        }
      }
      if (best) break; // first plate with room
    }
    if (!best) {
      const pl = newPlate();
      plates.push(pl);
      const rot = it.w > W + EPS || it.h > H + EPS;
      best = { pl, f: pl.free[0], rot, iw: (rot ? it.h : it.w) + g, ih: (rot ? it.w : it.h) + g };
    }
    const r = { x: best.f.x, y: best.f.y, w: best.iw, h: best.ih };
    best.pl.items.push({ ...it, x: r.x, y: r.y, w: r.w - g, h: r.h - g, rot: best.rot });
    place(best.pl, r);
  }
  return plates.map((p) => p.items);
}

// Pack labels onto beds. items: [{ key, w, h }]. Returns
// { plates: [[{ ...item, x, y, w, h, rot }]], tooBig: [key] } with x, y the bottom-left
// corner on the bed (mm), w, h as placed, and rot true when the label is turned 90°.
// Tries tidy rows (as they are, and all turned) and MaxRects, and keeps the layout
// with the fewest plates, preferring rows on a tie.
export function packPlates(items, bed) {
  const W = bed.w - 2 * bed.margin, H = bed.h - 2 * bed.margin, g = bed.gap;
  const fits = (w, h) => w <= W + EPS && h <= H + EPS;
  const tooBig = items.filter((it) => !fits(it.w, it.h) && !fits(it.h, it.w)).map((it) => it.key);
  const ok = items.filter((it) => fits(it.w, it.h) || fits(it.h, it.w));

  const rows = (turnAll) => {
    const placed = [];
    const list = ok.map((it) => {
      const turn = turnAll ? fits(it.h, it.w) : !fits(it.w, it.h);
      return turn ? { ...it, w: it.h, h: it.w, rot: true } : { ...it, rot: false };
    });
    // tallest rows first so short labels fill the end of a row
    list.sort((a, b) => b.h - a.h || b.w - a.w);
    let plate = [], x = 0, y = 0, rowH = 0;
    for (const it of list) {
      if (x > 0 && x + it.w > W + EPS) { y += rowH + g; x = 0; rowH = 0; }
      if (y + it.h > H + EPS) { placed.push(plate); plate = []; x = 0; y = 0; rowH = 0; }
      plate.push({ ...it, x, y });
      x += it.w + g;
      rowH = Math.max(rowH, it.h);
    }
    if (plate.length) placed.push(plate);
    return placed;
  };

  const sorted = ok.map((it) => ({ ...it, rot: false })).sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  const options = [rows(false), rows(true), maxRects(sorted, W, H, g)];
  let plates = options.reduce((best, o) => (o.length < best.length ? o : best));
  // center each plate's block on the bed
  plates = plates.map((pl) => {
    const bw = Math.max(...pl.map((i) => i.x + i.w)), bh = Math.max(...pl.map((i) => i.y + i.h));
    const ox = bed.margin + (W - bw) / 2, oy = bed.margin + (H - bh) / 2;
    return pl.map((i) => ({ ...i, x: i.x + ox, y: i.y + oy }));
  });
  return { plates, tooBig };
}
