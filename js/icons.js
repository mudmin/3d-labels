// Built-in icons. Each one is drawn on a 100 x 100 box, y down, with the kit in
// js/iconkit.js. Icons print at roughly 10-20 mm, where 1 unit is about 0.1-0.2 mm, so
// keep every stroke, gap and hole at least 7 units wide or a 0.4 mm nozzle loses it.
//
//   id    stable key, used in saved projects and CSV files (never rename one)
//   name  shown in the picker
//   cat   category id from CATEGORIES
//   tags  extra words for search, CSV matching and "Guess icons", most specific first

export const CATEGORIES = [
  { id: 'drive', name: 'Screw drives' },
  { id: 'screw', name: 'Screws & bolts' },
  { id: 'head', name: 'Head profiles' },
  { id: 'nut', name: 'Nuts & washers' },
  { id: 'fastener', name: 'Anchors, nails & pins' },
  { id: 'elec', name: 'Electrical' },
  { id: 'plumb', name: 'Plumbing & air' },
  { id: 'misc', name: 'Hardware & misc' },
  { id: 'print', name: '3D printing' },
  { id: 'mark', name: 'Symbols' },
];

// ---------------------------------------------------------------- shared parts

// a round screw head seen from above, with a recess cut out of it
const head = (P, ...recess) => P.sub(P.circle(50, 50, 46), ...recess);

// a hex head or nut seen from the side: three faces split by two dark lines
const hexSide = (P, cx, y, w, h, r = 2) => P.sub(P.rect(cx - w / 2, y, w, h, r),
  P.rect(cx - w / 4 - 3.5, y - 1, 7, h + 2), P.rect(cx + w / 4 - 3.5, y - 1, 7, h + 2));

// the part of a shape above (y < yCut) a line
const above = (P, s, yCut) => P.inter(s, P.rect(-10, -10, 120, yCut + 10));

// a short plain shank under a head profile
const stub = (P, y) => P.rect(38, y, 24, 98 - y);

// a screwdriver slot cut into the top of a side-view head
const slot = (P, y, depth = 9) => P.rect(45, y - 1, 10, depth + 1);

// a countersunk (flat) head, top edge at y
const csk = (P, y, w, h, shank) => P.poly([[50 - w / 2, y], [50 + w / 2, y], [50 + shank / 2, y + h], [50 - shank / 2, y + h]]);

// a bugle head: flat top with a curved underside
const bugle = (P, y, w, h, shank) => P.path(
  `M${50 - w / 2} ${y}H${50 + w / 2}Q${50 + shank / 2 + 2} ${y + h * 0.25} ${50 + shank / 2} ${y + h}H${50 - shank / 2}Q${50 - shank / 2 - 2} ${y + h * 0.25} ${50 - w / 2} ${y}Z`);

// a tapered, finned body (wall anchors, augers): from width w0 at y0 to w1 at y1
const finned = (P, y0, y1, w0, w1, n, fin, tip = 0) => {
  const L = [], R = [];
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2), y = y0 + (y1 - y0) * t, w = (w0 + (w1 - w0) * t) / 2 + (i % 2 ? fin : 0);
    R.push([50 + w, y]); L.push([50 - w, y]);
  }
  const pts = [...R];
  if (tip) pts.push([50, y1 + tip]);
  return P.poly([...pts, ...L.reverse()]);
};

// ---------------------------------------------------------------- icons

export const ICONS = [
  // ------------------------------------------------------------ screw drives
  {
    id: 'phillips', name: 'Phillips', cat: 'drive', tags: ['phillips', 'ph1', 'ph2', 'ph3', 'cross', 'drywall'],
    draw: (P) => head(P, P.box(50, 50, 62, 14, 2), P.box(50, 50, 14, 62, 2), P.rotate(P.box(50, 50, 22, 22), 45)),
  },
  {
    id: 'slotted', name: 'Slotted', cat: 'drive', tags: ['slotted', 'slot', 'flat blade', 'straight'],
    draw: (P) => head(P, P.box(50, 50, 72, 15, 1)),
  },
  {
    id: 'torx', name: 'Torx', cat: 'drive', tags: ['torx', 'star', 'hexalobular', 't10', 't15', 't20', 't25', 't27', 't30', 't40', 'deck'],
    draw: (P) => head(P, P.torx(50, 50, 31)),
  },
  {
    id: 'security-torx', name: 'Security Torx', cat: 'drive', tags: ['security torx', 'tamper', 'pin torx', 'tr', 'tamper resistant'],
    draw: (P) => P.union(head(P, P.torx(50, 50, 33)), P.circle(50, 50, 8)),
  },
  {
    id: 'hex-socket', name: 'Hex socket', cat: 'drive', tags: ['allen', 'hex key', 'hex socket', 'socket', 'hex drive', 'inbus'],
    draw: (P) => head(P, P.ngon(50, 50, 27, 6, 0)),
  },
  {
    // a hex washer head seen from above: the hex inside its washer, for a nut driver
    id: 'hex-washer-head', name: 'Hex head (top)', cat: 'drive', tags: ['hex head', 'hex washer', 'hex washer head', 'nut driver', 'nut setter', 'external hex', 'sheet metal', 'tek', '1/4"', '5/16"'],
    draw: (P) => P.union(P.ring(50, 50, 46, 37), P.ngon(50, 50, 28, 6, 0)),
  },
  {
    id: 'square-drive', name: 'Square (Robertson)', cat: 'drive', tags: ['robertson', 'square drive', 'square', 'sq1', 'sq2', 'sq3'],
    draw: (P) => head(P, P.box(50, 50, 36, 36, 2)),
  },
  {
    id: 'pozidriv', name: 'Pozidriv', cat: 'drive', tags: ['pozidriv', 'pozi', 'pz1', 'pz2', 'pz3'],
    draw: (P) => head(P, P.box(50, 50, 64, 14, 1), P.box(50, 50, 14, 64, 1), P.rotate(P.box(50, 50, 48, 7), 45), P.rotate(P.box(50, 50, 48, 7), -45)),
  },
  {
    id: 'combo-drive', name: 'Phillips / slot combo', cat: 'drive', tags: ['combo', 'combination', 'phillips slot', 'slot phillips'],
    draw: (P) => head(P, P.box(50, 50, 80, 13), P.box(50, 50, 13, 56, 1)),
  },
  {
    id: 'tri-wing', name: 'Tri-wing', cat: 'drive', tags: ['tri-wing', 'triwing', 'tri wing', 'y'],
    draw: (P) => head(P, P.around(P.rect(43, 18, 14, 34, 3), 3), P.circle(50, 50, 10)),
  },
  {
    id: 'spanner-drive', name: 'Spanner (snake eye)', cat: 'drive', tags: ['spanner', 'snake eye', 'snake-eye', 'pig nose', 'two hole'],
    draw: (P) => head(P, P.circle(30, 50, 9), P.circle(70, 50, 9)),
  },
  {
    id: 'one-way', name: 'One-way (clutch)', cat: 'drive', tags: ['one-way', 'one way', 'clutch', 'tamper proof'],
    draw: (P) => head(P,
      P.poly([[13, 43], [47, 43], [47, 57], [24, 57]]),
      P.poly([[53, 43], [76, 43], [87, 57], [53, 57]])),
  },

  // ------------------------------------------------------------ screws & bolts (side view)
  {
    id: 'wood-screw', name: 'Wood screw', cat: 'screw', tags: ['wood screw', 'wood', 'woodscrew', 'flat head screw', 'screws', 'screw'],
    draw: (P) => P.sub(P.union(csk(P, 2, 66, 20, 22), P.rect(39, 21, 22, 22), P.thread(50, 40, 98, 15, 11, { depth: 6, tip: 16 })), slot(P, 2)),
  },
  {
    id: 'deck-screw', name: 'Deck screw', cat: 'screw', tags: ['deck screw', 'deck', 'decking', 'exterior screw', 'construction screw', 'screws', 'screw'],
    draw: (P) => P.union(bugle(P, 2, 64, 20, 20), P.thread(50, 21, 98, 17, 13, { depth: 8, tip: 16 })),
  },
  {
    id: 'drywall-screw', name: 'Drywall screw', cat: 'screw', tags: ['drywall screw', 'drywall', 'sheetrock', 'bugle', 'gypsum', 'screws'],
    draw: (P) => P.union(bugle(P, 2, 60, 18, 18), P.thread(50, 19, 98, 13, 9, { depth: 5, tip: 14 })),
  },
  {
    id: 'machine-screw', name: 'Machine screw', cat: 'screw', tags: ['machine screw', 'machine', 'm3', 'm4', 'm5', 'm6', '6-32', '8-32', '10-24', '10-32', '1/4-20', 'screws'],
    draw: (P) => P.sub(P.union(P.union(P.rect(22, 2, 56, 24, 9), P.rect(22, 14, 56, 12)), P.thread(50, 26, 98, 14, 8, { depth: 4 })), slot(P, 2)),
  },
  {
    id: 'sheet-metal-screw', name: 'Sheet metal screw', cat: 'screw', tags: ['sheet metal screw', 'sheet metal', 'self tapping', 'self-tapping', 'tek', 'hex washer', 'screws'],
    draw: (P) => P.union(hexSide(P, 50, 2, 50, 18), P.rect(18, 20, 64, 8, 2), P.thread(50, 28, 98, 14, 9, { depth: 5, tip: 14 })),
  },
  {
    id: 'self-drilling-screw', name: 'Self-drilling screw', cat: 'screw', tags: ['self drilling', 'self-drilling', 'tek screw', 'tek', 'drill point', 'roofing screw', 'screws'],
    draw: (P) => P.union(hexSide(P, 50, 2, 50, 18), P.rect(18, 20, 64, 8, 2), P.thread(50, 28, 74, 14, 9, { depth: 5 }),
      P.sub(P.poly([[40, 74], [60, 74], [60, 86], [50, 99], [40, 86]]), P.poly([[49, 74], [56, 74], [49, 90]]))),
  },
  {
    id: 'lag-screw', name: 'Lag screw', cat: 'screw', tags: ['lag screw', 'lag bolt', 'lag', 'hex lag', 'screws'],
    draw: (P) => P.union(hexSide(P, 50, 2, 72, 22), P.rect(38, 24, 24, 16), P.thread(50, 38, 98, 18, 14, { depth: 8, tip: 18 })),
  },
  {
    id: 'hex-bolt', name: 'Hex bolt', cat: 'screw', tags: ['hex bolt', 'bolt', 'bolts', 'hex cap screw', 'cap screw', 'tap bolt'],
    draw: (P) => P.union(hexSide(P, 50, 2, 72, 22), P.rect(37, 24, 26, 30), P.thread(50, 52, 98, 14, 8, { depth: 4 })),
  },
  {
    id: 'carriage-bolt', name: 'Carriage bolt', cat: 'screw', tags: ['carriage bolt', 'carriage', 'coach bolt', 'square neck', 'bolts'],
    draw: (P) => P.union(above(P, P.ellipse(50, 24, 44, 22), 24), P.rect(35, 24, 30, 14), P.thread(50, 38, 98, 14, 8, { depth: 4 })),
  },
  {
    id: 'socket-cap-screw', name: 'Socket cap screw', cat: 'screw', tags: ['socket cap', 'socket head', 'shcs', 'cap screw', 'allen bolt', 'm3', 'm4', 'm5'],
    draw: (P) => P.sub(P.union(P.union(P.rect(26, 2, 48, 32, 6), P.rect(26, 20, 48, 14)), P.thread(50, 34, 98, 13, 8, { depth: 4 })), P.rect(41, 1, 18, 12)),
  },
  {
    id: 'set-screw', name: 'Set screw', cat: 'screw', tags: ['set screw', 'grub screw', 'grub', 'setscrew'],
    draw: (P) => P.sub(P.union(P.thread(50, 4, 88, 26, 12, { depth: 7 }), P.poly([[29, 87], [71, 87], [60, 97], [40, 97]])), P.rect(40, 3, 20, 18)),
  },
  {
    id: 'thumb-screw', name: 'Thumb screw', cat: 'screw', tags: ['thumb screw', 'thumbscrew', 'knurled', 'hand screw'],
    draw: (P) => P.union(
      P.sub(P.rect(6, 2, 88, 30, 5), ...[16, 30, 44, 58, 72].map((x) => P.rect(x + 3, 1, 7, 8)), ...[16, 30, 44, 58, 72].map((x) => P.rect(x + 3, 25, 7, 8))),
      P.thread(50, 32, 98, 14, 9, { depth: 4 })),
  },
  {
    id: 'eye-bolt', name: 'Eye bolt', cat: 'screw', tags: ['eye bolt', 'eyebolt', 'eye', 'eye screw', 'lifting eye'],
    draw: (P) => P.union(P.ring(50, 26, 25, 13), P.rect(42, 48, 16, 12), P.thread(50, 58, 98, 12, 8, { depth: 4 })),
  },
  {
    id: 'u-bolt', name: 'U-bolt', cat: 'screw', tags: ['u-bolt', 'u bolt', 'ubolt', 'muffler clamp'],
    draw: (P) => P.union(P.arc(50, 40, 32, 180, 360, 13, { cap: 'butt' }), P.thread(18, 39, 98, 9, 7, { depth: 3 }), P.thread(82, 39, 98, 9, 7, { depth: 3 }),
      P.rect(2, 62, 96, 12, 3)),
  },
  {
    id: 'j-bolt', name: 'J-bolt', cat: 'screw', tags: ['j-bolt', 'j bolt', 'jbolt', 'anchor bolt', 'hook bolt'],
    draw: (P) => P.union(P.thread(66, 2, 44, 11, 8, { depth: 4 }), P.line([[66, 42], [66, 68]], 15, { cap: 'butt' }), P.arc(42, 68, 24, 0, 180, 15, { cap: 'butt' }), P.line([[18, 68], [18, 54]], 15)),
  },
  {
    id: 'threaded-rod', name: 'Threaded rod', cat: 'screw', tags: ['threaded rod', 'all thread', 'allthread', 'all-thread', 'stud', 'studding'],
    draw: (P) => P.thread(50, 2, 98, 22, 11, { depth: 7 }),
  },
  {
    id: 'wing-screw', name: 'Wing screw', cat: 'screw', tags: ['wing screw', 'wing bolt', 'butterfly screw'],
    draw: (P) => P.union(P.path('M8 4 Q30 0 40 30 H60 Q70 0 92 4 Q86 30 62 38 H38 Q14 30 8 4 Z'), P.thread(50, 36, 98, 13, 8, { depth: 4 })),
  },
  {
    id: 'shoulder-bolt', name: 'Shoulder bolt', cat: 'screw', tags: ['shoulder bolt', 'shoulder screw', 'stripper bolt', 'pivot bolt'],
    draw: (P) => P.sub(P.union(P.rect(24, 2, 52, 24, 5), P.rect(34, 26, 32, 46), P.thread(50, 72, 98, 11, 7, { depth: 3 })), P.rect(41, 1, 18, 11)),
  },

  // ------------------------------------------------------------ head profiles (side view)
  {
    id: 'flat-head', name: 'Flat (countersunk) head', cat: 'head', tags: ['flat head', 'countersunk', 'csk', 'fh', 'flat'],
    draw: (P) => P.sub(P.union(csk(P, 24, 92, 36, 24), stub(P, 59)), slot(P, 24)),
  },
  {
    id: 'oval-head', name: 'Oval head', cat: 'head', tags: ['oval head', 'raised countersunk', 'oval'],
    draw: (P) => P.sub(P.union(above(P, P.ellipse(50, 30, 46, 16), 30), csk(P, 30, 92, 32, 24), stub(P, 61)), slot(P, 14)),
  },
  {
    id: 'pan-head', name: 'Pan head', cat: 'head', tags: ['pan head', 'pan', 'ph'],
    draw: (P) => P.sub(P.union(P.rect(6, 22, 88, 36, 14), P.rect(6, 42, 88, 16), stub(P, 57)), slot(P, 22)),
  },
  {
    id: 'button-head', name: 'Button head', cat: 'head', tags: ['button head', 'button', 'bhcs', 'dome head'],
    draw: (P) => P.sub(P.union(above(P, P.ellipse(50, 60, 47, 36), 60), stub(P, 59)), P.ngon(50, 30, 10, 6, 0), P.rect(40, 22, 20, 10)),
  },
  {
    id: 'truss-head', name: 'Truss head', cat: 'head', tags: ['truss head', 'truss', 'mushroom', 'wafer head'],
    draw: (P) => P.sub(P.union(above(P, P.ellipse(50, 62, 49, 26), 62), stub(P, 61)), slot(P, 36)),
  },
  {
    id: 'round-head', name: 'Round head', cat: 'head', tags: ['round head', 'round', 'rh'],
    draw: (P) => P.sub(P.union(above(P, P.circle(50, 58, 40), 58), stub(P, 57)), slot(P, 18, 12)),
  },
  {
    id: 'fillister-head', name: 'Fillister head', cat: 'head', tags: ['fillister', 'cheese head', 'fillister head'],
    draw: (P) => P.sub(P.union(above(P, P.ellipse(50, 22, 31, 9), 22), P.rect(19, 22, 62, 36), stub(P, 57)), slot(P, 13, 14)),
  },
  {
    id: 'socket-cap-head', name: 'Socket cap head', cat: 'head', tags: ['socket cap head', 'cap head', 'cylinder head'],
    draw: (P) => P.sub(P.union(P.rect(16, 6, 68, 52, 7), P.rect(16, 30, 68, 28), stub(P, 57)), P.rect(37, 5, 26, 18)),
  },
  {
    id: 'hex-head', name: 'Hex head', cat: 'head', tags: ['hex head', 'hex', 'hh'],
    draw: (P) => P.union(hexSide(P, 50, 14, 92, 44, 3), stub(P, 57)),
  },
  {
    id: 'flange-head', name: 'Hex flange head', cat: 'head', tags: ['flange head', 'hex flange', 'flanged', 'serrated flange', 'frame bolt'],
    draw: (P) => P.union(hexSide(P, 50, 10, 70, 36, 3), P.rect(4, 46, 92, 12, 4), stub(P, 57)),
  },
  {
    id: 'bugle-head', name: 'Bugle head', cat: 'head', tags: ['bugle head', 'bugle'],
    draw: (P) => P.union(bugle(P, 22, 92, 36, 26), stub(P, 57)),
  },

  // ------------------------------------------------------------ nuts & washers
  {
    id: 'hex-nut', name: 'Hex nut', cat: 'nut', tags: ['hex nut', 'nut', 'nuts', 'jam nut', 'finished nut'],
    draw: (P) => P.sub(P.ngon(50, 50, 48, 6, 0), P.circle(50, 50, 21)),
  },
  {
    id: 'nyloc-nut', name: 'Nyloc nut', cat: 'nut', tags: ['nyloc', 'nylock', 'lock nut', 'locknut', 'nylon insert', 'insert lock nut', 'nuts'],
    draw: (P) => P.union(P.rect(16, 4, 68, 36, 12), P.rect(16, 24, 68, 16), hexSide(P, 50, 47, 96, 49, 3)),
  },
  {
    id: 'flange-nut', name: 'Flange nut', cat: 'nut', tags: ['flange nut', 'serrated nut', 'whiz nut', 'flanged nut', 'nuts'],
    draw: (P) => P.sub(P.circle(50, 50, 48), P.sub(P.ngon(50, 50, 38, 6, 0), P.ngon(50, 50, 30, 6, 0)), P.circle(50, 50, 15)),
  },
  {
    id: 'wing-nut', name: 'Wing nut', cat: 'nut', tags: ['wing nut', 'wingnut', 'butterfly nut', 'nuts'],
    draw: (P) => P.union(P.path('M4 6 Q26 4 36 50 H64 Q74 4 96 6 Q94 50 66 66 H34 Q6 50 4 6 Z'), P.poly([[32, 50], [68, 50], [74, 96], [26, 96]])),
  },
  {
    id: 'acorn-nut', name: 'Acorn (cap) nut', cat: 'nut', tags: ['acorn nut', 'cap nut', 'dome nut', 'acorn', 'nuts'],
    draw: (P) => P.union(above(P, P.ellipse(50, 54, 32, 50), 54), hexSide(P, 50, 54, 90, 42, 3)),
  },
  {
    id: 'square-nut', name: 'Square nut', cat: 'nut', tags: ['square nut', 'nuts'],
    draw: (P) => P.sub(P.box(50, 50, 92, 92, 4), P.circle(50, 50, 22)),
  },
  {
    id: 't-nut', name: 'T-nut', cat: 'nut', tags: ['t-nut', 't nut', 'tee nut', 'tnut', 'blind nut', 'nuts'],
    draw: (P) => P.union(P.rect(2, 8, 96, 14, 3), P.rect(32, 20, 36, 76, 3),
      P.poly([[2, 20], [16, 20], [9, 46]]), P.poly([[84, 20], [98, 20], [91, 46]])),
  },
  {
    id: 'coupling-nut', name: 'Coupling nut', cat: 'nut', tags: ['coupling nut', 'rod coupler', 'extension nut', 'long nut'],
    draw: (P) => P.sub(P.union(P.rect(24, 20, 52, 60, 3), P.rotate(P.thread(50, 1, 99, 15, 8, { depth: 5 }), 90)),
      P.rect(23, 32, 54, 7), P.rect(23, 61, 54, 7)),
  },
  {
    id: 'castle-nut', name: 'Castle nut', cat: 'nut', tags: ['castle nut', 'castellated', 'slotted nut', 'nuts'],
    draw: (P) => P.union(hexSide(P, 50, 48, 96, 46, 3), P.sub(P.rect(16, 6, 68, 44, 3), P.rect(29, 5, 10, 22), P.rect(61, 5, 10, 22))),
  },
  {
    id: 'heat-set-insert', name: 'Heat-set insert', cat: 'nut', tags: ['heat set insert', 'heat-set', 'threaded insert', 'insert', 'brass insert', 'ruthex'],
    draw: (P) => {
      const stripes = (y0, y1, ang) => P.inter(P.union([-20, -3, 14, 31, 48, 65, 82, 99, 116].map((y) => P.rotate(P.box(50, y, 100, 7), ang, 50, y))), P.rect(20, y0, 60, y1 - y0));
      return P.sub(P.rect(22, 2, 56, 96, 5), stripes(0, 39, -28), stripes(61, 100, 28));
    },
  },
  {
    id: 'rivet-nut', name: 'Rivet nut', cat: 'nut', tags: ['rivet nut', 'rivnut', 'nutsert', 'blind rivet nut'],
    draw: (P) => P.sub(P.union(P.rect(6, 4, 88, 14, 3), P.rect(26, 18, 48, 78, 4)), P.rect(42, 3, 16, 80)),
  },
  {
    id: 'washer', name: 'Flat washer', cat: 'nut', tags: ['flat washer', 'washer', 'washers', 'sae washer', 'uss washer'],
    draw: (P) => P.ring(50, 50, 47, 20),
  },
  {
    id: 'lock-washer', name: 'Split lock washer', cat: 'nut', tags: ['split lock washer', 'lock washer', 'split washer', 'spring washer', 'helical washer', 'washers'],
    draw: (P) => P.sub(P.ring(50, 50, 47, 24), P.rotate(P.box(50, 14, 10, 36), 40)),
  },
  {
    id: 'star-washer', name: 'Star lock washer', cat: 'nut', tags: ['star washer', 'tooth washer', 'external tooth', 'internal tooth', 'star lock', 'washers'],
    draw: (P) => P.sub(P.star(50, 50, 49, 35, 12), P.circle(50, 50, 21)),
  },
  {
    id: 'fender-washer', name: 'Fender washer', cat: 'nut', tags: ['fender washer', 'penny washer', 'large washer', 'washers'],
    draw: (P) => P.ring(50, 50, 48, 11),
  },

  // ------------------------------------------------------------ anchors, nails & pins
  {
    id: 'nail', name: 'Nail', cat: 'fastener', tags: ['nail', 'nails', 'common nail', 'framing nail', 'spike'],
    draw: (P) => P.union(P.rect(20, 2, 60, 12, 3), P.rect(42, 13, 16, 68), P.poly([[42, 80], [58, 80], [50, 98]])),
  },
  {
    id: 'brad-nail', name: 'Finish nail / brad', cat: 'fastener', tags: ['brad', 'brad nail', 'finish nail', 'finishing nail', 'pin nail', 'panel pin'],
    draw: (P) => P.union(P.rect(36, 2, 28, 10, 3), P.rect(43, 11, 14, 72), P.poly([[43, 82], [57, 82], [50, 98]])),
  },
  {
    id: 'staple', name: 'Staple', cat: 'fastener', tags: ['staple', 'staples', 'crown staple', 'fence staple'],
    draw: (P) => P.union(P.line([[17, 82], [17, 14], [83, 14], [83, 82]], 14, { cap: 'butt' }),
      P.poly([[10, 82], [24, 82], [17, 98]]), P.poly([[76, 82], [90, 82], [83, 98]])),
  },
  {
    id: 'wall-anchor', name: 'Plastic wall anchor', cat: 'fastener', tags: ['wall anchor', 'plastic anchor', 'anchor', 'anchors', 'wall plug', 'rawl plug', 'drywall plug'],
    draw: (P) => P.sub(P.union(P.rect(14, 2, 72, 12, 3), finned(P, 14, 90, 40, 20, 5, 9, 8)), P.rect(46, 14, 8, 70)),
  },
  {
    id: 'toggle-bolt', name: 'Toggle bolt', cat: 'fastener', tags: ['toggle bolt', 'toggle', 'spring toggle', 'butterfly anchor', 'hollow wall anchor'],
    draw: (P) => P.union(P.rect(28, 2, 44, 12, 3), P.thread(50, 14, 98, 9, 7, { depth: 3 }),
      P.line([[50, 70], [12, 34]], 13), P.line([[50, 70], [88, 34]], 13), P.circle(50, 70, 12)),
  },
  {
    id: 'auger-anchor', name: 'Self-drilling anchor', cat: 'fastener', tags: ['self drilling anchor', 'self-drilling anchor', 'auger anchor', 'e-z ancor', 'ez anchor', 'zip-it', 'drywall anchor'],
    draw: (P) => P.sub(P.union(P.rect(10, 2, 80, 12, 3), finned(P, 14, 84, 36, 14, 4, 14, 14)), P.rect(45, 1, 10, 9)),
  },
  {
    id: 'cotter-pin', name: 'Cotter pin', cat: 'fastener', tags: ['cotter pin', 'cotter', 'split pin', 'cotter key'],
    draw: (P) => P.union(P.ring(50, 22, 20, 10), P.rect(34, 36, 13, 62, 2), P.rect(53, 36, 13, 50, 2)),
  },
  {
    id: 'hitch-pin', name: 'Hitch pin / R-clip', cat: 'fastener', tags: ['hitch pin', 'r-clip', 'r clip', 'hairpin', 'hair pin', 'bridge pin'],
    draw: (P) => P.union(P.line([[20, 24], [20, 94]], 11), P.arc(39, 24, 19, 180, 360, 11, { cap: 'butt' }),
      P.line([[58, 24], [64, 42], [86, 58], [68, 74], [74, 94]], 11)),
  },
  {
    id: 'clevis-pin', name: 'Clevis pin', cat: 'fastener', tags: ['clevis pin', 'clevis', 'headed pin'],
    draw: (P) => P.sub(P.union(P.rect(14, 2, 72, 18, 4), P.rect(30, 19, 40, 79, 5)), P.circle(50, 80, 8)),
  },
  {
    id: 'dowel', name: 'Dowel', cat: 'fastener', tags: ['dowel', 'dowels', 'dowel pin', 'wood dowel', 'fluted dowel'],
    draw: (P) => P.sub(P.poly([[8, 26], [92, 26], [98, 34], [98, 66], [92, 74], [8, 74], [2, 66], [2, 34]]), P.rect(12, 38, 76, 7), P.rect(12, 55, 76, 7)),
  },
  {
    id: 'roll-pin', name: 'Roll (spring) pin', cat: 'fastener', tags: ['roll pin', 'spring pin', 'slotted pin', 'tension pin', 'coiled pin'],
    draw: (P) => P.sub(P.ring(50, 50, 47, 29), P.box(50, 12, 10, 30)),
  },
  {
    id: 'pop-rivet', name: 'Pop (blind) rivet', cat: 'fastener', tags: ['pop rivet', 'blind rivet', 'pop rivets', 'rivet', 'rivets'],
    draw: (P) => P.union(P.rect(44, 2, 12, 40, 2), P.rect(10, 40, 80, 12, 4), P.rect(30, 52, 40, 34, 2), P.circle(50, 88, 10)),
  },
  {
    id: 'solid-rivet', name: 'Solid rivet', cat: 'fastener', tags: ['solid rivet', 'rivet', 'round head rivet', 'rivets'],
    draw: (P) => P.union(above(P, P.ellipse(50, 38, 46, 34), 38), P.rect(32, 37, 36, 61, 2)),
  },
  {
    id: 'compression-spring', name: 'Compression spring', cat: 'fastener', tags: ['compression spring', 'spring', 'springs', 'coil spring'],
    draw: (P) => {
      const pts = [[14, 6], [86, 6]];
      for (let i = 0; i < 5; i++) pts.push([14, 15 + i * 17.6], [86, 24 + i * 17.6]);
      pts.push([14, 94], [86, 94]);
      return P.line(pts, 9);
    },
  },
  {
    id: 'extension-spring', name: 'Extension spring', cat: 'fastener', tags: ['extension spring', 'tension spring', 'spring', 'springs', 'pull spring'],
    draw: (P) => {
      const pts = [[50, 24]];
      for (let i = 0; i < 4; i++) pts.push([16, 30 + i * 12], [84, 36 + i * 12]);
      pts.push([50, 76]);
      return P.union(P.ring(50, 14, 13, 5), P.line(pts, 8), P.ring(50, 86, 13, 5));
    },
  },
  {
    id: 'circlip', name: 'Circlip', cat: 'fastener', tags: ['circlip', 'retaining ring', 'snap ring', 'seeger', 'c-clip'],
    draw: (P) => P.union(P.sub(P.ring(50, 46, 44, 31), P.box(50, 88, 14, 30)),
      P.sub(P.circle(31, 80, 12), P.circle(31, 80, 4.5)), P.sub(P.circle(69, 80, 12), P.circle(69, 80, 4.5))),
  },
  {
    id: 'e-clip', name: 'E-clip', cat: 'fastener', tags: ['e-clip', 'e clip', 'eclip', 'e-ring', 'retaining clip'],
    draw: (P) => P.sub(P.union(P.sub(P.circle(50, 50, 47), P.circle(50, 50, 26), P.poly([[50, 50], [10, 104], [90, 104]])),
      P.box(50, 26, 14, 14, 3), P.rotate(P.box(50, 26, 14, 14, 3), 125), P.rotate(P.box(50, 26, 14, 14, 3), -125)), P.circle(50, 50, 17)),
  },

  // ------------------------------------------------------------ electrical
  {
    id: 'wire-nut', name: 'Wire nut', cat: 'elec', tags: ['wire nut', 'wirenut', 'wire connector', 'twist on', 'marrette'],
    draw: (P) => P.union(
      P.sub(P.union(P.path('M22 74 L32 16 Q50 -2 68 16 L78 74 Z'), P.rect(12, 64, 76, 14, 5)), P.rect(37, 20, 7, 38), P.rect(56, 20, 7, 38)),
      P.rect(32, 76, 10, 22), P.rect(58, 76, 10, 22)),
  },
  {
    id: 'lever-connector', name: 'Lever connector', cat: 'elec', tags: ['wago', 'lever nut', 'lever connector', 'splicing connector', '221'],
    draw: (P) => P.union(P.sub(P.rect(2, 36, 96, 56, 6), P.circle(20, 72, 8), P.circle(50, 72, 8), P.circle(80, 72, 8)),
      P.rect(6, 8, 26, 32, 4), P.rect(37, 8, 26, 32, 4), P.rect(68, 8, 26, 32, 4)),
  },
  {
    id: 'ring-terminal', name: 'Ring terminal', cat: 'elec', tags: ['ring terminal', 'ring connector', 'eyelet', 'crimp ring', 'lug'],
    draw: (P) => P.union(P.ring(50, 24, 23, 10), P.rect(40, 44, 20, 12), P.rect(30, 54, 40, 28, 5), P.rect(43, 80, 14, 18)),
  },
  {
    id: 'spade-terminal', name: 'Spade / fork terminal', cat: 'elec', tags: ['spade terminal', 'fork terminal', 'spade', 'fork', 'quick disconnect', 'crimp terminal'],
    draw: (P) => P.union(P.sub(P.rect(26, 2, 48, 46, 10), P.rect(43, 1, 14, 32, 4)), P.rect(40, 46, 20, 10), P.rect(30, 54, 40, 28, 5), P.rect(43, 80, 14, 18)),
  },
  {
    id: 'butt-splice', name: 'Butt splice', cat: 'elec', tags: ['butt splice', 'butt connector', 'splice', 'crimp splice', 'heat shrink connector'],
    draw: (P) => P.sub(P.union(P.rect(14, 28, 72, 44, 8), P.rect(0, 43, 100, 14)), P.rect(30, 27, 7, 46), P.rect(63, 27, 7, 46)),
  },
  {
    id: 'blade-fuse', name: 'Blade fuse', cat: 'elec', tags: ['blade fuse', 'automotive fuse', 'ato', 'mini fuse', 'atc', 'car fuse', 'fuse', 'fuses'],
    draw: (P) => P.union(P.sub(P.rect(8, 2, 84, 50, 8), P.rect(40, 14, 20, 26, 3)), P.rect(17, 50, 22, 48, 2), P.rect(61, 50, 22, 48, 2)),
  },
  {
    id: 'glass-fuse', name: 'Glass fuse', cat: 'elec', tags: ['glass fuse', 'cartridge fuse', 'fuse', 'fuses', '5x20', 'agc'],
    draw: (P) => P.union(P.rect(2, 28, 22, 44, 3), P.rect(76, 28, 22, 44, 3),
      P.sub(P.rect(22, 32, 56, 36), P.rect(22, 39, 56, 22)), P.rect(22, 46.5, 56, 7)),
  },
  {
    id: 'resistor', name: 'Resistor', cat: 'elec', tags: ['resistor', 'resistors', 'ohm', 'resistance'],
    draw: (P) => P.sub(P.union(P.rect(0, 46, 100, 8), P.rect(18, 26, 64, 48, 14)), P.rect(32, 25, 7, 50), P.rect(46.5, 25, 7, 50), P.rect(61, 25, 7, 50)),
  },
  {
    id: 'capacitor', name: 'Capacitor', cat: 'elec', tags: ['capacitor', 'capacitors', 'electrolytic', 'cap', 'uf'],
    draw: (P) => P.union(P.sub(P.rect(20, 2, 60, 68, 9), P.rect(62, 12, 7, 50), P.rect(19, 12, 62, 7)), P.rect(31, 68, 10, 30), P.rect(59, 68, 10, 22)),
  },
  {
    id: 'led', name: 'LED', cat: 'elec', tags: ['led', 'leds', 'light emitting diode', '5mm led', '3mm led'],
    draw: (P) => P.union(above(P, P.circle(50, 34, 28), 34), P.rect(22, 33, 56, 26), P.rect(14, 58, 72, 10, 3), P.rect(29, 67, 10, 31), P.rect(61, 67, 10, 22)),
  },
  {
    id: 'diode', name: 'Diode', cat: 'elec', tags: ['diode', 'diodes', 'rectifier', '1n4007', 'zener'],
    draw: (P) => P.union(P.rect(0, 45, 100, 10), P.poly([[26, 18], [26, 82], [66, 50]]), P.rect(66, 18, 10, 64)),
  },
  {
    id: 'battery', name: 'Battery', cat: 'elec', tags: ['battery', 'batteries', 'aa', 'aaa', 'cell', '18650'],
    draw: (P) => P.union(P.sub(P.rect(2, 24, 84, 52, 8), P.box(66, 50, 24, 8), P.box(66, 50, 8, 24), P.box(22, 50, 18, 8)), P.rect(86, 37, 12, 26, 3)),
  },
  {
    id: 'zip-tie', name: 'Zip tie', cat: 'elec', tags: ['zip tie', 'zip ties', 'cable tie', 'tie wrap', 'ty-rap'],
    draw: (P) => P.union(P.ring(44, 58, 40, 28), P.rect(28, 2, 32, 26, 4), P.line([[56, 10], [96, 10]], 11, { cap: 'butt' })),
  },
  {
    id: 'heat-shrink', name: 'Heat shrink', cat: 'elec', tags: ['heat shrink', 'heatshrink', 'shrink tube', 'heat shrink tubing'],
    draw: (P) => P.sub(P.union(P.rect(0, 43, 100, 14), P.poly([[14, 36], [28, 22], [72, 22], [86, 36], [86, 64], [72, 78], [28, 78], [14, 64]])), P.rect(38, 21, 7, 58), P.rect(55, 21, 7, 58)),
  },
  {
    id: 'jst-connector', name: 'JST / Dupont connector', cat: 'elec', tags: ['jst', 'dupont', 'connector', 'header', 'molex', 'xh', 'ph'],
    draw: (P) => P.union(P.sub(P.rect(4, 4, 92, 56, 5), P.box(26, 32, 13, 13), P.box(50, 32, 13, 13), P.box(74, 32, 13, 13)),
      P.rect(21, 60, 10, 38), P.rect(45, 60, 10, 38), P.rect(69, 60, 10, 38)),
  },
  {
    id: 'cable-clip', name: 'Cable clip', cat: 'elec', tags: ['cable clip', 'cable staple', 'wire clip', 'cable clamp', 'p clip'],
    draw: (P) => P.union(P.arc(50, 62, 36, 180, 360, 12, { cap: 'butt' }), P.rect(2, 56, 26, 12, 3), P.rect(72, 56, 26, 12, 3), P.circle(50, 64, 20)),
  },
  {
    id: 'light-bulb', name: 'Light bulb', cat: 'elec', tags: ['light bulb', 'bulb', 'bulbs', 'lamp', 'light'],
    draw: (P) => P.sub(P.union(P.circle(50, 34, 32), P.poly([[30, 56], [70, 56], [64, 72], [36, 72]]), P.rect(34, 70, 32, 22, 3), P.box(50, 94, 16, 8, 3)), P.rect(33, 79, 34, 7)),
  },
  {
    id: 'plug', name: 'Plug', cat: 'elec', tags: ['plug', 'power plug', 'power cord', 'cord', 'mains', 'extension cord'],
    draw: (P) => P.union(P.rect(18, 36, 64, 44, 8), P.rect(30, 4, 12, 34, 2), P.rect(58, 4, 12, 34, 2), P.rect(43, 78, 14, 20)),
  },
  {
    id: 'outlet', name: 'Outlet', cat: 'elec', tags: ['outlet', 'receptacle', 'socket', 'power outlet', 'gfci'],
    draw: (P) => P.sub(P.rect(10, 2, 80, 96, 14), P.box(35, 38, 9, 24, 2), P.box(65, 38, 10, 26, 2), P.path('M42 80 V72 A8 8 0 0 1 58 72 V80 Z')),
  },

  // ------------------------------------------------------------ plumbing & air
  {
    id: 'pipe-elbow', name: 'Elbow', cat: 'plumb', tags: ['elbow', '90', 'pipe elbow', 'fitting', 'fittings', 'pipe'],
    draw: (P) => P.union(P.line([[28, 84], [28, 28], [84, 28]], 26), P.box(28, 88, 40, 18, 3), P.box(88, 28, 18, 40, 3)),
  },
  {
    id: 'pipe-tee', name: 'Tee', cat: 'plumb', tags: ['tee', 'pipe tee', 't fitting', 'fitting', 'fittings'],
    draw: (P) => P.union(P.rect(4, 22, 92, 26), P.rect(37, 22, 26, 66), P.box(10, 35, 18, 40, 3), P.box(90, 35, 18, 40, 3), P.box(50, 88, 40, 18, 3)),
  },
  {
    id: 'pipe-coupling', name: 'Coupling', cat: 'plumb', tags: ['coupling', 'pipe coupling', 'union', 'sleeve', 'fitting'],
    draw: (P) => P.sub(P.union(P.rect(0, 36, 100, 28), P.rect(20, 22, 60, 56, 5)), P.rect(46.5, 21, 7, 58)),
  },
  {
    id: 'hose-clamp', name: 'Hose clamp', cat: 'plumb', tags: ['hose clamp', 'jubilee clip', 'worm clamp', 'clamp', 'clamps'],
    draw: (P) => P.union(P.ring(50, 56, 42, 31), P.sub(P.rect(24, 2, 52, 26, 4), P.rect(36, 1, 7, 12), P.rect(57, 1, 7, 12))),
  },
  {
    id: 'o-ring', name: 'O-ring', cat: 'plumb', tags: ['o-ring', 'o ring', 'oring', 'gasket', 'seal', 'o-rings'],
    draw: (P) => P.ring(50, 50, 47, 33),
  },
  {
    id: 'valve', name: 'Valve', cat: 'plumb', tags: ['valve', 'ball valve', 'shutoff', 'shut off', 'tap', 'faucet', 'spigot'],
    draw: (P) => P.union(P.rect(0, 54, 100, 28, 3), P.circle(50, 66, 25), P.rect(43, 22, 14, 24), P.rect(4, 8, 92, 16, 7)),
  },
  {
    id: 'quick-connect', name: 'Quick-connect fitting', cat: 'plumb', tags: ['quick connect', 'quick-connect', 'air fitting', 'coupler', 'air coupler', 'pneumatic', 'push to connect', 'air'],
    draw: (P) => P.union(P.sub(P.rect(22, 24, 44, 52, 5), P.rect(38, 23, 7, 54)),
      P.sub(P.rect(66, 36, 32, 28, 3), P.rect(80, 35, 7, 30)),
      P.poly([[2, 40], [22, 32], [22, 68], [2, 60]])),
  },

  // ------------------------------------------------------------ hardware & misc
  {
    id: 'bearing', name: 'Bearing', cat: 'misc', tags: ['bearing', 'bearings', 'ball bearing', '608', 'skate bearing'],
    draw: (P) => P.union(P.sub(P.circle(50, 50, 48), P.ring(50, 50, 38, 24), P.circle(50, 50, 13)), P.around(P.circle(50, 19, 7.5), 8)),
  },
  {
    id: 'magnet', name: 'Magnet', cat: 'misc', tags: ['magnet', 'magnets', 'neodymium', 'horseshoe', 'magnetic'],
    draw: (P) => P.sub(P.union(P.arc(50, 52, 32, 0, 180, 26, { cap: 'butt' }), P.rect(5, 6, 26, 46), P.rect(69, 6, 26, 46)), P.rect(4, 20, 28, 7), P.rect(68, 20, 28, 7)),
  },
  {
    id: 'hinge', name: 'Hinge', cat: 'misc', tags: ['hinge', 'hinges', 'butt hinge', 'door hinge'],
    draw: (P) => P.union(P.sub(P.rect(2, 10, 34, 80, 4), P.circle(19, 30, 6), P.circle(19, 70, 6)), P.sub(P.rect(64, 10, 34, 80, 4), P.circle(81, 30, 6), P.circle(81, 70, 6)),
      P.sub(P.rect(43, 2, 14, 96, 4), P.rect(42, 30, 16, 7), P.rect(42, 63, 16, 7))),
  },
  {
    id: 'corner-brace', name: 'Corner brace', cat: 'misc', tags: ['corner brace', 'mending plate', 'flat corner', 'l plate', 'corner plate'],
    draw: (P) => P.sub(P.union(P.rect(4, 4, 28, 92, 3), P.rect(4, 68, 92, 28, 3)), P.circle(18, 20, 6.5), P.circle(18, 48, 6.5), P.circle(52, 82, 6.5), P.circle(80, 82, 6.5)),
  },
  {
    id: 'angle-bracket', name: 'Angle bracket', cat: 'misc', tags: ['angle bracket', 'l bracket', 'l-bracket', 'shelf bracket', 'bracket', 'brackets'],
    draw: (P) => P.union(P.rect(6, 4, 16, 92, 2), P.rect(6, 80, 90, 16, 2), P.line([[18, 34], [66, 84]], 11)),
  },
  {
    id: 'caster', name: 'Caster', cat: 'misc', tags: ['caster', 'castor', 'wheel', 'casters', 'swivel caster'],
    draw: (P) => P.union(P.rect(14, 2, 72, 12, 3), P.rect(42, 13, 16, 10), P.arc(50, 62, 38, 180, 360, 11, { cap: 'butt' }), P.rect(6, 60, 11, 6), P.rect(83, 60, 11, 6),
      P.sub(P.circle(50, 64, 26), P.circle(50, 64, 8))),
  },
  {
    id: 'gear', name: 'Gear', cat: 'misc', tags: ['gear', 'gears', 'sprocket', 'cog', 'parts', 'spare parts'],
    draw: (P) => P.sub(P.gear(50, 50, 49, 10, 13), P.circle(50, 50, 14)),
  },
  {
    id: 'key', name: 'Key', cat: 'misc', tags: ['key', 'keys', 'key blank', 'keyring', 'lock'],
    draw: (P) => P.union(P.ring(24, 50, 22, 10), P.rect(42, 42, 56, 16, 2), P.rect(70, 56, 9, 14), P.rect(86, 56, 9, 18)),
  },
  {
    id: 'drill-bit', name: 'Drill bit', cat: 'misc', tags: ['drill bit', 'drill bits', 'twist drill', 'drill', 'bits'],
    draw: (P) => P.union(P.rect(37, 2, 26, 34, 2), P.sub(P.rect(37, 36, 26, 50), ...[44, 60, 76].map((y) => P.rotate(P.box(50, y, 40, 7), -30, 50, y))), P.poly([[37, 85], [63, 85], [50, 99]])),
  },
  {
    id: 'binder-clip', name: 'Spring clip', cat: 'misc', tags: ['binder clip', 'spring clip', 'clip', 'clips', 'bulldog clip'],
    draw: (P) => P.union(P.poly([[30, 50], [70, 50], [92, 96], [8, 96]]), P.line([[34, 54], [22, 8], [44, 8], [42, 54]], 8), P.line([[66, 54], [78, 8], [56, 8], [58, 54]], 8)),
  },
  {
    id: 'rubber-foot', name: 'Rubber foot', cat: 'misc', tags: ['rubber foot', 'rubber feet', 'bumper', 'bumpers', 'bumpon', 'foot', 'feet'],
    draw: (P) => P.sub(P.union(above(P, P.ellipse(50, 74, 44, 56), 74), P.rect(2, 72, 96, 12, 3)), P.rect(45, 24, 10, 61)),
  },
  {
    id: 'standoff', name: 'Standoff', cat: 'misc', tags: ['standoff', 'standoffs', 'spacer', 'spacers', 'hex standoff', 'pcb standoff'],
    draw: (P) => P.union(hexSide(P, 50, 4, 60, 62, 3), P.thread(50, 66, 98, 12, 8, { depth: 4 })),
  },
  {
    id: 'hook', name: 'Hook', cat: 'misc', tags: ['hook', 'hooks', 'bungee', 'bungee cord', 'utility hook', 'tie down'],
    draw: (P) => P.union(P.ring(50, 14, 12, 5), P.line([[50, 26], [50, 56]], 12), P.arc(34, 60, 16, 0, 180, 12), P.line([[18, 60], [14, 50]], 12)),
  },
  {
    id: 'cup-hook', name: 'Cup hook', cat: 'misc', tags: ['cup hook', 'screw hook', 'hook screw', 'mug hook'],
    draw: (P) => P.union(P.flipY(P.thread(50, 2, 38, 10, 7, { depth: 4, tip: 10 }), 20), P.rect(30, 36, 40, 10, 3), P.line([[50, 46], [50, 66]], 12),
      P.arc(30, 66, 20, 0, 180, 12), P.line([[10, 66], [10, 54]], 12)),
  },
  {
    id: 's-hook', name: 'S-hook', cat: 'misc', tags: ['s-hook', 's hook', 'shook', 'hanging hook'],
    draw: (P) => P.union(P.arc(50, 28, 21, 330, 90, 12), P.arc(50, 72, 21, 270, 510, 12)),
  },
  {
    id: 'chain', name: 'Chain', cat: 'misc', tags: ['chain', 'chain link', 'quick link', 'links'],
    draw: (P) => P.union(P.rect(0, 42, 30, 16, 8), P.sub(P.rect(22, 24, 56, 52, 24), P.rect(33, 35, 34, 30, 14)), P.rect(70, 42, 30, 16, 8)),
  },
  {
    id: 'pulley', name: 'Pulley', cat: 'misc', tags: ['pulley', 'pulleys', 'sheave', 'block', 'idler'],
    draw: (P) => P.union(P.ring(50, 12, 11, 4), P.rect(44, 21, 12, 14), P.sub(P.circle(50, 62, 34), P.ring(50, 62, 24, 17), P.circle(50, 62, 7)), P.rect(80, 62, 10, 36)),
  },

  // ------------------------------------------------------------ 3D printing
  {
    id: 'nozzle', name: 'Nozzle', cat: 'print', tags: ['nozzle', 'nozzles', 'hotend', 'mk8', 'v6', 'e3d'],
    draw: (P) => P.union(P.thread(50, 2, 26, 20, 7, { depth: 5 }), hexSide(P, 50, 26, 84, 30, 3), P.poly([[28, 56], [72, 56], [57, 88], [43, 88]]), P.rect(44, 87, 12, 11)),
  },
  {
    id: 'spool', name: 'Filament spool', cat: 'print', tags: ['filament', 'spool', 'pla', 'petg', 'abs', 'tpu', 'asa'],
    draw: (P) => {
      const ann = P.ring(50, 50, 36, 17);
      const win = (a) => P.inter(ann, P.rotate(P.poly([[50, 50], [100, 30], [100, 70]]), a));
      return P.sub(P.circle(50, 50, 48), P.circle(50, 50, 9), win(0), win(90), win(180), win(270));
    },
  },

  // ------------------------------------------------------------ symbols
  {
    id: 'warning', name: 'Warning', cat: 'mark', tags: ['warning', 'caution', 'danger', 'hazard', 'sharp'],
    draw: (P) => P.sub(P.offset(P.poly([[50, 12], [92, 86], [8, 86]]), 6), P.box(50, 50, 11, 30, 3), P.circle(50, 76, 6.5)),
  },
  {
    id: 'star', name: 'Star', cat: 'mark', tags: ['star', 'favorite', 'favorite', 'special'],
    draw: (P) => P.star(50, 53, 50, 21, 5),
  },
  {
    id: 'arrow', name: 'Arrow', cat: 'mark', tags: ['arrow', 'right', 'this way', 'direction'],
    draw: (P) => P.union(P.rect(4, 38, 56, 24, 3), P.poly([[52, 12], [98, 50], [52, 88]])),
  },
  {
    id: 'check', name: 'Check', cat: 'mark', tags: ['check', 'tick', 'ok', 'done', 'good'],
    draw: (P) => P.line([[12, 54], [38, 80], [88, 22]], 17),
  },
  {
    id: 'dot', name: 'Dot', cat: 'mark', tags: ['dot', 'circle', 'bullet'],
    draw: (P) => P.circle(50, 50, 48),
  },
];
