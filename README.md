# @dooph-software/mesh-gradients

Deterministic, seeded mesh-gradient images plus a curated set of 47 color palettes. The same seed, palette, size and look always render the same image, down to the byte.

```bash
npm install @dooph-software/mesh-gradients
```

Rendering runs in Node and uses `@napi-rs/canvas` (compositing, PNG) and `sharp` (WebP), which install automatically as prebuilt native binaries.

## Palettes

See every palette in the [examples gallery](./examples/README.md). Regenerate it with `npm run examples`.

Import from `/palettes` when you only need colors, for example in a browser or edge bundle. That entry has no dependencies.

```ts
import { colorPalettes, findPalette, pickPalette, paletteAccent } from '@dooph-software/mesh-gradients/palettes';

findPalette('mint-sea');          // { name: 'mint-sea', colors: [...] }. Throws on unknown names
pickPalette('autocad-0.3.0');     // deterministic pick from any seed string
paletteAccent(findPalette('jewel-peacock')); // '#1f7a99'. The ramp's mid-tone, for UI accents
```

`PaletteName` is a union of the built-in names, so you get autocomplete in editors.

A palette has a unique `name` and **3–5** `#rrggbb` colors, ordered light to dark. The `Palette` type enforces the count and the `#`, so an inline palette with 2 or 6 colors fails typechecking. The factory (see "Custom palettes" below) and the render functions also call `validatePalette` at runtime, which catches palettes built from JSON, casts or CLI input.

`pickPalette` uses rendezvous hashing. Each palette gets a score from `seed + name`, and the highest score wins. As a result:

- List order doesn't affect the result.
- Adding a palette only moves the seeds it wins, about 1 in N.
- Removing a palette only moves the seeds that had picked it.
- Renaming a palette counts as removing it and adding a new one.

## Custom palettes

To use your own palettes, create a generator bound to your set. Put it in a module in your project and export it:

```ts
// lib/gradients.ts
import { colorPalettes, createMeshGradients } from '@dooph-software/mesh-gradients';

export const gradients = createMeshGradients({
  palettes: [...colorPalettes, { name: 'brand', colors: ['#f4f4f5', '#8fa579', '#1f2c44'] }],
  width: 1920,  // optional default output size for this generator (1200 × 1500 if omitted)
  height: 1080,
});

// elsewhere
await gradients.generate({ seed: 'hero', palette: 'brand' }); // 1920 × 1080, names typed from your set
await gradients.generate({ seed: 'og', width: 1200, height: 630 }); // per-call size wins
gradients.pickPalette('hero');                               // picks only from your set
```

`createMeshGradients` validates the whole set as soon as it's called: color counts, hex format, unique names and the default size. A bad palette fails when the module loads, not on the first render. The top-level `generateMeshGradient` and `renderMeshGradient` functions are this same generator with the built-in palettes.

For a one-off, you can also pass a palette object directly: `generateMeshGradient({ seed, palette: { name: 'x', colors: [...] } })`.

## Rendering images (Node)

```ts
import { writeFileSync } from 'node:fs';
import { generateMeshGradient } from '@dooph-software/mesh-gradients';

const { buffer, palette, accent } = await generateMeshGradient({
  seed: 'autocad-0.3.0',
  palette: 'jewel-peacock', // optional. Omit to pick from the seed
  width: 1200,              // default 1200
  height: 1500,             // default 1500
  format: 'webp',           // 'webp' (default, quality 82) | 'png'
});
writeFileSync('gradient.webp', buffer);
```

Use `renderMeshGradient(options)` to get the raw `@napi-rs/canvas` canvas if you want to draw on top of it before encoding.

`look` overrides the rendering knobs. The defaults are exported as `defaultLook`:

| Knob | Default | Effect |
| --- | --- | --- |
| `baseNoiseFrequency` | `0.3` | Lower values give broader, softer color regions |
| `domainWarpStrength` | `1.0` | How much the color field swirls |
| `fractalOctaveCount` | `2` | More octaves add finer detail |
| `colorTransitionContrast` | `1.75` | Sharpness of the edges between colors |
| `grainOpacity` | `0.09` | Strength of the film-grain overlay |

## CLI

```bash
npx mesh-gradient --seed autocad-0.3.0 --out assets/0.3.0.webp
npx mesh-gradient --seed hero --palette sunset-rose --width 1920 --height 1080 --out hero.png --json
npx mesh-gradient --list-palettes
```

## Development

```bash
npm install
npm test        # builds, then runs node:test
npm run lint    # tsc --noEmit
```

One test renders seed `aspect` with `jewel-peacock` and checks the result byte-for-byte against `test/fixtures/jewel-peacock-aspect.webp`, which is Aspect's shipped 0.3.0 artwork. If that test fails after you upgrade `sharp`, check whether the pixels differ or only the encoded bytes do.

Releases work like the design system: run `npm run prep-release:<patch|minor|major>`, then publish a GitHub release. That triggers `.github/workflows/release-package.yml`.
