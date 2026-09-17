/*
 * render — the noise pipeline that turns a seed and a palette into pixels.
 *
 * ## behavior
 * - `renderCanvas` seeds one stream from the seed, builds three simplex noise
 *   fields from it, domain-warps the third by the first two, and maps the result
 *   along the palette ramp; the film grain then draws from the same stream.
 * - `generateImage` wraps that and encodes: PNG straight off the canvas, WebP
 *   through sharp at `DEFAULT_WEBP_QUALITY`.
 * - `lookDescriptions` is the one copy of the per-knob prose; `src/flags.ts`
 *   builds CLI help from it and `scripts/sync-docs.mjs` builds the README table.
 *
 * ## constraints
 * - The order values are drawn from `random` is fixed: three `createNoise2D`
 *   calls, then one grain value per pixel. Inserting a draw, removing one, or
 *   reordering them shifts every pixel of every image — the grain loop is not
 *   incidental noise that can be swapped for `Math.random`; it consumes the
 *   tail of the same stream. `test/mesh-gradients.test.mjs` compares seed `aspect` /
 *   `jewel-peacock` byte-for-byte against artwork already shipped in Aspect.
 * - `defaultLook` and the bare constants in the pixel loop — the `5.2` / `1.3`
 *   warp offsets, `amplitude` starting at 0.5 and halving, `frequency`
 *   doubling, the `smoothStep` around the contrast term — are the prototype's
 *   values, not tuning suggestions. Any of them changes every image rendered
 *   without an explicit `look`, which is almost all of them.
 * - Noise is sampled in normalized coordinates (`pixelX / width`), with the
 *   aspect ratio applied to X only. This is what makes a 700×800 render the same
 *   composition as the 1200×1500 default, which `scripts/generate-examples.mjs`
 *   relies on to ship small previews of the real output. Sampling in absolute
 *   pixels would make every size a different picture.
 * - `DEFAULT_WEBP_QUALITY` and the plain `sharp(...).webp({ quality })` call are
 *   part of the shipped bytes. Adding encoder options (effort, lossless,
 *   chroma subsampling) changes the fixture comparison even though nothing about
 *   the rendered pixels moved.
 */
import { createCanvas, ImageData, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import sharp from 'sharp';
import { createNoise2D } from 'simplex-noise';
import { paletteAccent, type Palette, type PaletteName } from './palettes';
import { createSeededRandom, hashStringToInt } from './random';

/**
 * Knobs that define the gradient's look. The defaults are the exact values from
 * the original prototype; changing them changes every image for a given seed.
 */
export type GradientLook = {
  /** Zoom of the noise field. Lower = broader, softer color regions. */
  baseNoiseFrequency: number;
  /** How far the warp noise displaces the color field. */
  domainWarpStrength: number;
  /** Fractal noise octaves. More = finer detail. */
  fractalOctaveCount: number;
  /** Sharpness of transitions between palette stops. */
  colorTransitionContrast: number;
  /** Opacity of the film-grain overlay, 0–1. */
  grainOpacity: number;
};

/** One-line description per knob. Shared by the CLI help and the generated README table. */
export const lookDescriptions: Readonly<Record<keyof GradientLook, string>> = {
  baseNoiseFrequency: 'Lower values give broader, softer color regions.',
  domainWarpStrength: 'How much the color field swirls.',
  fractalOctaveCount: 'More octaves add finer detail.',
  colorTransitionContrast: 'Sharpness of the edges between colors.',
  grainOpacity: 'Strength of the film-grain overlay.',
};

export const defaultLook: Readonly<GradientLook> = {
  baseNoiseFrequency: 0.3,
  domainWarpStrength: 1.0,
  fractalOctaveCount: 2,
  colorTransitionContrast: 1.75,
  grainOpacity: 0.09,
};

export type MeshGradientOptions<Name extends string = PaletteName> = {
  /** Any string. The same seed + palette + size + look always renders the same image. */
  seed: string;
  /** Palette object, palette name, or omitted to pick deterministically from the seed. */
  palette?: Palette | Name;
  /** Pixels. Defaults to 1200. */
  width?: number;
  /** Pixels. Defaults to 1500. */
  height?: number;
  look?: Partial<GradientLook>;
};

export type MeshGradientFormatOptions = {
  /** Defaults to 'webp'. */
  format?: 'webp' | 'png';
  /** WebP quality, 1–100. Defaults to 82. */
  quality?: number;
};

/** Options after the palette has been resolved to an object. */
export type ResolvedMeshGradientOptions = Omit<MeshGradientOptions, 'palette'> & {
  palette: Palette;
};

export type MeshGradientCanvas = {
  canvas: Canvas;
  palette: Palette;
  /** Mid-tone hex from the palette, handy as a UI accent next to the image. */
  accent: string;
};

export type MeshGradientImage = {
  buffer: Buffer;
  format: 'webp' | 'png';
  width: number;
  height: number;
  seed: string;
  palette: Palette;
  accent: string;
};

export const DEFAULT_WIDTH = 1200;
export const DEFAULT_HEIGHT = 1500;
export const DEFAULT_WEBP_QUALITY = 82;

function hexToRgb(hex: string): [number, number, number] {
  const packed = parseInt(hex.slice(1), 16);
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
}

function sampleColorRamp(
  rgbStops: [number, number, number][],
  position: number,
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, position));
  const scaled = clamped * (rgbStops.length - 1);
  const lowerIndex = Math.min(rgbStops.length - 2, Math.floor(scaled));
  const blend = scaled - lowerIndex;
  const [lowR, lowG, lowB] = rgbStops[lowerIndex];
  const [highR, highG, highB] = rgbStops[lowerIndex + 1];
  return [
    lowR + (highR - lowR) * blend,
    lowG + (highG - lowG) * blend,
    lowB + (highB - lowB) * blend,
  ];
}

const smoothStep = (edge: number) => edge * edge * (3 - 2 * edge);

/**
 * Render a domain-warped noise gradient onto a canvas. The pixel pipeline and
 * the order random values are drawn in are verbatim from the prototype — both
 * must stay fixed for seeds to keep producing the same image.
 */
export async function renderCanvas(
  options: ResolvedMeshGradientOptions,
): Promise<MeshGradientCanvas> {
  const { seed, palette, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = options;
  const look = { ...defaultLook, ...options.look };

  const random = createSeededRandom(hashStringToInt(seed));
  const rgbStops = palette.colors.map(hexToRgb);

  const horizontalWarpNoise = createNoise2D(random);
  const verticalWarpNoise = createNoise2D(random);
  const colorFieldNoise = createNoise2D(random);

  const sampleFractalNoise = (
    noise: (x: number, y: number) => number,
    sampleX: number,
    sampleY: number,
  ) => {
    let total = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let octave = 0; octave < look.fractalOctaveCount; octave++) {
      total += amplitude * noise(sampleX * frequency, sampleY * frequency);
      amplitude *= 0.5;
      frequency *= 2;
    }
    return total;
  };

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const pixels = image.data;
  const aspectRatio = width / height;

  for (let pixelY = 0; pixelY < height; pixelY++) {
    for (let pixelX = 0; pixelX < width; pixelX++) {
      const sampleX = (pixelX / width) * look.baseNoiseFrequency * aspectRatio;
      const sampleY = (pixelY / height) * look.baseNoiseFrequency;

      const horizontalWarpOffset = sampleFractalNoise(horizontalWarpNoise, sampleX, sampleY);
      const verticalWarpOffset = sampleFractalNoise(verticalWarpNoise, sampleX + 5.2, sampleY + 1.3);

      const rawFieldValue = sampleFractalNoise(
        colorFieldNoise,
        sampleX + look.domainWarpStrength * horizontalWarpOffset,
        sampleY + look.domainWarpStrength * verticalWarpOffset,
      );
      const normalizedValue = (rawFieldValue + 1) / 2;

      const contrastedValue = smoothStep(
        Math.max(0, Math.min(1, (normalizedValue - 0.5) * look.colorTransitionContrast + 0.5)),
      );

      const [red, green, blue] = sampleColorRamp(rgbStops, contrastedValue);
      const pixelIndex = (pixelY * width + pixelX) * 4;
      pixels[pixelIndex] = red;
      pixels[pixelIndex + 1] = green;
      pixels[pixelIndex + 2] = blue;
      pixels[pixelIndex + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  // Film-grain overlay. Draws from the same random stream as the noise above.
  const grainPixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const brightness = Math.floor(random() * 256);
    grainPixels[i * 4] = brightness;
    grainPixels[i * 4 + 1] = brightness;
    grainPixels[i * 4 + 2] = brightness;
    grainPixels[i * 4 + 3] = 255;
  }
  const grainCanvas = createCanvas(width, height);
  grainCanvas.getContext('2d').putImageData(new ImageData(grainPixels, width, height), 0, 0);
  applyOverlay(context, grainCanvas, look.grainOpacity);

  return { canvas, palette, accent: paletteAccent(palette) };
}

function applyOverlay(context: SKRSContext2D, overlay: Canvas, opacity: number) {
  context.save();
  context.globalAlpha = opacity;
  context.globalCompositeOperation = 'overlay';
  context.drawImage(overlay, 0, 0);
  context.restore();
}

/**
 * Render a gradient and encode it. WebP (the default) is encoded with sharp;
 * PNG comes straight from the canvas.
 */
export async function generateImage(
  options: ResolvedMeshGradientOptions & MeshGradientFormatOptions,
): Promise<MeshGradientImage> {
  const { format = 'webp', quality = DEFAULT_WEBP_QUALITY } = options;
  const { canvas, palette, accent } = await renderCanvas(options);
  const pngBuffer = canvas.encodeSync('png');

  let buffer: Buffer = pngBuffer;
  if (format === 'webp') {
    buffer = await sharp(pngBuffer).webp({ quality }).toBuffer();
  }

  return {
    buffer,
    format,
    width: canvas.width,
    height: canvas.height,
    seed: options.seed,
    palette,
    accent,
  };
}
