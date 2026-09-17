/**
 * The hand-picked seed + palette pairs shown in the root README.
 *
 * Edit examples/featured.json, then:
 *   npm run examples   renders examples/featured/<palette>-<seed>.webp
 *   npm run docs       rebuilds the README table from the same file
 *
 * Side-effect free on purpose: both scripts import it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const examplesDir = join(repoRoot, 'examples');
export const featuredDir = join(examplesDir, 'featured');

/** @returns {{ seed: string, palette: string, caption?: string }[]} */
export const readFeatured = () =>
  JSON.parse(readFileSync(join(examplesDir, 'featured.json'), 'utf8'));

/** Image path relative to the repo root — what the README links to. */
export const featuredImage = (entry) => `examples/featured/${entry.palette}-${entry.seed}.webp`;
