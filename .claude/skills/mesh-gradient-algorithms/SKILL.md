---
name: mesh-gradient-algorithms
description: Use when editing, reviewing, optimizing, or debugging how images get produced in this package — src/random.ts, src/render.ts, the look constants, the grain overlay, pickPalette, paletteAccent, or the complement color math in src/color.ts — or when a change might alter rendered pixels for an existing seed.
---

# Mesh-gradient algorithms

Every published image is a pure function of `(seed, palette, width, height, look)`. Four algorithms produce it, and the render path is guarded by a golden fixture. A fifth, the complement, derives a chip color from the palette and never touches pixels.

## The seeded-stream contract (read before touching src/render.ts or src/random.ts)

`createSeededRandom(hashStringToInt(seed))` creates **one** PRNG stream (FNV-1a hash → mulberry32). `renderCanvas` draws from it in a fixed order:

1. three `createNoise2D(random)` generators — horizontal warp, vertical warp, color field;
2. then one `random()` per pixel for the grain overlay.

Adding, removing or reordering *any* draw — including a different number of grain draws — changes the image for every existing seed. So do the look constants in `defaultLook`. This is not an internal detail: the package's stated promise is that a seed always renders the same image, and consumers (Aspect's release artwork) store seeds, not images.

**`npm test` catches this.** The test `reproduces the Aspect 0.3.0 release gradient exactly` renders seed `aspect` + `jewel-peacock` and compares the WebP **byte for byte** against `test/fixtures/jewel-peacock-aspect.webp`, which is artwork already shipped in another product. Do not regenerate that fixture to make a test pass — a red fixture means either a real regression or a deliberate visual change the maintainer must sign off on, followed by `npm run examples` to refresh every gallery image. Encoder upgrades (sharp/libwebp) can also shift bytes with no visual change; compare pixels before concluding.

## What each algorithm does

| Algorithm | Where | Notes |
| --- | --- | --- |
| Domain-warped fractal noise | `renderCanvas`, `src/render.ts` | Two warp fields displace the sample point of a third color field; `fractalOctaveCount` octaves at halving amplitude; `smoothStep` + `colorTransitionContrast` sharpen transitions; the result indexes the palette ramp, interpolated in sRGB. |
| Film grain | end of `renderCanvas` | Per-pixel independent noise composited with canvas `overlay` at `grainOpacity`. Already 1 pixel per speck — "finer" needs supersampling, not a smaller cell. Reimplementing the blend in JS will drift from skia's rounding and break the fixture. |
| Palette pick | `pickPalette`, `src/palettes.ts` | Rendezvous (highest-random-weight) hashing: score each palette from `seed + '::palette::' + name`, highest wins. Order-independent; adding a palette moves ~1/N seeds, removing moves only its own, renaming moves both. Keep the key string and the hash→PRNG step identical or every pick changes. |
| Accent | `paletteAccent` | The ramp's mid stop, `floor(length / 2)`. Pure position, no color math. |
| Complement | `src/color.ts` | A vivid opposite-hue color for chips and geometry. See below. |

## The complement

Purpose: a chip or shape that **stands out on the palette's images**. Not a same-weight harmony color: an earlier version kept the accent's lightness and chroma, and muted palettes got muted, invisible complements.

**Steps** (all in OKLab/OKLCH, the perceptual space where hue and lightness track what people see):

1. **Hue source.** `paletteComplement(palette)` → `paletteComplementColor(accent, ramp)`: use the accent's hue if its chroma ≥ `HUE_TRUST_CHROMA` (0.03). Otherwise average the whole ramp's OKLab `a`/`b` (which weights each stop's hue by its chroma) and use that — a gray-ish palette's faint tint is still its identity. `complementColor(hex)` has no ramp, so it only has the per-color check.
2. **Hueless fallback.** If there's no hue left (accent chroma < 0.01 for `complementColor`; ramp mean < 0.005 for palettes), return a gray at the opposite lightness: `L > 0.5 ? 0.25 : 0.85`. Only `onyx-snow` hits this among built-ins.
3. **Rotate 180°.** `hue = atan2(b, a) + π`.
4. **Pick lightness per hue.** For each L from 0.50 to 0.80 in 0.01 steps, bisect (24 steps) the largest chroma sRGB can show; keep the L with the most. So the complement's lightness follows the hue: golds and cyans land at the top of the band (L 0.80, e.g. `#eab500`), blues at the bottom (0.50, e.g. `#3353d3`), pinks and oranges in between — sRGB simply has no vivid dark yellow or light blue.
5. **Cap chroma** at `VIVID_MAX_CHROMA` (0.2) so blue and magenta stay vivid, not neon, then round to hex. The cap only binds hues whose sRGB maximum exceeds it (blues, pinks, magentas); golds (~0.16) and cyans (~0.14) sit below it. To tone *every* complement down, scale the found chroma instead of lowering the cap — and keep the result above the test's 0.1 floor.

Worked example: `battleship-steel`'s accent `#7d8683` has chroma ≈ 0.012, below 0.03, so the hue comes from the ramp's faint green-cyan tint; its opposite is pink-magenta, which peaks at a mid lightness → `#e74c92`. Blue-grays (`gunmetal-fog`, `slate-harbor`) land on amber/orange the same way.

**Changing any constant is a breaking change for consumers**, who store complements next to saved images. It does *not* touch pixels, so the image fixture stays green. What does move: the pinned values in `complements pin known values` and `result.complement` in the fixture test, the `vivid, readable and opposite` test (chroma > 0.1, L in band), the gallery (`npm run examples`) and README examples (`npm run docs`). Cost is ~750 color conversions per call, microseconds; no need to cache.

## Before you change any of it

1. Render a reference image for a fixed seed + palette, then diff after.
2. Run `npm test` — the fixture is the regression guard, not a formality.
3. If the change is intended to alter output: say so explicitly, regenerate the fixture and `npm run examples`, and treat it as a breaking visual change for anything storing seeds.

## Common mistakes

- **"Nothing checks the pixels, so this is safe."** False. The byte-for-byte fixture test exists; assuming otherwise is how a silent visual regression ships.
- **Adding a knob without a CLI flag.** `GradientLook` drives `src/flags.ts`, which is typed one-entry-per-option; a new knob needs a description in `lookDescriptions`, a flag, then `npm run docs`.
- **Changing `pickPalette` for aesthetic reasons.** It's a distribution algorithm, not a look knob — see [[adding-mesh-gradient-palettes]] for what shifts when the palette list changes.
