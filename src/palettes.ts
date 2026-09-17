import { createSeededRandom, hashStringToInt } from './random';

// Curated palettes for gradient generation, tuned for visual quality.
// Design intent: analogous families anchored by neutrals, muted/earthy options included.
// Each ramp runs light → dark; the renderer maps noise values along it.

export const MIN_PALETTE_COLORS = 3;
export const MAX_PALETTE_COLORS = 5;

/** `#rrggbb`. The type only checks the `#`; the 6 hex digits are checked at runtime. */
export type HexColor = `#${string}`;

/** A color ramp of 3–5 stops, light → dark. */
export type PaletteColors =
  | readonly [HexColor, HexColor, HexColor]
  | readonly [HexColor, HexColor, HexColor, HexColor]
  | readonly [HexColor, HexColor, HexColor, HexColor, HexColor];

export type Palette = {
  /** Unique within a palette set. Seed-based picks are keyed on it, so renaming reshuffles. */
  name: string;
  colors: PaletteColors;
};

export const colorPalettes = [
  // ── Warm: amber / cream / clay / terracotta (analogous) ──
  { name: 'amber-latte', colors: ['#faf4ea', '#f2d29b', '#e0a45c', '#b9722f'] },
  { name: 'terracotta-sand', colors: ['#f6ede1', '#e8c9a0', '#cf8f63', '#9c4e33'] },
  { name: 'peach-blush', colors: ['#fdf1ec', '#f8cbb6', '#ef9a8a', '#d76e73'] },
  { name: 'coral-cream', colors: ['#fbe9df', '#f5b79a', '#e8735a', '#c33f36'] },
  { name: 'honey-espresso', colors: ['#f7ecd9', '#e5b877', '#b9793f', '#5f3418'] },
  { name: 'apricot-plum', colors: ['#fdf0e6', '#f6c79a', '#e58b6f', '#7d4a6b'] },
  { name: 'golden-hour', colors: ['#fdf3e1', '#f7cf8a', '#e89a5a', '#9a4a3a'] },

  // ── Pink / violet / mauve ──
  { name: 'lavender-rose', colors: ['#f4eefb', '#d9c2ef', '#c98fb8', '#8a5fd0'] },
  { name: 'violet-mist', colors: ['#f1eefb', '#c9b8ef', '#8f7fe0', '#4a3d9c'] },
  { name: 'mauve-plum', colors: ['#f6f0f2', '#d8b8c6', '#a5738c', '#5f3a55'] },
  { name: 'periwinkle-blush', colors: ['#f0f0fb', '#c3c6f0', '#cf9fc6', '#6a5fd0'] },
  { name: 'orchid-frost', colors: ['#f6eff6', '#e0c2e0', '#b98fc4', '#7a5aa6', '#3f2f5c'] },
  { name: 'quartz-rose', colors: ['#faf1f1', '#ecc9cc', '#c99aa3', '#8a5f6a'] },
  { name: 'wisteria-sky', colors: ['#f2f0fb', '#cfc6ef', '#9fb2e6', '#4f6aa6'] },
  { name: 'zephyr-dawn', colors: ['#fdf3f5', '#f2d6e2', '#c6d6f2', '#7f9fd8'] },

  // ── Cool: blue / slate / sky (analogous) ──
  { name: 'sky-slate', colors: ['#eef4fb', '#bcd2ef', '#6f8fc4', '#2f3f66'] },
  { name: 'teal-fog', colors: ['#eef7f6', '#b6dcd8', '#5fa39c', '#234a49'] },
  { name: 'arctic-ink', colors: ['#f2f6f8', '#cddbe2', '#7f96a3', '#1c2630'] },
  { name: 'cloud-navy', colors: ['#f0f3f7', '#c6d1de', '#7488a3', '#1f2c44'] },
  { name: 'denim-clay', colors: ['#eef2f6', '#aebfd0', '#5f7794', '#b06a4e'] },

  // ── Green: sage / moss / mint / olive (analogous) ──
  { name: 'sage-mist', colors: ['#f2f5ee', '#cdd8bd', '#8fa579', '#4a5c3a'] },
  { name: 'mint-sea', colors: ['#eef8f4', '#b6e2d2', '#5fb39c', '#1f5c4d'] },
  { name: 'olive-cream', colors: ['#f6f3e6', '#dbd09b', '#a39a5c', '#5f5a2f'] },
  { name: 'eucalyptus-fog', colors: ['#eff4f1', '#cbdcd2', '#94b3a6', '#4f6b60'] },
  { name: 'kelp-forest', colors: ['#eef3ea', '#a9c49a', '#4f7a5a', '#1f3a2f'] },
  { name: 'yuzu-mint', colors: ['#fbfbe6', '#eef29a', '#b3d98a', '#3f8f7a'] },

  // ── Analogous + a single contrasting splash ──
  { name: 'periwinkle-gold', colors: ['#dfe6ff', '#a9b6f0', '#5b6bd6', '#e6c25a'] },
  { name: 'lilac-lemon', colors: ['#f3eefb', '#d3c2ef', '#9f8fd0', '#e6d25a'] },
  { name: 'blush-teal', colors: ['#fbeee9', '#f2c2b0', '#d78a8f', '#3f9c94'] },
  { name: 'sage-coral', colors: ['#f2f5ee', '#cdd8bd', '#8fa579', '#e0755a'] },
  { name: 'slate-amber', colors: ['#eef2f6', '#bcc9d8', '#5f7794', '#e0a24e'] },

  // ── Colorful / multi-hue (rich & saturated, jewel tones) ──
  { name: 'sunset-rose', colors: ['#fce9d6', '#f6a95c', '#e8617a', '#8a3d7a'] },
  { name: 'berry-bloom', colors: ['#fbe9f2', '#e88fb8', '#c94f8f', '#7a2f6a'] },
  { name: 'jewel-peacock', colors: ['#e6f5f0', '#4fb3a6', '#1f7a99', '#243f8a'] },
  { name: 'iris-meadow', colors: ['#eaf5ec', '#7cc48f', '#3f8fb3', '#5f4fb0'] },
  { name: 'autumn-spice', colors: ['#f7ecd6', '#dba24f', '#b5522f', '#6e2f4a'] },
  { name: 'ultraviolet-sea', colors: ['#e9f0fb', '#6f9fe0', '#4a5fc4', '#6a3da6'] },
  { name: 'purple-rain', colors: ['#f1ebf7', '#b69ad6', '#6f3fa8', '#2a1740'] },
  { name: 'nectarine-fizz', colors: ['#fff1e6', '#ffc59a', '#ff8a5c', '#d9485f'] },
  { name: 'raspberry-cream', colors: ['#fdeef1', '#f4a9bd', '#d9537a', '#8a1f45'] },

  // ── Muted / dusty / earthy ──
  { name: 'fog-plum', colors: ['#f2f0f3', '#cfc6d2', '#9a8a9c', '#5f4a5c'] },
  { name: 'sand-sky', colors: ['#f4efe4', '#e0d3b8', '#a9bcc4', '#5f7f8c'] },
  { name: 'xanadu-sage', colors: ['#f1f4f1', '#c8d3c8', '#738678', '#36443a'] },

  // ── Neutral / mono ──
  { name: 'ivory-ink', colors: ['#f7f4ef', '#d8d2c8', '#8a8378', '#20201d'] },
  { name: 'paper-graphite', colors: ['#f4f4f5', '#cfcfd4', '#83838f', '#1c1c22'] },
  { name: 'bone-coffee', colors: ['#f5efe6', '#d9c9b3', '#9c8468', '#3a2c1e'] },
  { name: 'porcelain-greige', colors: ['#f6f3ef', '#ddd4c9', '#b0a596', '#6a5f52'] },
] as const satisfies readonly Palette[];

/** Union of every built-in palette name, e.g. `"mint-sea"`. */
export type PaletteName = (typeof colorPalettes)[number]['name'];

/** Primary accent for UI chips: the palette ramp's mid-tone. */
export function paletteAccent(palette: Palette): string {
  const colors = palette.colors;
  return colors[Math.floor(colors.length / 2)];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Runtime check for palettes that didn't come through the type system
 * (JSON, CLI input, `as` casts). Throws with the offending palette's name.
 */
export function validatePalette(palette: Palette): void {
  const label = `Palette "${palette?.name}"`;
  if (typeof palette?.name !== 'string' || palette.name.length === 0) {
    throw new Error('Palette needs a non-empty name.');
  }
  const { colors } = palette;
  if (
    !Array.isArray(colors) ||
    colors.length < MIN_PALETTE_COLORS ||
    colors.length > MAX_PALETTE_COLORS
  ) {
    throw new Error(
      `${label} needs ${MIN_PALETTE_COLORS}–${MAX_PALETTE_COLORS} colors. Got ${Array.isArray(colors) ? colors.length : typeof colors}.`,
    );
  }
  for (const color of colors) {
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
      throw new Error(`${label} has an invalid color "${color}". Use #rrggbb.`);
    }
  }
}

/** Validates every palette and that names are unique. */
export function validatePalettes(palettes: readonly Palette[]): void {
  if (palettes.length === 0) throw new Error('At least one palette is required.');
  const seen = new Set<string>();
  for (const palette of palettes) {
    validatePalette(palette);
    if (seen.has(palette.name)) throw new Error(`Duplicate palette name "${palette.name}".`);
    seen.add(palette.name);
  }
}

/** Look up a palette by name. Throws if not found. */
export function findPalette(
  name: PaletteName | (string & {}),
  palettes: readonly Palette[] = colorPalettes,
): Palette {
  const palette = palettes.find((p) => p.name === name);
  if (!palette) {
    throw new Error(`Unknown palette "${name}". Valid: ${palettes.map((p) => p.name).join(', ')}`);
  }
  return palette;
}

/**
 * Deterministically pick a palette from a seed.
 *
 * Uses rendezvous (highest-random-weight) hashing: every palette gets a
 * pseudo-random score from `seed + name`, and the highest score wins. The list's
 * order doesn't matter, adding a palette only moves the seeds the new palette
 * wins (~1 in N), and removing one only moves the seeds that had picked it.
 */
export function pickPalette(seed: string, palettes: readonly Palette[] = colorPalettes): Palette {
  let best: Palette | undefined;
  let bestScore = -1;
  for (const palette of palettes) {
    // Run the hash through the PRNG once: FNV-1a alone mixes trailing
    // characters poorly, and names often share prefixes.
    const score = createSeededRandom(hashStringToInt(`${seed}::palette::${palette.name}`))();
    if (score > bestScore || (score === bestScore && palette.name < best!.name)) {
      best = palette;
      bestScore = score;
    }
  }
  if (!best) throw new Error('At least one palette is required.');
  return best;
}
