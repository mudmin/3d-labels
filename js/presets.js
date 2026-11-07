// Label size presets, in mm.
//   note  shown under the size fields when the preset is picked
//   t     the most a label can be to slide into the holder, mm, where known
// Sources are noted per group. Molds change and makers vary: measure your own bin
// when it matters, and print one label before a batch.
const IN = 25.4;
const i = (v) => Math.round(v * IN * 100) / 100;

const SLOT = 'Slides into a slot made for paper inserts: print one first, it may need to be thin.';

export const SIZE_PRESETS = [
  // Uline product pages publish each unit's label-holder size (uline.com S-23087 etc.).
  // The same cups appear to be Quantum QTB units.
  { group: 'Tip-out bins: handle label holder (Uline / Quantum QTB)', items: [
    { id: 'tipout-h9', name: '9 bins per row (S-23087, QTB309)', w: i(1.125), h: i(0.375), note: 'Uline label holder 1 1/8 × 3/8". ' + SLOT },
    { id: 'tipout-h6', name: '6 bins per row (S-21119, QTB306)', w: i(2), h: i(0.5), note: 'Uline label holder 2 × 1/2". ' + SLOT },
    { id: 'tipout-h5', name: '5 bins per row (S-21120, QTB305)', w: i(3.125), h: i(0.8125), note: 'Uline label holder 3 1/8 × 13/16". ' + SLOT },
    { id: 'tipout-h4', name: '4 bins per row (S-21121, QTB304)', w: i(3.125), h: i(1), note: 'Uline label holder 3 1/8 × 1". ' + SLOT },
    { id: 'tipout-h3', name: '3 bins per row (S-23088, QTB303)', w: i(4.375), h: i(1.125), note: 'Uline label holder 4 3/8 × 1 1/8". ' + SLOT },
    { id: 'tipout-h2', name: '2 bins per row (S-23089, QTB302)', w: i(5), h: i(1.75), note: 'Uline label holder 5 × 1 3/4". ' + SLOT },
  ] },
  // Labels that stand inside the clear front of the bin, facing out. Width = the
  // published inside width less 1/8"; height is a bit under half the inside height
  // (1 3/4" to 9 1/2" inside), so parts can sit in front of the label.
  { group: 'Tip-out bins: inside the front, facing out', items: [
    { id: 'tipout-9', name: '9 bins per row (1 7/8 × 1 3/4" inside)', w: i(1.75), h: i(1), note: 'Stands inside the clear front, facing out. Bin inside: 1 7/8" wide, 1 3/4" tall.' },
    { id: 'tipout-6', name: '6 bins per row (3 1/8 × 2 3/4" inside)', w: i(3), h: i(1.25), note: 'Stands inside the clear front, facing out. Bin inside: 3 1/8" wide, 2 3/4" tall.' },
    { id: 'tipout-5', name: '5 bins per row (3 7/8 × 4 1/4" inside)', w: i(3.75), h: i(1.75), note: 'Stands inside the clear front, facing out. Bin inside: 3 7/8" wide, 4 1/4" tall.' },
    { id: 'tipout-4', name: '4 bins per row (5 × 5 1/4" inside)', w: i(4.875), h: i(2), note: 'Stands inside the clear front, facing out. Bin inside: 5" wide, 5 1/4" tall.' },
    { id: 'tipout-3', name: '3 bins per row (6 7/8 × 6 3/8" inside)', w: i(6.75), h: i(2.5), note: 'Stands inside the clear front, facing out. Bin inside: 6 7/8" wide, 6 3/8" tall.' },
    { id: 'tipout-2', name: '2 bins per row (10 1/2 × 9 1/2" inside)', w: i(10.375), h: i(3), note: 'Stands inside the clear front, facing out. Bin inside: 10 1/2" wide, 9 1/2" tall. At 263.5 mm wide it needs a big bed (Neptune 4 Max), or the U1 with the bed margin at 3 mm.' },
    { id: 'tiltview-6', name: 'Akro TiltView 06706 (3" cup)', w: i(2.75), h: i(0.75), note: 'Akro TiltView cup inside width 3". Height is a suggestion; the molded holder size is not published.' },
    { id: 'tiltview-5', name: 'Akro TiltView 06705 (3 7/8" cup)', w: i(3.625), h: i(0.875), note: 'Akro TiltView cup inside width 3 7/8". Height is a suggestion.' },
    { id: 'tiltview-4', name: 'Akro TiltView 06704 (4 7/8" cup)', w: i(4.625), h: i(1), note: 'Akro TiltView cup inside width 4 7/8". Height is a suggestion.' },
  ] },
  // Akro-Mils labeling sheet AKM125 and 2022 Industrial Catalog; community prints agree.
  { group: 'Akro-Mils AkroBins & shelf bins (card holders)', items: [
    { id: 'akro-30210', name: 'AkroBin 30210 / 30220 / 30224, ShelfMax 6"', w: i(3), h: i(1), t: 1, note: 'Card holder 29301, 3 × 1". Printed labels about 1 mm thick are reported to fit.' },
    { id: 'akro-30230', name: 'AkroBin 30230 – 30255, 30348, 30358', w: i(4), h: i(1.75), t: 2, note: 'Card holder 29302, 4 × 1 3/4".' },
    { id: 'akro-30260', name: 'AkroBin 30260 / 30265 / 30270', w: i(4), h: i(2), note: 'Card holder 29303, 4 × 2".' },
    { id: 'akro-shelf4', name: 'Akro 4" shelf bins (30120, 30130, 30150…)', w: i(3), h: i(0.8125), t: 1, note: 'Card holder 29300, 3 × 13/16". Printed labels 1 mm thick are reported to fit.' },
    { id: 'akro-30110', name: 'Akro 30110 shelf bin', w: 49, h: 19, t: 1, note: 'Slot 1 15/16" wide; community prints are 50 × 20 × 1 mm.' },
    { id: 'akro-40410', name: 'Akro 40410 extended label holder', w: i(4), h: i(2.375), note: 'Label face 4 × 2 3/8".' },
    { id: 'akro-29304', name: 'Akro 29304 stick-on holder (Super-Size bins)', w: i(3.5), h: i(2), note: '3 1/2 × 2" holder.' },
  ] },
  // Quantum 2025 catalog (which holder fits which bin); sizes from retailer listings.
  { group: 'Quantum shelf & stack bins (LTR holders)', items: [
    { id: 'q-ltr1300', name: 'QUS210 / 220 / 232 / 236 (LTR-1300)', w: i(3), h: i(1), note: 'Label holder 3 × 1".' },
    { id: 'q-ltr1253', name: 'QUS224, QSB 8" shelf bins (LTR-1253)', w: i(3), h: i(1.25), note: 'Label holder 3 × 1 1/4".' },
    { id: 'q-ltr1754', name: 'QUS230 – 265, Magnum bins (LTR-1754)', w: i(4), h: i(1.75), t: 1.5, note: 'Label holder 4 × 1 3/4", 0.06" (1.5 mm) deep.' },
    { id: 'q-ltr2400', name: 'QUS270 / 275 (LTR-2400)', w: i(4), h: i(2), t: 1.5, note: 'Label holder 4 × 2", 0.06" (1.5 mm) deep.' },
    { id: 'q-ltr0813', name: 'QSB 4" and 6" shelf bins (LTR-0813)', w: i(3), h: i(0.8125), note: 'Label holder 3 × 13/16".' },
    { id: 'q-elh', name: 'Quantum extended holder ELH410 / 445', w: i(4), h: i(2.25), note: 'Label face 4 × 2 1/4".' },
  ] },
  // Front faces (no label slot): sizes leave a margin round the published drawer front.
  { group: 'Drawer cabinets (on the drawer front)', items: [
    { id: 'akro-small-drawer', name: 'Akro 10144 / 10164 / 10124 small drawer', w: 48, h: 16, note: 'Small drawer front is about 2 1/8 × 1 1/2" (54 × 38 mm) with a pull in the middle: this strip fits above or below it.' },
    { id: 'akro-large-drawer', name: 'Akro 10144 / 10164 large drawer', w: 100, h: 18, note: 'Large drawer front is about 4 3/8 × 2" (111 × 51 mm).' },
    { id: 'akro-19-2', name: 'Akro 19-series steel, 2 3/16" drawer', w: 50, h: 15, note: 'Drawer 2 3/16 × 2 1/16". The drawer has a label window; its size is not published.' },
    { id: 'akro-19-3', name: 'Akro 19-series steel, 3 3/16" drawer', w: 75, h: 15, note: 'Drawer 3 3/16 × 2 1/16".' },
    { id: 'akro-19-5', name: 'Akro 19-series steel, 5 3/16" drawer', w: 125, h: 20, note: 'Drawer 5 3/16 × 3 1/16".' },
    { id: 'quantum-pdc-s', name: 'Quantum PDC small drawer', w: 46, h: 14, note: 'Small drawer front about 2 × 1 1/4".' },
    { id: 'quantum-pdc-m', name: 'Quantum PDC medium drawer', w: 100, h: 18, note: 'Medium drawer front about 4 1/4 × 2".' },
    { id: 'hf-storehouse-40', name: 'Harbor Freight Storehouse 40-bin', w: 36, h: 10, t: 3, note: 'Slide-in drawer label, from community prints (36 × 10 mm).' },
  ] },
  // No maker publishes these; sizes come from popular community models.
  { group: 'Tool-system organizers (community sizes)', items: [
    { id: 'packout-5', name: 'Milwaukee Packout 5-compartment', w: 100, h: 20, note: 'Handle label face, from community prints.' },
    { id: 'packout-11', name: 'Milwaukee Packout 11-compartment', w: 118.5, h: 24.5, note: 'Handle label face, from community prints.' },
    { id: 'packout-lp', name: 'Milwaukee low-profile half-width', w: 125, h: 18, note: 'Handle label, from community prints.' },
    { id: 'tstak-s', name: 'DeWalt TSTAK / Stanley / Craftsman, small', w: 75, h: 15, note: 'Clip-on holder size used by community models.' },
    { id: 'tstak-m', name: 'DeWalt TSTAK / Stanley / Craftsman, medium', w: 105, h: 25, note: 'Clip-on holder size used by community models.' },
    { id: 'tstak-l', name: 'DeWalt TSTAK / Stanley / Craftsman, large', w: 157, h: 25, note: 'Clip-on holder size used by community models.' },
    { id: 'tstak-cup', name: 'DeWalt TSTAK cup', w: 25, h: 9, note: 'Cup label area, from a community model.' },
    { id: 'husky-11', name: 'Husky 11" parts organizer', w: 125, h: 25, note: 'Nameplate, from community prints.' },
    { id: 'hf-cup-1', name: 'Harbor Freight organizer cup', w: 39, h: 10.3, t: 0.6, note: 'Snap-on nameplate, from community prints (0.6 mm thick).' },
    { id: 'hf-cup-2', name: 'Harbor Freight double cup', w: 54, h: 10.3, t: 0.6, note: 'Snap-on nameplate, from community prints.' },
  ] },
  // Gridfinity has no label standard; these match the two popular label systems
  // (gflabel's pred and cullenect bases).
  { group: 'Gridfinity', items: [
    ...[1, 2, 3, 4, 5, 6].map((u) => ({ id: `gf-pred-${u}`, name: `Pred label, ${u}u`, w: Math.round((42 * u - 4.2) * 10) / 10, h: 11.5, t: 0.8, note: 'For Pred\'s parametric bins: 11.5 mm tall, about 0.8 mm thick.' })),
    ...[1, 2, 3, 4, 5, 6].map((u) => ({ id: `gf-cull-${u}`, name: `Cullen J Webb label, ${u}u`, w: u === 1 ? 36.4 : 42 * u - 6, h: 11, t: u === 1 ? 1 : 1.2, note: 'For cullenect-style label slots: 11 mm tall.' })),
  ] },
  { group: 'IKEA', items: [
    { id: 'ikea-helmer', name: 'HELMER drawer label slot', w: 51, h: 22, t: 1, note: 'From community prints (about 1 mm thick).' },
    { id: 'ikea-alex', name: 'ALEX (with a clip-on holder)', w: 57, h: 25, note: 'Fits the common community clip-on holder for ALEX drawers.' },
  ] },
  { group: 'Common sizes (inches)', items: [
    { id: 'in-1x05', name: '1" × 1/2"', w: i(1), h: i(0.5) },
    { id: 'in-15x05', name: '1 1/2" × 1/2"', w: i(1.5), h: i(0.5) },
    { id: 'in-2x05', name: '2" × 1/2"', w: i(2), h: i(0.5) },
    { id: 'in-2x075', name: '2" × 3/4"', w: i(2), h: i(0.75) },
    { id: 'in-2x1', name: '2" × 1"', w: i(2), h: i(1) },
    { id: 'in-258x078', name: '2 5/8" × 7/8"', w: i(2.625), h: i(0.875) },
    { id: 'in-3x075', name: '3" × 3/4"', w: i(3), h: i(0.75) },
    { id: 'in-3x1316', name: '3" × 13/16"', w: i(3), h: i(0.8125) },
    { id: 'in-3x1', name: '3" × 1"', w: i(3), h: i(1) },
    { id: 'in-3x114', name: '3" × 1 1/4"', w: i(3), h: i(1.25) },
    { id: 'in-4x1', name: '4" × 1"', w: i(4), h: i(1) },
    { id: 'in-4x134', name: '4" × 1 3/4"', w: i(4), h: i(1.75) },
    { id: 'in-4x2', name: '4" × 2"', w: i(4), h: i(2) },
  ] },
  { group: 'Common sizes (mm)', items: [
    { id: 'mm-12tape', name: '12 mm strip × 50', w: 50, h: 12, note: 'Same height as 12 mm label-maker tape.' },
    { id: 'mm-18tape', name: '18 mm strip × 60', w: 60, h: 18, note: 'Same height as 18 mm label-maker tape.' },
    { id: 'mm-40x12', name: '40 × 12 mm', w: 40, h: 12 },
    { id: 'mm-50x15', name: '50 × 15 mm', w: 50, h: 15 },
    { id: 'mm-60x20', name: '60 × 20 mm', w: 60, h: 20 },
    { id: 'mm-80x25', name: '80 × 25 mm', w: 80, h: 25 },
    { id: 'mm-100x30', name: '100 × 30 mm', w: 100, h: 30 },
  ] },
];

export function findPreset(id) {
  for (const g of SIZE_PRESETS) for (const p of g.items) if (p.id === id) return { ...p, group: g.group };
  return null;
}
