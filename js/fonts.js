// Fonts and text outlines. Glyphs are flattened once per font and cached, then laid out
// into polygons in mm. No DOM code.

import opentype from '../vendor/opentype/opentype.module.js';
import { Arena, parsePathD, ringArea } from './geom.js';

// Bundled fonts (all SIL Open Font License, see fonts/OFL-*.txt).
export const BUILTIN_FONTS = [
  { id: 'atkinson', name: 'Atkinson Hyperlegible Bold', file: 'fonts/AtkinsonHyperlegible-Bold.ttf', note: 'Very legible, wide' },
  { id: 'barlow', name: 'Barlow Bold', file: 'fonts/Barlow-Bold.ttf', note: 'Clean, medium width' },
  { id: 'barlow-semi', name: 'Barlow Semi Condensed Bold', file: 'fonts/BarlowSemiCondensed-Bold.ttf', note: 'A little narrower' },
  { id: 'barlow-cond', name: 'Barlow Condensed Bold', file: 'fonts/BarlowCondensed-Bold.ttf', note: 'Narrow: fits long names' },
  { id: 'archivo-black', name: 'Archivo Black', file: 'fonts/ArchivoBlack-Regular.ttf', note: 'Heavy, very bold' },
  { id: 'space-mono', name: 'Space Mono Bold', file: 'fonts/SpaceMono-Bold.ttf', note: 'Monospaced: sizes line up' },
  { id: 'stencil', name: 'Stardos Stencil Bold', file: 'fonts/StardosStencil-Bold.ttf', note: 'Stencil look' },
];
export const DEFAULT_FONT = 'atkinson';

export class LabelFont {
  constructor(buffer, name) {
    this.font = opentype.parse(buffer);
    this.name = name || this.font.names?.fullName?.en || this.font.names?.fontFamily?.en || 'Font';
    this.em = this.font.unitsPerEm || 1000;
    const os2 = this.font.tables.os2;
    let cap = os2?.sCapHeight;
    if (!(cap > 0)) {
      const h = this.font.charToGlyph('H');
      cap = h && h.index ? h.getBoundingBox().y2 : this.em * 0.7;
    }
    this.cap = cap;
    this.cache = new Map();
  }

  // polygons of one glyph in font units, y up, baseline at 0
  glyphPolys(wasm, glyph) {
    let polys = this.cache.get(glyph.index);
    if (polys) return polys;
    const d = glyph.getPath(0, 0, this.em).toPathData(2);
    const rings = parsePathD(d, this.em * 0.008).map((r) => r.map(([x, y]) => [x, -y]));
    polys = [];
    if (rings.length) {
      const A = new Arena();
      try {
        // font outlines may overlap and wind either way; non-zero is the TrueType rule
        const cs = A.k(new wasm.CrossSection(rings, 'NonZero'));
        polys = cs.toPolygons().map((r) => r.map((p) => [p[0], p[1]])).filter((r) => Math.abs(ringArea(r)) > 1e-3);
      } finally { A.free(); }
    }
    this.cache.set(glyph.index, polys);
    return polys;
  }

  // Lay out one line. capMM is the height of a capital letter; widthScale squeezes or
  // widens letters; trackMM adds space between letters.
  // Returns { polys, width, x0, x1 (ink extent), missing: [chars] } with the baseline at
  // y = 0 and the pen starting at x = 0.
  line(wasm, text, capMM, widthScale = 1, trackMM = 0) {
    const s = capMM / this.cap;
    const glyphs = this.font.stringToGlyphs(text);
    const polys = [];
    const missing = [];
    let x = 0, x0 = Infinity, x1 = -Infinity;
    const chars = [...text];
    glyphs.forEach((g, i) => {
      if (!g.index && chars[i] && chars[i].trim()) missing.push(chars[i]);
      const gp = this.glyphPolys(wasm, g);
      for (const r of gp) {
        const out = r.map(([gx, gy]) => [(x + gx * s) * 1, gy * s]);
        polys.push(out);
        for (const [px] of out) { if (px < x0) x0 = px; if (px > x1) x1 = px; }
      }
      let adv = (g.advanceWidth || 0) * s;
      if (i < glyphs.length - 1) adv += this.font.getKerningValue(g, glyphs[i + 1]) * s;
      x += adv + trackMM;
    });
    const width = Math.max(0, x - trackMM);
    // squeeze about the pen origin
    if (widthScale !== 1) {
      for (const r of polys) for (const p of r) p[0] *= widthScale;
      x0 *= widthScale; x1 *= widthScale;
    }
    return {
      polys,
      width: width * widthScale,
      x0: isFinite(x0) ? x0 : 0,
      x1: isFinite(x1) ? x1 : 0,
      missing,
    };
  }
}
