/*
 * random — the deterministic RNG behind every seeded image and every palette pick.
 *
 * ## behavior
 * - `hashStringToInt` is FNV-1a/32; `createSeededRandom` is Mulberry32 returning
 *   floats in [0, 1). Both are re-exported from the package root, so their
 *   signatures are public API.
 * - Two consumers: `render.ts` seeds one stream per image and draws from it for
 *   the whole pipeline, and `pickPalette` in `palettes.ts` scores each palette
 *   with a fresh one-shot stream.
 *
 * ## constraints
 * - Both algorithms are frozen. These are the exact functions Aspect's released
 *   0.3.0 artwork was rendered with, and `test/mesh-gradients.test.mjs` compares
 *   a render byte-for-byte against that shipped image. Swapping in a "better"
 *   hash or a stronger PRNG — or reordering the mixing steps — changes every
 *   image every seed has ever produced and reshuffles which palette each seed
 *   picks. There is no migration for artwork already published.
 * - `hashStringToInt` hashes the raw string, code unit by code unit. Do not
 *   normalize the input here (trim, lowercase, NFC): seeds are arbitrary user
 *   strings, and folding two of them together remaps the images they render.
 *   A caller that wants normalized seeds normalizes before calling.
 */

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashStringToInt(seed: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG. Returns floats in [0, 1). */
export function createSeededRandom(seedInt: number): () => number {
  let state = seedInt;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
