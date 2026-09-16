import {
  findPalette,
  pickPalette,
  validatePalette,
  validatePalettes,
  type Palette,
} from './palettes';
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  generateImage,
  renderCanvas,
  type MeshGradientCanvas,
  type MeshGradientFormatOptions,
  type MeshGradientImage,
  type MeshGradientOptions,
} from './render';

export type CreateMeshGradientsOptions<P extends readonly Palette[]> = {
  palettes: P;
  /** Default output width in pixels for this generator. Per-call `width` wins. Defaults to 1200. */
  width?: number;
  /** Default output height in pixels for this generator. Per-call `height` wins. Defaults to 1500. */
  height?: number;
};

export type MeshGradients<Name extends string> = {
  palettes: readonly Palette[];
  /** Look up a palette in this set by name. Accepts any string and throws on a miss. */
  findPalette: (name: Name | (string & {})) => Palette;
  /** Deterministically pick a palette in this set from a seed. */
  pickPalette: (seed: string) => Palette;
  /** Render to an `@napi-rs/canvas` canvas, e.g. to draw on top before encoding. */
  render: (options: MeshGradientOptions<Name>) => Promise<MeshGradientCanvas>;
  /** Render and encode to WebP (default) or PNG. */
  generate: (
    options: MeshGradientOptions<Name> & MeshGradientFormatOptions,
  ) => Promise<MeshGradientImage>;
};

/**
 * Create a generator bound to a palette set and default output size. Palettes
 * and size are validated here, so a bad config fails when the module loads
 * instead of on first render.
 *
 * @example
 * export const gradients = createMeshGradients({
 *   palettes: [...colorPalettes, { name: 'brand', colors: ['#f4f4f5', '#8fa579', '#1f2c44'] }],
 *   width: 1920,
 *   height: 1080,
 * });
 */
export function createMeshGradients<const P extends readonly Palette[]>(
  options: CreateMeshGradientsOptions<P>,
): MeshGradients<P[number]['name']> {
  const { palettes, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = options;
  validatePalettes(palettes);
  validateDimension('width', width);
  validateDimension('height', height);

  const resolve = (seed: string, palette: Palette | string | undefined): Palette => {
    if (palette === undefined) return pickPalette(seed, palettes);
    if (typeof palette === 'string') return findPalette(palette, palettes);
    validatePalette(palette);
    return palette;
  };

  const resolveSize = (size: { width?: number; height?: number }) => {
    const resolved = { width: size.width ?? width, height: size.height ?? height };
    validateDimension('width', resolved.width);
    validateDimension('height', resolved.height);
    return resolved;
  };

  return {
    palettes,
    findPalette: (name) => findPalette(name, palettes),
    pickPalette: (seed) => pickPalette(seed, palettes),
    // async so an invalid palette rejects like every other render error.
    render: async (renderOptions) =>
      renderCanvas({
        ...renderOptions,
        ...resolveSize(renderOptions),
        palette: resolve(renderOptions.seed, renderOptions.palette),
      }),
    generate: async (generateOptions) =>
      generateImage({
        ...generateOptions,
        ...resolveSize(generateOptions),
        palette: resolve(generateOptions.seed, generateOptions.palette),
      }),
  };
}

function validateDimension(label: 'width' | 'height', value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer. Got ${value}.`);
  }
}
