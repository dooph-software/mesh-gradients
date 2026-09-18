---
name: using-mesh-gradients
description: Use when generating, storing, serving, or displaying gradient images or palette colors in a project that depends on @dooph-software/mesh-gradients — cover art, hero backgrounds, avatars, placeholders, OG images, or accent chips that should match a gradient.
---

# Using @dooph-software/mesh-gradients

An image is a pure function of **seed + palette + aspect ratio + look**. Store those, not just the seed, and the image is reproducible forever.

## What to persist per image

| Store | Why |
| --- | --- |
| `seed` | Drives the composition. |
| `palette.name` (from the result) | Omitting `palette` picks one from the seed, but that pick shifts for ~1/N seeds whenever a package upgrade adds palettes. Store the resolved name and pass it back. |
| `width` × `height` | The field is scaled to the image's height and anchored at its left edge. Same aspect ratio → same composition at any resolution. Wider or narrower → the right side extends or trims, so a square render is exactly the left square of a wide one (only the grain differs — it's seeded but drawn per pixel, so it depends on size). Taller or shorter relative to width → rescaled, a different-looking image. |
| `accent`, `complement` (optional) | Mid-tone hex, and a vivid opposite-hue color built to stand out on the image, for chips and geometry. Both are derivable later from the palette name. |

If "must never change" is a hard requirement, also store the rendered bytes. The renderer is frozen by design, but an encoder (sharp/libwebp) upgrade can still shift WebP bytes; stored bytes can't drift at all.

## Core usage

```ts
// server-only module — rendering needs Node (native canvas + sharp)
import { generateMeshGradient } from '@dooph-software/mesh-gradients';

const { buffer, palette, accent } = await generateMeshGradient({ seed: post.slug, width: 1200, height: 630 });
// persist: seed, palette.name, 1200×630, accent — and buffer, if immutability is required
```

```ts
// client / edge-safe — zero dependencies, no rendering
import { findPalette, paletteAccent, paletteComplement } from '@dooph-software/mesh-gradients/palettes';
const palette = findPalette(post.gradientPalette);
const chip = paletteAccent(palette);
const contrastChip = paletteComplement(palette); // opposite hue, vivid — stands out on the image
```

## Quick reference

- **Custom palettes or a project-wide default size:** `createMeshGradients({ palettes, width, height })` in one module, exported and reused.
- **Browse palettes:** `npx mesh-gradient --list-palettes`; one-off images: `npx mesh-gradient --seed x --palette y`.
- **Draw on top before encoding:** `renderMeshGradient` returns the canvas.

## Common mistakes

- **Importing the main entry in client or edge code.** It pulls in native binaries; use `/palettes` for colors.
- **Re-deriving the palette from the seed on every read.** Works until an upgrade adds palettes; then some existing images change color.
- **Assuming a new crop needs new art.** For a narrower variant (e.g. a square from a 1200×630 cover), render the same seed + palette at the new size: it matches the cover's left edge. Only a relatively taller variant changes the composition.
- **Assuming text is readable on the image.** Ramps run light to dark, so no single text color is safe everywhere — put text on a scrim or a solid surface.
