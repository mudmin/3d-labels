// Units, CSV and small helpers. No DOM code.

// ---------------------------------------------------------------- units

const FRACS = [2, 4, 8, 16, 32];

// Format a length in mm for display in the given units. Inches show as a fraction when
// one is within a hair of a 1/32".
export function fmtLen(mm, units, { frac = true } = {}) {
  if (!isFinite(mm)) return '';
  if (units !== 'in') return String(Math.round(mm * 100) / 100);
  const inch = mm / 25.4;
  if (frac) {
    const whole = Math.floor(inch + 1e-9);
    const rest = inch - whole;
    if (Math.abs(rest) < 0.002) return String(whole);
    for (const d of FRACS) {
      const n = Math.round(rest * d);
      if (n > 0 && n < d && Math.abs(rest - n / d) < 0.002) return (whole ? whole + ' ' : '') + `${n}/${d}`;
    }
  }
  return String(Math.round(inch * 1000) / 1000);
}

// Parse a length typed in the given units. Accepts decimals, fractions ("1 7/8",
// "1-7/8", "15/16") and an explicit unit ("48mm", "2in", '3"', "5cm").
export function parseLen(text, units) {
  let s = String(text ?? '').trim().toLowerCase();
  if (!s) return NaN;
  let u = units;
  const m = /(mm|cm|in|inch|inches|"|”|″)\s*$/.exec(s);
  if (m) { u = m[1] === 'mm' ? 'mm' : m[1] === 'cm' ? 'cm' : 'in'; s = s.slice(0, m.index).trim(); }
  let v;
  const mixed = /^(?:(\d+(?:\.\d+)?)(?:[\s-]+|$))?(?:(\d+)\s*\/\s*(\d+))?$/.exec(s);
  if (mixed && (mixed[1] || mixed[2])) {
    v = (mixed[1] ? +mixed[1] : 0) + (mixed[2] ? +mixed[2] / +mixed[3] : 0);
  } else if (/^\d*\.?\d+$/.test(s)) v = +s;
  else return NaN;
  if (!isFinite(v)) return NaN;
  return u === 'in' ? v * 25.4 : u === 'cm' ? v * 10 : v;
}

// "3 x 3/4", "76x19mm", '2" x 1"' -> { w, h } in mm, or null
export function parseSize(text, units) {
  const parts = String(text ?? '').split(/\s*(?:x|×|\*|by)\s*/i);
  if (parts.length !== 2) return null;
  // a unit written once at the end applies to both
  const tail = /(mm|cm|in|"|”)\s*$/i.exec(parts[1]);
  const a = parseLen(parts[0], tail && !/(mm|cm|in|"|”)\s*$/i.test(parts[0]) ? normUnit(tail[1]) : units);
  const b = parseLen(parts[1], units);
  return a > 0 && b > 0 ? { w: a, h: b } : null;
}
const normUnit = (u) => (u === 'mm' ? 'mm' : u === 'cm' ? 'cm' : 'in');

export const fmtSize = (s, units) => `${fmtLen(s.w, units)} × ${fmtLen(s.h, units)}${units === 'in' ? '"' : ' mm'}`;

// ---------------------------------------------------------------- CSV

// RFC 4180 CSV, tab- or semicolon-separated too. A quote only opens a quoted field at
// the start of a field, so unquoted 3" Deck Screws survives.
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const count = (c) => first.split(c).length - 1;
  const delim = count('\t') > 0 && count('\t') >= count(',') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows = [];
  let row = [], field = '', i = 0, q = false, started = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && !started) { q = true; started = true; i++; continue; }
    if (c === delim) { row.push(field); field = ''; started = false; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; started = false;
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++; continue;
    }
    field += c; started = true; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

export function toCSV(rows) {
  return rows.map((r) => r.map((f) => {
    const s = String(f ?? '');
    return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n') + '\r\n';
}

// Header names understood on import, by field.
export const CSV_FIELDS = {
  title: ['title', 'text', 'name', 'label', 'line 1', 'line1', 'main', 'item', 'part', 'description'],
  sub: ['subtitle', 'sub', 'line 2', 'line2', 'detail', 'details', 'size', 'spec', 'second line', 'notes', 'note'],
  icon: ['icon', 'graphic', 'image', 'symbol', 'picture'],
  qty: ['qty', 'quantity', 'count', 'copies', 'number'],
  w: ['width', 'w', 'label width'],
  h: ['height', 'h', 'label height'],
  dims: ['dimensions', 'label size', 'wxh', 'dims'],
};

const norm = (s) => String(s).toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

// Work out which column holds which field. Returns { map: {field: col}, header: bool }
export function mapColumns(rows) {
  if (!rows.length) return { map: {}, header: false };
  const head = rows[0].map(norm);
  const map = {};
  for (const [field, names] of Object.entries(CSV_FIELDS)) {
    const col = head.findIndex((h, i) => names.includes(h) && !Object.values(map).includes(i));
    if (col >= 0) map[field] = col;
  }
  // "size" is ambiguous: a W x H value means label size, anything else a second line
  if (map.sub !== undefined && head[map.sub] === 'size' && rows.slice(1, 6).every((r) => !r[map.sub] || /\d\s*(x|×)\s*\d/i.test(r[map.sub]))) {
    map.dims = map.sub; delete map.sub;
  }
  if (Object.keys(map).length && map.title !== undefined) return { map, header: true };
  if (Object.keys(map).length >= 2) return { map, header: true };
  // no header: title, second line, icon, copies
  return { map: { title: 0, sub: 1, icon: 2, qty: 3 }, header: false };
}

// ---------------------------------------------------------------- misc

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const fileSafe = (s, fallback = 'label') => (String(s || '').replace(/["']/g, 'in').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || fallback);

export function b64FromBuf(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function bufFromB64(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}

// Match free text against icon ids, names and tags. Longer, more specific matches win.
export function guessIcon(text, icons) {
  const t = ' ' + norm(text).replace(/[^a-z0-9#]+/g, ' ') + ' ';
  let best = null, bestScore = 0;
  for (const ic of icons) {
    const words = [...(ic.tags || []), ic.name, ic.id.replace(/-/g, ' ')];
    words.forEach((w, rank) => {
      const k = norm(w).replace(/[^a-z0-9#]+/g, ' ').trim();
      if (k.length < 2) return;
      const plural = k.endsWith('s') ? k : k + 's';
      if (t.includes(' ' + k + ' ') || t.includes(' ' + plural + ' ')) {
        // longer phrases and earlier tags are more specific
        const score = k.length * 10 - rank * 0.1;
        if (score > bestScore) { bestScore = score; best = ic; }
      }
    });
  }
  return best;
}

export function findIcon(key, icons) {
  if (!key) return null;
  const k = norm(key);
  return icons.find((i) => i.id === key || norm(i.id) === k)
    || icons.find((i) => norm(i.name) === k)
    || icons.find((i) => (i.tags || []).some((t) => norm(t) === k))
    || null;
}
