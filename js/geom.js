// Shared geometry helpers: memory arena for manifold objects, polygon utilities,
// SVG path parsing, and STL / 3MF writers. No DOM code, so it also runs in Node.

// Every manifold-3d object lives in wasm memory and must be deleted. An Arena keeps
// what it is handed and frees it all at once.
export class Arena {
  constructor() { this.items = []; }
  k(x) { this.items.push(x); return x; }
  free() { for (const o of this.items) { try { o.delete(); } catch (e) { /* already freed */ } } this.items = []; }
}

// ---------------------------------------------------------------- polygons
// A polygon set is an array of rings, each ring an array of [x, y]. Outer rings run
// counter-clockwise and holes clockwise (manifold's convention), y up, in mm.

export function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function polysBounds(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of polys) for (const [x, y] of r) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x0 <= x1 ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : null;
}

// x' = a*x + c, y' = b*y + d. A negative a*b mirrors, which flips winding, so rings are
// reversed to keep outer rings counter-clockwise.
export function mapPolys(polys, a, b, c, d) {
  const flip = a * b < 0;
  return polys.map((r) => {
    const out = r.map(([x, y]) => [a * x + c, b * y + d]);
    return flip ? out.reverse() : out;
  });
}

export const scalePolys = (polys, s, dx = 0, dy = 0) => mapPolys(polys, s, s, dx, dy);

export function polysToCS(wasm, polys, fill = 'Positive') {
  const rings = polys.filter((r) => r.length >= 3);
  if (!rings.length) return new wasm.CrossSection([[[0, 0], [0, 0], [0, 0]]], 'Positive');
  return new wasm.CrossSection(rings, fill);
}

// SVG path data for a polygon set, y flipped so it draws upright in a y-down SVG.
export function polysToPath(polys, prec = 3) {
  const f = (v) => +v.toFixed(prec);
  let d = '';
  for (const r of polys) {
    if (r.length < 3) continue;
    d += 'M' + r.map(([x, y]) => f(x) + ' ' + f(-y)).join('L') + 'Z';
  }
  return d;
}

// ---------------------------------------------------------------- SVG path parsing

// Turn SVG path data into rings (y down, as written). Curves are flattened so no
// segment is longer than `tol` (in path units) along the curve, at least 2 per curve.
// Rings ended with Z carry `closed = true` (it matters for strokes).
export function parsePathD(d, tol = 0.5) {
  const toks = String(d).match(/[a-df-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
  const rings = [];
  let ring = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lastCmd = '';
  const num = () => parseFloat(toks[i++]);
  const isNum = () => i < toks.length && !/^[a-df-z]$/i.test(toks[i]);
  const start = (px, py) => { if (ring && ring.length > 1) rings.push(ring); ring = [[px, py]]; sx = px; sy = py; };
  const line = (px, py) => { if (!ring) start(x, y); ring.push([px, py]); };
  const steps = (len) => Math.max(2, Math.min(64, Math.ceil(len / tol)));
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    const len = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    const n = steps(len);
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      line(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
    }
  };
  const quad = (x1, y1, x2, y2) => {
    const n = steps(Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      line(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2);
    }
  };
  const arc = (rx, ry, rot, large, sweep, x2, y2) => {
    // SVG arc endpoint parameterization -> center form (SVG spec F.6.5)
    if (rx === 0 || ry === 0) { line(x2, y2); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = rot * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (x - x2) / 2, dy = (y - y2) / 2;
    const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num2 / den));
    if (large === sweep) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = cp * cxp - sp * cyp + (x + x2) / 2, cy = sp * cxp + cp * cyp + (y + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const n = steps(Math.abs(dt) * Math.max(rx, ry));
    for (let k = 1; k <= n; k++) {
      const t = t1 + dt * k / n;
      line(cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp);
    }
  };

  while (i < toks.length) {
    if (!isNum()) cmd = toks[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z' ? 1 : 0;
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') {
      if (ring && ring.length > 1) { ring.closed = true; rings.push(ring); }
      ring = null; x = sx; y = sy; lastCmd = 'Z';
      continue;
    }
    if (!isNum()) break; // malformed
    switch (C) {
      case 'M': { x = num() + ox; y = num() + oy; start(x, y); cmd = rel ? 'l' : 'L'; lastCmd = 'M'; continue; }
      case 'L': { const nx = num() + ox, ny = num() + oy; line(nx, ny); x = nx; y = ny; break; }
      case 'H': { const nx = num() + ox; line(nx, y); x = nx; break; }
      case 'V': { const ny = num() + oy; line(x, ny); y = ny; break; }
      case 'C': {
        const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
        cubic(x1, y1, x2, y2, x3, y3); lcx = x2; lcy = y2; x = x3; y = y3; break;
      }
      case 'S': {
        const r = /[CS]/.test(lastCmd);
        const x1 = r ? 2 * x - lcx : x, y1 = r ? 2 * y - lcy : y;
        const x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
        cubic(x1, y1, x2, y2, x3, y3); lcx = x2; lcy = y2; x = x3; y = y3; break;
      }
      case 'Q': {
        const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy;
        quad(x1, y1, x2, y2); lcx = x1; lcy = y1; x = x2; y = y2; break;
      }
      case 'T': {
        const r = /[QT]/.test(lastCmd);
        const x1 = r ? 2 * x - lcx : x, y1 = r ? 2 * y - lcy : y;
        const x2 = num() + ox, y2 = num() + oy;
        quad(x1, y1, x2, y2); lcx = x1; lcy = y1; x = x2; y = y2; break;
      }
      case 'A': {
        const rx = num(), ry = num(), rot = num();
        // flags may be packed without separators ("a1 1 0 0110 10")
        const flag = () => { const t = toks[i]; if (t.length > 1 && /^[01]/.test(t)) { toks[i] = t.slice(1); return +t[0]; } i++; return +t; };
        const large = flag(), sweep = flag();
        const x2 = num() + ox, y2 = num() + oy;
        arc(rx, ry, rot, large, sweep, x2, y2); x = x2; y = y2; break;
      }
      default: i++;
    }
    lastCmd = C;
  }
  if (ring && ring.length > 1) rings.push(ring);
  return rings.filter((r) => r.length >= 3);
}

// ---------------------------------------------------------------- meshes and files

// Plain mesh {pos: Float32Array (xyz...), idx: Uint32Array} from a Manifold.
export function meshOf(manifold) {
  const m = manifold.getMesh();
  const np = m.numProp;
  const nv = m.vertProperties.length / np;
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    pos[i * 3] = m.vertProperties[i * np];
    pos[i * 3 + 1] = m.vertProperties[i * np + 1];
    pos[i * 3 + 2] = m.vertProperties[i * np + 2];
  }
  return { pos, idx: new Uint32Array(m.triVerts) };
}

export function translateMesh(mesh, dx, dy, dz = 0) {
  const pos = new Float32Array(mesh.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = mesh.pos[i] + dx; pos[i + 1] = mesh.pos[i + 1] + dy; pos[i + 2] = mesh.pos[i + 2] + dz;
  }
  return { pos, idx: mesh.idx };
}

// Turn a mesh 90° counter-clockwise about the origin, (x, y) -> (-y, x): lays a label
// sideways on a plate.
export function rotateMesh90(mesh) {
  const pos = new Float32Array(mesh.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = -mesh.pos[i + 1]; pos[i + 1] = mesh.pos[i]; pos[i + 2] = mesh.pos[i + 2];
  }
  return { pos, idx: mesh.idx };
}

export function mergeMeshes(list) {
  let nv = 0, nt = 0;
  for (const m of list) { nv += m.pos.length; nt += m.idx.length; }
  const pos = new Float32Array(nv), idx = new Uint32Array(nt);
  let ov = 0, ot = 0;
  for (const m of list) {
    pos.set(m.pos, ov);
    const base = ov / 3;
    for (let i = 0; i < m.idx.length; i++) idx[ot + i] = m.idx[i] + base;
    ov += m.pos.length; ot += m.idx.length;
  }
  return { pos, idx };
}

export function writeSTL(meshes, name = 'label') {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  let nt = 0;
  for (const m of list) nt += m.idx.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50);
  const dv = new DataView(buf);
  const head = ('3d-labels ' + name).slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (const { pos: p, idx } of list) {
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
      o += 12;
      for (const v of [a, b, c]) {
        dv.setFloat32(o, p[v], true); dv.setFloat32(o + 4, p[v + 1], true); dv.setFloat32(o + 8, p[v + 2], true);
        o += 12;
      }
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

const xmlEsc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

// A 3MF that multi-material slicers open as one object per label, with a part per
// color already assigned to a filament.
//   objects: [{ name, parts: [{ name, mesh, extruder (1-based) }] }]
// Written the way Bambu Studio and OrcaSlicer (and their forks: Elegoo Slicer,
// Snapmaker Orca) write multi-part objects: each part is a mesh object in
// 3D/Objects/, an object made of components per label in 3D/3dmodel.model, and
// Metadata/model_settings.config naming the parts and their filaments. Other slicers
// that read the 3MF production extension still get the right shapes.
export function write3MF(objects, { zipSync, strToU8, title = 'labels', flavor = 'bambu' }) {
  if (flavor === 'prusa') return write3MFPrusa(objects, { zipSync, strToU8, title });
  const enc = (s) => strToU8(s);
  const fmtN = (v) => (Math.round(v * 1e4) / 1e4).toString();
  let n = 0;
  const uuid = (kind) => {
    n++;
    const h = (v, len) => v.toString(16).padStart(len, '0').slice(-len);
    return `${h(kind, 8)}-${h(n >> 16, 4)}-4${h(n, 3)}-8${h(n * 7, 3)}-${h(n * 2654435761 >>> 0, 12)}`;
  };
  const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';
  const files = {};
  let mainObjs = '', items = '', rels = '', settings = '';
  let id = 1;
  objects.forEach((obj, oi) => {
    const path = `/3D/Objects/object_${oi + 1}.model`;
    let partObjs = '', comps = '', parts = '';
    for (const part of obj.parts) {
      const { pos, idx } = part.mesh;
      if (!idx.length) continue;
      const pid = id++;
      const v = [], t = [];
      for (let i = 0; i < pos.length; i += 3) v.push(`<vertex x="${fmtN(pos[i])}" y="${fmtN(pos[i + 1])}" z="${fmtN(pos[i + 2])}"/>`);
      for (let i = 0; i < idx.length; i += 3) t.push(`<triangle v1="${idx[i]}" v2="${idx[i + 1]}" v3="${idx[i + 2]}"/>`);
      partObjs += `  <object id="${pid}" p:UUID="${uuid(0x10000)}" type="model">\n   <mesh>\n    <vertices>\n${v.join('\n')}\n    </vertices>\n    <triangles>\n${t.join('\n')}\n    </triangles>\n   </mesh>\n  </object>\n`;
      comps += `    <component p:path="${path}" objectid="${pid}" p:UUID="${uuid(0x20000)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n`;
      parts += `    <part id="${pid}" subtype="normal_part">\n      <metadata key="name" value="${xmlEsc(part.name)}"/>\n      <metadata key="extruder" value="${part.extruder}"/>\n    </part>\n`;
    }
    if (!comps) return;
    files[path.slice(1)] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS}>\n <resources>\n${partObjs} </resources>\n <build/>\n</model>\n`);
    rels += ` <Relationship Target="${path}" Id="rel-${oi + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n`;
    const oid = id++;
    mainObjs += `  <object id="${oid}" p:UUID="${uuid(0x30000)}" type="model">\n   <components>\n${comps}   </components>\n  </object>\n`;
    items += `  <item objectid="${oid}" p:UUID="${uuid(0x40000)}" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>\n`;
    settings += `  <object id="${oid}">\n    <metadata key="name" value="${xmlEsc(obj.name)}"/>\n    <metadata key="extruder" value="${obj.parts[0]?.extruder || 1}"/>\n${parts}  </object>\n`;
  });
  files['3D/3dmodel.model'] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS}>\n` +
    ` <metadata name="Title">${xmlEsc(title)}</metadata>\n <metadata name="Application">3D Labels</metadata>\n` +
    ` <resources>\n${mainObjs} </resources>\n <build p:UUID="${uuid(0x50000)}">\n${items} </build>\n</model>\n`);
  files['3D/_rels/3dmodel.model.rels'] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${rels}</Relationships>\n`);
  files['_rels/.rels'] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n`);
  files['[Content_Types].xml'] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n <Default Extension="config" ContentType="text/xml"/>\n</Types>\n`);
  files['Metadata/model_settings.config'] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${settings}</config>\n`);
  return zipSync(files, { level: 6 });
}

// The PrusaSlicer way: one mesh object per label, with Metadata/Slic3r_PE_model.config
// splitting its triangles into volumes and setting each volume's extruder.
function write3MFPrusa(objects, { zipSync, strToU8, title }) {
  const enc = (s) => strToU8(s);
  const fmtN = (v) => (Math.round(v * 1e4) / 1e4).toString();
  let model = '', items = '', config = '';
  objects.forEach((obj, oi) => {
    const oid = oi + 1;
    const v = [], t = [];
    let vbase = 0, tbase = 0, vols = '';
    for (const part of obj.parts) {
      const { pos, idx } = part.mesh;
      const nt = idx.length / 3;
      if (!nt) continue;
      for (let i = 0; i < pos.length; i += 3) v.push(`<vertex x="${fmtN(pos[i])}" y="${fmtN(pos[i + 1])}" z="${fmtN(pos[i + 2])}"/>`);
      for (let i = 0; i < idx.length; i += 3) t.push(`<triangle v1="${idx[i] + vbase}" v2="${idx[i + 1] + vbase}" v3="${idx[i + 2] + vbase}"/>`);
      vols += `  <volume firstid="${tbase}" lastid="${tbase + nt - 1}">\n   <metadata type="volume" key="name" value="${xmlEsc(part.name)}"/>\n` +
        `   <metadata type="volume" key="volume_type" value="ModelPart"/>\n   <metadata type="volume" key="extruder" value="${part.extruder}"/>\n  </volume>\n`;
      vbase += pos.length / 3; tbase += nt;
    }
    if (!tbase) return;
    model += `  <object id="${oid}" type="model">\n   <mesh>\n    <vertices>\n${v.join('\n')}\n    </vertices>\n    <triangles>\n${t.join('\n')}\n    </triangles>\n   </mesh>\n  </object>\n`;
    items += `  <item objectid="${oid}" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>\n`;
    config += ` <object id="${oid}" instances_count="1">\n  <metadata type="object" key="name" value="${xmlEsc(obj.name)}"/>\n` +
      `  <metadata type="object" key="extruder" value="${obj.parts[0]?.extruder || 1}"/>\n${vols} </object>\n`;
  });
  return zipSync({
    '[Content_Types].xml': enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n <Default Extension="config" ContentType="text/xml"/>\n</Types>\n`),
    '_rels/.rels': enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n`),
    '3D/3dmodel.model': enc(`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">\n` +
      ` <metadata name="Title">${xmlEsc(title)}</metadata>\n <metadata name="Application">3D Labels</metadata>\n <metadata name="slic3rpe:Version3mf">1</metadata>\n` +
      ` <resources>\n${model} </resources>\n <build>\n${items} </build>\n</model>\n`),
    'Metadata/Slic3r_PE_model.config': enc(`<?xml version="1.0" encoding="utf-8"?>\n<config>\n${config}</config>\n`),
  }, { level: 6 });
}
