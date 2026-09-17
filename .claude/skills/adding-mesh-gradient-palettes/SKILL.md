---
name: adding-mesh-gradient-palettes
description: Use when adding, removing, renaming, or retuning a built-in color palette in this package — editing colorPalettes in src/palettes.ts, adding a hex ramp, or being asked for a new palette by name, vibe, or reference image.
---

# Adding mesh-gradient palettes

Palettes are entries in `colorPalettes` in `src/palettes.ts`: a unique `name` and **3–5** `#rrggbb` colors ordered **light → dark** (the renderer maps the noise field along the ramp in that order — reversing it isn't an error, it just renders wrong). Add the entry to the hue-family group whose comment fits, then run `npm run examples && npm run docs && npm test`: the gallery, the README palette count, and the CI doc check all derive from the array, and `npm test` fails on stale docs.

**Look at the rendered image before calling it done** — `examples/<name>.webp`. Nothing automated judges color; the tests only check uniqueness, hex format and count.

## Quick reference

| Step | Command / file |
| --- | --- |
| Add the entry | `src/palettes.ts` → `colorPalettes`, inside a hue group |
| Render it | `npm run examples` (writes `examples/<name>.webp` + gallery) |
| Update README | `npm run docs` (palette count is generated) |
| Verify | `npm test` (uniqueness, hex, 3–5 stops, doc freshness) |
| Preview a pair | `npm run gradient -- --palette <name> --seed <seed>` |

## Common mistakes

- **Skipping `npm run examples` / `npm run docs`.** `npm test` runs `sync-docs.mjs --check` and fails; the fix is to run them and commit the result, not to hand-edit README regions between `<!-- docs:begin -->` markers.
- **Renaming or removing instead of adding.** `pickPalette` is keyed on the palette *name*, so a rename moves every seed that had picked it — for adds, only ~1/N seeds move, onto the new palette. Anything that stored a picked name (release frontmatter, `examples/featured.json`) keeps working; anything that re-picks from a bare seed changes. See [[mesh-gradient-algorithms]].
- **Treating `examples/featured.json` as generated.** It is hand-curated; `npm run examples` reads it and renders from it, never writes it. Add an entry there only when asked to feature a palette on the root README.
- **Judging a palette from one seed.** Seeds place the dark end differently; render two or three before deciding a ramp is muddy.
- **Duplicating a neighbor.** 70+ palettes exist. Check the gallery for a near-identical one in the same hue group first.
