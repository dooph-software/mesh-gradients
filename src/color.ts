/*
 * color — perceptual color math for colors derived from a palette.
 *
 * ## behavior
 * - The complement is the design-sense complement: the hue opposite the source
 *   (OKLCH hue + 180°), at the most saturated color sRGB can show for that hue
 *   within a readable lightness band (VIVID_L_MIN–VIVID_L_MAX), chroma capped at
 *   VIVID_MAX_CHROMA. It is built to stand out on the gradient as a chip or
 *   shape, so it deliberately does NOT keep the source's lightness or chroma —
 *   keeping them made muted palettes produce muted, invisible complements.
 * - `paletteComplementColor` takes the hue from the accent, unless the accent is
 *   too gray to have a reliable hue (chroma < HUE_TRUST_CHROMA); then it uses the
 *   chroma-weighted hue of the whole ramp, whose faint tint is still real.
 * - A source with no usable hue at all (pure grays) has no opposite hue; it gets
 *   a gray at the opposite lightness instead.
 *
 * ## constraints
 * - Output is part of what consumers store. Complements are rendered as UI
 *   chips and geometry next to images generated earlier; changing the color
 *   space, the lightness band, the chroma cap, the search steps or the rounding
 *   shifts every complement. Treat it like the render pipeline: a deliberate,
 *   announced change, not a refactor.
 * - Zero dependencies. This module is reachable from the `/palettes` entry,
 *   which promises to be safe for browser and edge bundles.
 */

type Rgb = [number, number, number];

/** Below this OKLCH chroma a color has no meaningful hue. */
const ACHROMATIC_CHROMA = 0.01;
/** Below this, an accent's hue is too faint to trust; use the whole ramp's instead. */
const HUE_TRUST_CHROMA = 0.03;
/** Lightness band searched for the most saturated opposite color (OKLab L, in hundredths). */
const VIVID_L_MIN = 50;
const VIVID_L_MAX = 80;
/** Cap so the most saturated hues (e.g. blue, magenta) stay vivid rather than neon. */
const VIVID_MAX_CHROMA = 0.2;
/** Upper bound of the chroma search; no sRGB color exceeds it. */
const CHROMA_SEARCH_MAX = 0.4;
/** Bisection steps; 2^-24 of the search range is far below 1/255 per channel. */
const GAMUT_STEPS = 24;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
}

function rgbToHex(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

function hexToOklab(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Returns sRGB in gamma space, possibly outside [0, 1] when out of gamut. */
function oklabToSrgb([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma) as Rgb;
}

const inGamut = (rgb: Rgb) => rgb.every((c) => c >= 0 && c <= 1);
const atLch = (L: number, C: number, hue: number) =>
  oklabToSrgb([L, C * Math.cos(hue), C * Math.sin(hue)]);

/** Largest chroma sRGB can show at this lightness and hue. */
function maxChroma(L: number, hue: number): number {
  let low = 0;
  let high = CHROMA_SEARCH_MAX;
  for (let step = 0; step < GAMUT_STEPS; step++) {
    const mid = (low + high) / 2;
    if (inGamut(atLch(L, mid, hue))) low = mid;
    else high = mid;
  }
  return low;
}

/** The most saturated in-band color at the hue opposite (a, b). */
function vividOpposite(a: number, b: number): string {
  const hue = Math.atan2(b, a) + Math.PI;
  let bestL = VIVID_L_MIN / 100;
  let bestC = -1;
  for (let l = VIVID_L_MIN; l <= VIVID_L_MAX; l++) {
    const chroma = maxChroma(l / 100, hue);
    if (chroma > bestC) {
      bestC = chroma;
      bestL = l / 100;
    }
  }
  return rgbToHex(atLch(bestL, Math.min(bestC, VIVID_MAX_CHROMA), hue));
}

/** A hueless color's only opposite: the same gray on the other side of mid lightness. */
function oppositeGray(L: number): string {
  return rgbToHex(atLch(L > 0.5 ? 0.25 : 0.85, 0, 0));
}

/**
 * The complement of a `#rrggbb` color, built to stand out: the opposite OKLCH
 * hue at its most saturated readable lightness. Grays get the opposite-lightness gray.
 */
export function complementColor(hex: string): string {
  const [L, a, b] = hexToOklab(hex);
  return Math.hypot(a, b) < ACHROMATIC_CHROMA ? oppositeGray(L) : vividOpposite(a, b);
}

/**
 * Complement for a palette: opposite the accent's hue, or — when the accent is
 * near-gray — opposite the chroma-weighted hue of the whole ramp.
 */
export function paletteComplementColor(accent: string, ramp: readonly string[]): string {
  const [L, a, b] = hexToOklab(accent);
  if (Math.hypot(a, b) >= HUE_TRUST_CHROMA) return vividOpposite(a, b);

  // Summing OKLab a/b weights each stop's hue by its chroma.
  let sumA = 0;
  let sumB = 0;
  for (const color of ramp) {
    const [, ca, cb] = hexToOklab(color);
    sumA += ca;
    sumB += cb;
  }
  const meanA = sumA / ramp.length;
  const meanB = sumB / ramp.length;
  return Math.hypot(meanA, meanB) < ACHROMATIC_CHROMA / 2 ? oppositeGray(L) : vividOpposite(meanA, meanB);
}
