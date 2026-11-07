// Your own graphics: SVG files and traced PNG/JPEG images become polygons in the same
// 100 x 100 box (y up) as the built-in icons.

import { Arena, parsePathD, polysBounds, mapPolys, ringArea } from './geom.js';

// Scale polygons to fit a 100 x 100 box, centered, y up.
export function normalizePolys(polys) {
  const b = polysBounds(polys);
  if (!b || b.w <= 0 || b.h <= 0) return [];
  const s = 100 / Math.max(b.w, b.h);
  return mapPolys(polys, s, s, (100 - b.w * s) / 2 - b.x0 * s, (100 - b.h * s) / 2 - b.y0 * s);
}

// Polygons from a manifold CrossSection, dropping slivers.
const out = (cs, minArea) => cs.toPolygons().map((r) => r.map((p) => [p[0], p[1]])).filter((r) => Math.abs(ringArea(r)) > minArea);

// A stroked ring set: a quad per segment plus a disc per vertex (round joins and caps).
function strokeCS(wasm, A, rings, width) {
  const { CrossSection } = wasm;
  const parts = [];
  const hw = width / 2;
  const disc = A.k(CrossSection.circle(hw, 16));
  for (const r of rings) {
    const n = r.length, closed = !!r.closed;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % n];
      const l = Math.hypot(x1 - x0, y1 - y0);
      if (l < 1e-9) continue;
      const nx = -(y1 - y0) / l * hw, ny = (x1 - x0) / l * hw;
      parts.push(A.k(new CrossSection([[[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]], 'NonZero')));
    }
    for (const [x, y] of r) parts.push(A.k(disc.translate([x, y])));
  }
  return parts.length ? A.k(CrossSection.union(parts)) : null;
}

const isLight = (color) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(color || '');
  if (!m) return false;
  if (m[4] !== undefined && +m[4] < 0.5) return false;
  return 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] > 200;
};

// SVG text -> polygons. Shapes are combined in document order: dark fills and strokes
// add ink, white ones on top cut it away (how most single-color icons are drawn).
// Needs a browser DOM.
export function svgToPolys(wasm, text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const src = doc.documentElement;
  if (doc.querySelector('parsererror') || src.localName !== 'svg') throw new Error('That is not a valid SVG file.');
  const host = document.createElement('div');
  // opacity, not visibility: visibility is inherited and would hide every shape from the check below
  host.style.cssText = 'position:absolute;left:-100000px;top:0;width:1000px;height:1000px;opacity:0;pointer-events:none;';
  document.body.appendChild(host);
  const A = new Arena();
  try {
    const root = document.importNode(src, true);
    host.appendChild(root);
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      root.setAttribute('width', vb[2]); root.setAttribute('height', vb[3]);
    }
    const toRoot = root.getScreenCTM()?.inverse();
    if (!toRoot) throw new Error('Could not measure that SVG.');
    const bbox = (() => { try { return root.getBBox(); } catch (e) { return null; } })();
    const size = Math.max(bbox?.width || 0, bbox?.height || 0, vb[2] || 0, vb[3] || 0) || 100;
    const tol = size / 300;
    let acc = null;
    let any = false, skippedText = false;
    const pathOf = (el) => {
      const g = (a) => parseFloat(el.getAttribute(a)) || 0;
      switch (el.localName) {
        case 'path': return el.getAttribute('d') || '';
        case 'rect': {
          const x = g('x'), y = g('y'), w = g('width'), h = g('height');
          let rx = el.hasAttribute('rx') ? g('rx') : g('ry'), ry = el.hasAttribute('ry') ? g('ry') : rx;
          rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
          if (!(w > 0 && h > 0)) return '';
          if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
          return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
            `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
        }
        case 'circle': case 'ellipse': {
          const cx = g('cx'), cy = g('cy');
          const rx = el.localName === 'circle' ? g('r') : g('rx'), ry = el.localName === 'circle' ? g('r') : g('ry');
          if (!(rx > 0 && ry > 0)) return '';
          return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
        }
        case 'polygon': case 'polyline': {
          const n = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
          if (n.length < 4) return '';
          let d = `M${n[0]} ${n[1]}`;
          for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`;
          return el.localName === 'polygon' ? d + 'Z' : d;
        }
        case 'line': return `M${g('x1')} ${g('y1')}L${g('x2')} ${g('y2')}`;
        default: return '';
      }
    };
    for (const el of root.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line, text')) {
      if (el.closest('defs, clipPath, mask, symbol, marker, pattern')) continue;
      if (el.localName === 'text') { skippedText = true; continue; }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const d = pathOf(el);
      if (!d) continue;
      const M = toRoot.multiply(el.getScreenCTM());
      const det = Math.abs(M.a * M.d - M.b * M.c);
      const rings = parsePathD(d, tol / Math.sqrt(det || 1)).map((r) => {
        const t = r.map(([x, y]) => { const p = new DOMPoint(x, y).matrixTransform(M); return [p.x, -p.y]; });
        t.closed = r.closed || el.localName !== 'path' && el.localName !== 'polyline' && el.localName !== 'line';
        return t;
      });
      if (!rings.length) continue;
      const shapes = [];
      const fillOn = cs.fill !== 'none' && !/^rgba\([^)]*,\s*0\)$/.test(cs.fill) && el.localName !== 'line' && +cs.fillOpacity !== 0;
      if (fillOn) {
        const closed = rings.filter((r) => r.length >= 3);
        if (closed.length) shapes.push({ cs: A.k(new wasm.CrossSection(closed, cs.fillRule === 'evenodd' ? 'EvenOdd' : 'NonZero')), light: isLight(cs.fill) });
      }
      const sw = parseFloat(cs.strokeWidth) * Math.sqrt(det);
      if (cs.stroke && cs.stroke !== 'none' && sw > 0 && +cs.strokeOpacity !== 0) {
        const st = strokeCS(wasm, A, rings, sw);
        if (st) shapes.push({ cs: st, light: isLight(cs.stroke) });
      }
      for (const s of shapes) {
        if (s.light) { if (acc) acc = A.k(acc.subtract(s.cs)); }
        else { acc = acc ? A.k(acc.add(s.cs)) : s.cs; any = true; }
      }
    }
    if (!any || !acc) throw new Error(skippedText ? 'The SVG only has text in it. Convert text to paths first (Inkscape: Path > Object to Path).' : 'No filled or stroked shapes found in that SVG.');
    const b = acc.bounds();
    const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    const polys = normalizePolys(out(acc, span * span * 1e-6));
    return { polys, note: skippedText ? 'Text in the SVG was skipped; convert it to paths to include it.' : '' };
  } finally {
    A.free();
    host.remove();
  }
}

// ---------------------------------------------------------------- image tracing

// Gray/alpha image -> ink mask. mode: 'dark' (dark pixels are ink), 'light', or 'alpha'
// (opaque pixels are ink, for logos on a transparent background).
export function inkMask(rgba, w, h, { threshold = 128, mode = 'dark' } = {}) {
  const m = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
    if (mode === 'alpha') { m[i] = a >= threshold ? 1 : 0; continue; }
    // transparent pixels count as background
    const lum = a < 128 ? (mode === 'dark' ? 255 : 0) : 0.299 * r + 0.587 * g + 0.114 * b;
    m[i] = (mode === 'dark' ? lum < threshold : lum > threshold) ? 1 : 0;
  }
  return m;
}

export function hasTransparency(rgba) {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 200) n++;
  return n > rgba.length / 4 * 0.02;
}

// Marching squares over a lightly blurred mask, at the half-way level. Returns rings
// in pixel units, y up (image top at y = h).
export function traceMask(mask, w, h, { smooth = 1, minArea = 6 } = {}) {
  // pad by one pixel so every contour closes, and blur so edges come out smooth
  const W = w + 2, H = h + 2;
  let f = new Float32Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[(y + 1) * W + x + 1] = mask[y * w + x];
  for (let pass = 0; pass < smooth; pass++) {
    const g = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += f[(y + dy) * W + x + dx] * (dx && dy ? 1 : dx || dy ? 2 : 4);
      g[y * W + x] = s / 16;
    }
    f = g;
  }
  const iso = 0.5;
  const at = (x, y) => f[y * W + x];
  // edge ids: horizontal edge from (x,y) to (x+1,y) = 2*(y*W+x); vertical (x,y)-(x,y+1) = 2*(y*W+x)+1
  const pt = new Map();
  const edgePoint = (id) => {
    let p = pt.get(id);
    if (p) return p;
    const c = id >> 1, x = c % W, y = (c - x) / W;
    if (id & 1) { const a = at(x, y), b = at(x, y + 1); const t = (iso - a) / (b - a); p = [x, y + t]; }
    else { const a = at(x, y), b = at(x + 1, y); const t = (iso - a) / (b - a); p = [x + t, y]; }
    pt.set(id, p);
    return p;
  };
  const next = new Map();
  const seg = (a, b) => { next.set(a, b); };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const tl = at(x, y) > iso, tr = at(x + 1, y) > iso, br = at(x + 1, y + 1) > iso, bl = at(x, y + 1) > iso;
    const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = 2 * (y * W + x), B = 2 * ((y + 1) * W + x), L = 2 * (y * W + x) + 1, R = 2 * (y * W + x + 1) + 1;
    // segments run with ink on the left (consistent winding)
    switch (code) {
      case 1: seg(L, B); break;
      case 2: seg(B, R); break;
      case 3: seg(L, R); break;
      case 4: seg(R, T); break;
      case 5: { const c = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4 > iso; if (c) { seg(L, T); seg(R, B); } else { seg(L, B); seg(R, T); } break; }
      case 6: seg(B, T); break;
      case 7: seg(L, T); break;
      case 8: seg(T, L); break;
      case 9: seg(T, B); break;
      case 10: { const c = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4 > iso; if (c) { seg(T, R); seg(B, L); } else { seg(T, L); seg(B, R); } break; }
      case 11: seg(T, R); break;
      case 12: seg(R, L); break;
      case 13: seg(R, B); break;
      case 14: seg(B, L); break;
    }
  }
  const rings = [];
  const seen = new Set();
  for (const startId of next.keys()) {
    if (seen.has(startId)) continue;
    const ring = [];
    let id = startId;
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      const [px, py] = edgePoint(id);
      ring.push([px - 1, h - (py - 1)]);
      id = next.get(id);
    }
    if (ring.length >= 3 && Math.abs(ringArea(ring)) >= minArea) rings.push(simplify(ring, 0.35));
  }
  return rings.filter((r) => r.length >= 3);
}

// Douglas-Peucker on a closed ring.
function simplify(ring, tol) {
  if (ring.length < 8) return ring;
  const dp = (pts) => {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / l;
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const half = ring.length >> 1;
  const a = dp(ring.slice(0, half + 1)), b = dp([...ring.slice(half), ring[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

// Traced rings -> clean polygons in the 100 box.
export function ringsToPolys(wasm, rings) {
  if (!rings.length) return [];
  const A = new Arena();
  try {
    const cs = A.k(new wasm.CrossSection(rings, 'EvenOdd'));
    const b = cs.bounds();
    const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    return normalizePolys(out(cs, span * span * 1e-5));
  } finally { A.free(); }
}
