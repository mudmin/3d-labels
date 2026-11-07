// Printable bed area (X x Y, mm) for common printers. Pick "Custom" for anything else.
// multi: 'built-in' when the printer prints several colors out of the box,
// 'option' when a common add-on (AMS, CFS, MMU...) does it.
export const PRINTERS = [
  { group: 'Elegoo', items: [
    ['Neptune 3', 220, 220],
    ['Neptune 3 Pro', 225, 225],
    ['Neptune 3 Plus', 320, 320],
    ['Neptune 3 Max', 420, 420],
    ['Neptune 4 / 4 Pro', 225, 225],
    ['Neptune 4 Plus', 320, 320],
    ['Neptune 4 Max', 420, 420],
    ['Centauri Carbon', 256, 256, 'option'],
  ] },
  { group: 'Snapmaker', items: [
    ['U1 (toolchanger)', 270, 270, 'built-in'],
    ['J1 / J1s (IDEX)', 300, 200, 'built-in'],
    ['Artisan', 400, 400, 'built-in'],
    ['2.0 A350', 320, 350],
    ['2.0 A250', 230, 250],
  ] },
  { group: 'Bambu Lab', items: [
    ['A1 mini', 180, 180, 'option'],
    ['A1', 256, 256, 'option'],
    ['P1P / P1S / X1C / P2S', 256, 256, 'option'],
    ['H2S', 340, 320, 'option'],
    ['H2D', 325, 320, 'built-in'],
  ] },
  { group: 'Prusa', items: [
    ['MINI+', 180, 180],
    ['MK3S+ / MK4 / MK4S', 250, 210, 'option'],
    ['CORE One', 250, 220, 'option'],
    ['XL (toolchanger)', 360, 360, 'built-in'],
  ] },
  { group: 'Creality', items: [
    ['Ender 3 / V2 / Pro / S1', 220, 220],
    ['Ender 3 V3 / SE / KE', 220, 220],
    ['Ender 3 S1 Plus / V3 Plus', 300, 300],
    ['Ender 5 S1', 220, 220],
    ['K1 / K1C / K1 SE', 220, 220, 'option'],
    ['K1 Max', 300, 300, 'option'],
    ['K2 Plus', 350, 350, 'option'],
    ['Hi', 260, 260, 'option'],
    ['CR-10', 300, 300],
  ] },
  { group: 'Anycubic', items: [
    ['Kobra 2 / Neo / Pro', 220, 220],
    ['Kobra 3 / Kobra S1', 250, 250, 'option'],
    ['Kobra 2 Plus', 320, 320],
    ['Kobra 2 Max / 3 Max', 420, 420],
  ] },
  { group: 'Qidi', items: [
    ['Q1 Pro', 245, 245],
    ['Plus4', 305, 305, 'option'],
    ['X-Max 3', 325, 325],
  ] },
  { group: 'Flashforge', items: [
    ['Adventurer 5M / 5M Pro', 220, 220],
    ['AD5X', 220, 220, 'built-in'],
  ] },
  { group: 'Other', items: [
    ['Sovol SV06', 220, 220],
    ['Sovol SV06 Plus', 300, 300],
    ['Sovol SV08', 350, 350],
    ['Artillery Sidewinder X3/X4 Plus', 300, 300],
    ['Voron 250', 250, 250],
    ['Voron 300', 300, 300],
    ['Voron 350', 350, 350],
  ] },
];

export const DEFAULT_PRINTER = 'Elegoo / Neptune 4 / 4 Pro';

export function findPrinter(id) {
  for (const g of PRINTERS) for (const [name, w, h, multi] of g.items) {
    if (`${g.group} / ${name}` === id) return { id, w, h, multi: multi || '' };
  }
  return null;
}
