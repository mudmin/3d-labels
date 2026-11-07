// The drawing kit the built-in icons are written with. Icons are drawn on a 100 x 100
// box with y pointing down (like SVG), from shapes combined with booleans, so what the
// preview shows is exactly what gets printed. No DOM code.
//
// Every icon is a function (P) => shape. Shapes are manifold CrossSections; the kit
// tracks and frees them. See js/icons.js.

import { Arena, parsePathD, ringArea } from './geom.js';

const RAD = Math.PI / 180;

export function makeKit(wasm, A) {
  const { CrossSection } = wasm;
  const k = (x) => A.k(x);
  const fy = (y) => 100 - y;           // y down (author) -> y up (manifold)
  const segs = (r) => Math.max(24, Math.min(128, Math.ceil(r * 4)));
  const fromPts = (pts, fill = 'NonZero') => k(new CrossSection([pts.map(([x, y]) => [x, fy(y)])], fill));
  const empty = () => k(new CrossSection([[[0, 0], [0, 0], [0, 0]]], 'Positive'));
  const flat = (args) => args.flat(Infinity).filter(Boolean);

  const P = {
    // ---- primitives
    circle: (cx, cy, r) => k(k(CrossSection.circle(r, segs(r))).translate([cx, fy(cy)])),
    ellipse: (cx, cy, rx, ry) => k(k(k(CrossSection.circle(1, segs(Math.max(rx, ry)))).scale([rx, ry])).translate([cx, fy(cy)])),
    ring: (cx, cy, r, r2) => P.sub(P.circle(cx, cy, r), P.circle(cx, cy, r2)),
    // rectangle from its top-left corner, optionally with rounded corners
    rect: (x, y, w, h, r = 0) => {
      if (w <= 0 || h <= 0) return empty();
      let s = k(k(CrossSection.square([w, h])).translate([x, fy(y + h)]));
      r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
      if (r > 0) s = k(k(s.offset(-r, 'Miter')).offset(r, 'Round', 2, segs(r)));
      return s;
    },
    // rectangle from its center
    box: (cx, cy, w, h, r = 0) => P.rect(cx - w / 2, cy - h / 2, w, h, r),
    poly: (pts) => fromPts(pts),
    // SVG path data in the same 100 x 100 y-down box (even-odd fill)
    path: (d) => {
      const rings = parsePathD(d, 0.4).map((r) => r.map(([x, y]) => [x, fy(y)]));
      return rings.length ? k(new CrossSection(rings, 'EvenOdd')) : empty();
    },
    // regular n-gon; rot in degrees (clockwise); a hexagon with rot 0 has a vertex at the right
    ngon: (cx, cy, r, n, rot = 0) => fromPts(Array.from({ length: n }, (_, i) => {
      const a = (rot + i * 360 / n) * RAD;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    })),
    star: (cx, cy, r, r2, n, rot = -90) => fromPts(Array.from({ length: n * 2 }, (_, i) => {
      const a = (rot + i * 180 / n) * RAD, rr = i % 2 ? r2 : r;
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    })),
    // Torx / hexalobular recess: six round lobes with concave round valleys between them.
    // r is the lobe tip radius; rot turns it (degrees, clockwise).
    torx: (cx, cy, r, rot = -90) => {
      const rl = r * 0.3, rv = r * 0.22, core = r * 0.8, dv = r * 0.72 + rv;
      const lobes = [], valleys = [];
      for (let i = 0; i < 6; i++) {
        const a = (rot + i * 60) * RAD, b = (rot + 30 + i * 60) * RAD;
        lobes.push(P.circle(cx + (r - rl) * Math.cos(a), cy + (r - rl) * Math.sin(a), rl));
        valleys.push(P.circle(cx + dv * Math.cos(b), cy + dv * Math.sin(b), rv));
      }
      const body = P.union(P.ngon(cx, cy, r - rl, 6, rot), P.circle(cx, cy, core), lobes);
      return P.union(P.sub(body, valleys), lobes);
    },
    // spur gear with n trapezoid teeth reaching r, roots at r - depth
    gear: (cx, cy, r, n, depth = r * 0.2, rot = 0) => {
      const pts = [], s = 360 / n, ri = r - depth;
      for (let i = 0; i < n; i++) {
        const a = rot + i * s;
        for (const [f, rr] of [[-0.32, ri], [-0.17, r], [0.17, r], [0.32, ri]]) {
          const t = (a + f * s) * RAD;
          pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
        }
      }
      return fromPts(pts);
    },
    // Points (not a shape) along a sawtooth from (x0,y0) to (x1,y1) with n teeth
    // sticking out amp to the left of the direction of travel; for P.poly outlines.
    zigzag: (x0, y0, x1, y1, n, amp) => {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = dy / l, ny = -dx / l;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 0.5) / n;
        pts.push([x0 + dx * t0, y0 + dy * t0], [x0 + dx * t1 + nx * amp, y0 + dy * t1 + ny * amp]);
      }
      pts.push([x1, y1]);
      return pts;
    },
    // a stroked polyline: width w, round ends and joins (or square ends with cap:'butt')
    line: (pts, w, { closed = false, cap = 'round' } = {}) => {
      const parts = [];
      const n = pts.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
        const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
        if (l < 1e-9) continue;
        let ux = dx / l, uy = dy / l;
        const nx = -uy * w / 2, ny = ux * w / 2;
        let ex0 = 0, ex1 = 0;
        if (cap === 'butt' || cap === 'square') {
          const e = cap === 'square' ? w / 2 : 0;
          ex0 = (closed || i > 0) ? 0 : e; ex1 = (closed || i < n - 2) ? 0 : e;
        }
        const ax = x0 - ux * ex0, ay = y0 - uy * ex0, bx = x1 + ux * ex1, by = y1 + uy * ex1;
        parts.push(fromPts([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]));
      }
      const joints = cap === 'round' ? pts : (closed ? pts : pts.slice(1, -1));
      for (const [x, y] of joints) parts.push(P.circle(x, y, w / 2));
      return P.union(parts);
    },
    // a stroked arc, angles in degrees, 0 = right, clockwise (y down)
    arc: (cx, cy, r, a0, a1, w, opts) => {
      const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 6));
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const a = (a0 + (a1 - a0) * i / n) * RAD;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      });
      return P.line(pts, w, opts);
    },
    // A threaded shank seen from the side, centered on x = cx, from y0 down to y1.
    // r is the outer (thread crest) radius; depth is how far the root sits inside it.
    // tip: length of a pointed end (0 for a flat machine-screw end).
    thread: (cx, y0, y1, r, pitch, { depth = r * 0.3, tip = 0 } = {}) => {
      const left = [], right = [];
      const end = y1 - tip;
      const ri = r - depth;
      left.push([cx - ri, y0]); right.push([cx + ri, y0]);
      // crests alternate sides by half a pitch, like a real helix in profile
      for (let t = y0 + pitch * 0.25; t < end; t += pitch) {
        right.push([cx + r, t], [cx + ri, Math.min(end, t + pitch / 2)]);
        if (t + pitch / 2 < end) left.push([cx - r, t + pitch / 2], [cx - ri, Math.min(end, t + pitch)]);
      }
      const pts = [...right];
      if (tip > 0) pts.push([cx + ri, end], [cx, y1], [cx - ri, end]);
      else pts.push([cx + ri, y1], [cx - ri, y1]);
      pts.push(...left.reverse());
      return P.union(fromPts(pts), P.rect(cx - ri, y0, ri * 2, Math.max(0, end - y0)));
    },

    // ---- booleans and transforms (all return new shapes)
    union: (...s) => { const l = flat(s); return l.length ? (l.length === 1 ? l[0] : k(CrossSection.union(l))) : empty(); },
    sub: (a, ...b) => { const l = flat(b); return l.length ? k(a.subtract(P.union(l))) : a; },
    inter: (a, b) => k(a.intersect(b)),
    hull: (...s) => k(CrossSection.hull(flat(s))),
    offset: (s, d) => k(s.offset(d, 'Round', 2, 48)),
    move: (s, dx, dy) => k(s.translate([dx, -dy])),
    rotate: (s, deg, cx = 50, cy = 50) => k(k(k(s.translate([-cx, -fy(cy)])).rotate(-deg)).translate([cx, fy(cy)])),
    scale: (s, sx, sy = sx, cx = 50, cy = 50) => k(k(k(s.translate([-cx, -fy(cy)])).scale([sx, sy])).translate([cx, fy(cy)])),
    flipX: (s, cx = 50) => k(k(k(s.translate([-cx, 0])).mirror([1, 0])).translate([cx, 0])),
    flipY: (s, cy = 50) => k(k(k(s.translate([0, -fy(cy)])).mirror([0, 1])).translate([0, fy(cy)])),
    // repeat a shape around a center n times
    around: (s, n, cx = 50, cy = 50, start = 0) => P.union(Array.from({ length: n }, (_, i) => P.rotate(s, start + i * 360 / n, cx, cy))),
  };
  return P;
}

// ---------------------------------------------------------------- evaluation

// Run an icon's draw function and return its polygons (y up, 100 x 100 box).
export function iconPolys(wasm, draw) {
  const A = new Arena();
  try {
    const P = makeKit(wasm, A);
    const cs = draw(P);
    const polys = cs.toPolygons().map((r) => r.map((p) => [p[0], p[1]]));
    return polys.filter((r) => Math.abs(ringArea(r)) > 0.01);
  } finally { A.free(); }
}
