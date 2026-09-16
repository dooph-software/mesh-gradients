// Compile-time checks, run by `npm run lint` (tsc). Each @ts-expect-error must
// produce a type error — if one stops erroring, tsc fails.
import { colorPalettes, createMeshGradients, generateMeshGradient, type Palette } from '../src/index';

export const ok = createMeshGradients({
  palettes: [...colorPalettes, { name: 'brand', colors: ['#ffffff', '#888888', '#000000'] }],
});
ok.generate({ seed: 's', palette: 'brand' });
ok.generate({ seed: 's', palette: 'mint-sea' });
// @ts-expect-error unknown palette name for this set
ok.generate({ seed: 's', palette: 'brnad' });

// @ts-expect-error unknown built-in palette name
generateMeshGradient({ seed: 's', palette: 'brand' });

export const tooFew: Palette = {
  name: 'x',
  // @ts-expect-error 2 colors is below the minimum of 3
  colors: ['#ffffff', '#000000'],
};

export const tooMany: Palette = {
  name: 'x',
  // @ts-expect-error 6 colors is above the maximum of 5
  colors: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'],
};

export const notHex: Palette = {
  name: 'x',
  // @ts-expect-error colors must start with #
  colors: ['ffffff', '#888888', '#000000'],
};

createMeshGradients({
  // @ts-expect-error inline palettes in a set are checked too
  palettes: [{ name: 'x', colors: ['#ffffff', '#000000'] }],
});
