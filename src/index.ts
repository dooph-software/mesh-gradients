import { createMeshGradients } from './create';
import { colorPalettes } from './palettes';

export {
  createMeshGradients,
  type CreateMeshGradientsOptions,
  type MeshGradients,
} from './create';
export {
  colorPalettes,
  findPalette,
  MAX_PALETTE_COLORS,
  MIN_PALETTE_COLORS,
  paletteAccent,
  pickPalette,
  validatePalette,
  validatePalettes,
  type HexColor,
  type Palette,
  type PaletteColors,
  type PaletteName,
} from './palettes';
export {
  DEFAULT_HEIGHT,
  DEFAULT_WEBP_QUALITY,
  DEFAULT_WIDTH,
  defaultLook,
  lookDescriptions,
  type GradientLook,
  type MeshGradientCanvas,
  type MeshGradientFormatOptions,
  type MeshGradientImage,
  type MeshGradientOptions,
} from './render';
export { createSeededRandom, hashStringToInt } from './random';

/** Generator bound to the built-in palettes. */
const builtIn = createMeshGradients({ palettes: colorPalettes });

/** Render and encode a gradient using the built-in palettes. */
export const generateMeshGradient = builtIn.generate;
/** Render a gradient to a canvas using the built-in palettes. */
export const renderMeshGradient = builtIn.render;
