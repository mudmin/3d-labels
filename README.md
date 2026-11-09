# 3D Labels

A browser tool for two-color 3D-printed bin labels: a thin plate in one color with text and an icon in another, like `3" Deck Screws` in orange on black with a Torx head on the left. It has size presets for common bins, 122 built-in hardware icons, CSV import, and downloads for single labels or whole bed-sized plates.

If it saves you some time, you can [support the project here](https://userspice.com/donate/).

It runs entirely in the browser, with no build step and no server code. To host it yourself, serve the folder from any web server and open `index.html`. Opening it straight from disk (`file://`) won't work.

## Use

1. **Label size** sets the default size for every label. Pick a preset or type a width and height. In inches you can type fractions (`1 7/8`), and `mm` or `"` after a number overrides the units. **Size from a row of bins** divides a row width by the number of bins in it. Any label can have its own size in the list's **Size** column (`3 x 3/4`, or `76 x 19mm`).
2. **Text** sets the font and the height of a capital letter on each line, in mm. **Text size** decides what happens to long text:
   - **Always this size** keeps every label's letters the same height. Long lines get narrower letters first, down to **Squeeze to**, and anything still too long is outlined in red.
   - **This size, smaller only if it won't fit** squeezes, then shrinks.
   - **As big as fits** fills the label.

   **Add your own font…** at the bottom of the font list takes a TTF, OTF or WOFF file. WOFF2 isn't supported.
3. **Icon & border** places the icon left, right or on top (on top suits tall labels), sets its size and the padding, and adds an optional border.
4. **Printing** chooses how the two colors get printed (see below) and shows what to do in the slicer.
5. **Printer bed** lays labels out on plates: pick your printer or type the bed size. The **Copies** column says how many of each label to print.
6. **Download** the selected label, every label (one file each, zipped), the plate shown on the Plates tab, or all plates.

Type in the list to edit labels. **Enter** moves down a row and adds a new label at the end. `|` in the text starts a new line.

### Two colors

**One nozzle: pause and swap filament.** This works on any printer. Download the one-body STL. The Printing panel names the layer to pause before, for example "Swap filament before layer 7" for a 1.2 mm plate at 0.2 mm layers, and how to add that pause in PrusaSlicer, Orca/Bambu/Elegoo Slicer and Cura. Two text styles print with one swap:

- **Raised:** the plate prints in the plate color, then the letters stand on top in the text color.
- **Recessed:** a thin solid layer prints in the text color first, then the plate color on top with the letters cut through, so the top is flat. **Print face down** puts the face on the bed for a smooth or textured finish.

**Multi-material (AMS, MMU, toolchanger).** No pausing. Download a 3MF and the plate and text arrive as two parts of one object, already set to filaments 1 and 2. You can change those numbers in the Printing panel. The two slicer families read 3MF parts differently, so there are two 3MF choices:

- **3MF for Bambu Studio / Orca** works in OrcaSlicer, Bambu Studio and their forks: Elegoo Slicer, Snapmaker Orca (U1), Creality Print. Bambu Studio may warn that the file is "not from Bambu Lab", or in version 2.08.2 that it has an "invalid config", and load "geometry data only". Click OK. The file carries no printer settings on purpose, so your own settings stay in place. The plate and text carry your plate and text colors, so Bambu can match them to filaments, adding a second filament if the project has only one.
- **3MF for PrusaSlicer**.
- **STL per color** is for Cura and anything else. Load both files together as one object with two parts, then set the text part's filament.

**Flush inlay** is multi-material only: both colors share the face layers, which gives a perfectly flat face. It looks best with **Print face down**.

Keep capital letters at least 3 mm tall for a 0.4 mm nozzle, and make the thicknesses whole layers. **Round to layers** appears when they aren't. Two or three layers of text color hide the plate color underneath.

### Icons and your own graphics

Click a label's icon to choose one of 122 built-in icons, grouped as screw drives, screws and bolts, head profiles, nuts and washers, anchors and pins, electrical, plumbing, hardware and 3D printing. Search by name or by words like `t25`, `nyloc` or `wago`. **Guess icons** picks one from each label's text for labels that don't have one, so `3" Deck Screws` gets the deck screw.

**Add your own (SVG or image)…** takes:
- **An SVG.** Filled shapes and strokes are both kept, so line icons from sets like Lucide or Tabler work. White shapes cut holes. Convert text to paths first.
- **A PNG, JPEG or WebP.** It's traced, with a threshold slider and a choice of dark, light or opaque parts as the ink.

Your graphics and fonts are kept in this browser for every project. They're listed, and can be deleted, in the Projects menu.

### CSV

**Import CSV…** reads a file or text pasted from a spreadsheet, either comma- or tab-separated. The columns can come in any order after a header row:

| Column | Also accepted as | Example |
|---|---|---|
| `title` | text, name, label | `3" Deck Screws` |
| `subtitle` | line 2, detail, spec | `#9 Torx T25` |
| `icon` | graphic, symbol | `torx`, `Hex nut`, or the name of your own graphic |
| `qty` | copies, count | `4` |
| `size` | dimensions | `3 x 3/4` (empty = the default size) |

Without a header, the columns are read as title, subtitle, icon, qty. **Download a template** gives an example file, and **Export CSV** writes the current list in the same format.

### Projects

The project button at the top left opens the Projects menu. Everything saves as you go, in this browser's IndexedDB. From the menu you can:

- start a new project (it keeps the current size, style and printer)
- rename the project, or save a copy and switch to it
- open other saved projects
- **Download this project**: a `.labels.json` file with any of your fonts and graphics it uses, to keep or to open on another computer.

## Size presets

`js/presets.js` lists the presets and where each size comes from:

- **Uline / Quantum tip-out bins:** the handle label holders, from Uline's published sizes, and labels stuck inside the front, sized to each bin's inside width.
- **Akro-Mils:** AkroBin and shelf-bin card holders, from Akro's labeling sheet and catalog.
- **Quantum:** LTR label holders.
- **Drawer cabinets:** strips sized to the drawer fronts.
- **Milwaukee Packout, DeWalt TSTAK, Husky, Harbor Freight:** sizes from popular community prints. No maker publishes these.
- **Gridfinity:** the Pred and Cullen J Webb label sizes.
- **IKEA:** HELMER and ALEX.
- **Common inch and mm sizes.**

A preset with a known slot depth warns when the label is too thick to slide in. Molds change, so print one label before a batch.

## Files

- `js/label.js`: label layout (text fitting, icon, border), the 3D parts for each text style, layer and pause maths, and plate packing (rows or MaxRects, whichever needs fewer plates). No DOM code, so it also runs in Node.
- `js/fonts.js`: font loading and cached glyph outlines (opentype.js). No DOM code.
- `js/icons.js`: the built-in icons, drawn with `js/iconkit.js`. Each one is a function on a 100 × 100 box built from circles, polygons, threads and booleans, so the preview and the print come from the same shapes.
- `js/geom.js`: SVG path parsing, polygon helpers, and the STL and 3MF writers. No DOM code.
- `js/graphics.js`: your SVGs and traced images.
- `js/presets.js`: label size presets. `js/printers.js`: printer beds.
- `js/util.js`: units and fractions, CSV, icon matching. `js/store.js`: IndexedDB storage.
- `js/app.js`: the user interface, plate view and 3D preview (three.js).
- `tools/render-icons.mjs`: draws every icon on one contact sheet: `node tools/render-icons.mjs icons.svg [filter]`. It writes a PNG too when Chrome is installed.
- `tools/try-label.mjs`: builds one label from the command line: `node tools/try-label.mjs out "3\" Deck Screws" "#9 Torx T25" torx --style=recessed`.
- `fonts/`: seven bundled fonts, all under the SIL Open Font License (see `fonts/OFL-*.txt`).
- `vendor/`: [manifold-3d](https://github.com/elalish/manifold) 3.5.1 for the geometry, three.js r185, fflate 0.8.2 for zips, and opentype.js 1.3.4 for fonts.

### Adding icons

Add an entry to `ICONS` in `js/icons.js` with an `id` (never rename one, since saved projects use it), a `name`, a category and search `tags`. Its `draw(P)` returns a shape made with the kit, for example `P.sub(P.circle(50, 50, 46), P.torx(50, 50, 31))`. Keep strokes and gaps at least 7 units wide, because icons print at 10–20 mm. Check new icons with `tools/render-icons.mjs`.

## Hosting and license

`.github/workflows/pages.yml` deploys to GitHub Pages and publishes only the files the browser needs. For now it only runs when started by hand from the Actions tab; add a `push` trigger to deploy on every push to `main`.

3D Labels is MIT licensed (see `LICENSE`). The bundled libraries and fonts keep their own licenses: three.js, fflate and opentype.js are MIT, manifold-3d is Apache-2.0, and the fonts are OFL.
