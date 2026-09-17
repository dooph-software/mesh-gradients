---
name: mesh-gradient-algorithms
description: Use when editing, reviewing, optimizing, or debugging how images get produced in this package — src/random.ts, src/render.ts, the look constants, the grain overlay, pickPalette or paletteAccent — or when a change might alter rendered pixels for an existing seed.
---

# Mesh-gradient algorithms

Every published image is a pure function of `(seed, palette, width, height, look)`. Four algorithms produce it, and the render path is guarded by a golden fixture.

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

## Before you change any of it

1. Render a reference image for a fixed seed + palette, then diff after.
2. Run `npm test` — the fixture is the regression guard, not a formality.
3. If the change is intended to alter output: say so explicitly, regenerate the fixture and `npm run examples`, and treat it as a breaking visual change for anything storing seeds.

## Common mistakes

- **"Nothing checks the pixels, so this is safe."** False. The byte-for-byte fixture test exists; assuming otherwise is how a silent visual regression ships.
- **Adding a knob without a CLI flag.** `GradientLook` drives `src/flags.ts`, which is typed one-entry-per-option; a new knob needs a description in `lookDescriptions`, a flag, then `npm run docs`.
- **Changing `pickPalette` for aesthetic reasons.** It's a distribution algorithm, not a look knob — see [[adding-mesh-gradient-palettes]] for what shifts when the palette list changes.
