import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // `palettes` is its own entry so `@dooph-software/mesh-gradients/palettes`
    // stays dependency-free (no canvas/sharp) for browser and edge consumers.
    entry: ['src/index.ts', 'src/palettes.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
  },
]);
