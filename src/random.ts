// Deterministic RNG: string seed → repeatable pseudo-random stream.
// Copied verbatim from the Aspect gradient prototype — changing either function
// changes every image ever generated from a seed.

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
