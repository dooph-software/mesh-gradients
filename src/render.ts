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
