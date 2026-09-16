import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { parseArgs } from 'node:util';
import {
  colorPalettes,
  DEFAULT_HEIGHT,
  DEFAULT_WEBP_QUALITY,
  DEFAULT_WIDTH,
  findPalette,
  generateMeshGradient,
} from './index';

const HELP = `Usage: mesh-gradient --seed <string> --out <file.webp|file.png> [options]

Options:
  --seed <string>      Seed string. Same seed → same image. (required)
  --out <path>         Output file. Format comes from the extension (.webp or .png). (required)
  --palette <name>     Built-in palette name. Defaults to a deterministic pick from the seed.
  --width <px>         Default ${DEFAULT_WIDTH}
  --height <px>        Default ${DEFAULT_HEIGHT}
  --quality <1-100>    WebP quality. Default ${DEFAULT_WEBP_QUALITY}
  --json               Print result metadata as JSON (palette, accent, seed, size)
  --list-palettes      Print built-in palette names and exit
  -h, --help           Show this help
`;

async function main() {
  const { values } = parseArgs({
    options: {
      seed: { type: 'string' },
      out: { type: 'string' },
      palette: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      quality: { type: 'string' },
      json: { type: 'boolean' },
      'list-palettes': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values['list-palettes']) {
    for (const palette of colorPalettes) console.log(`${palette.name}  ${palette.colors.join(' ')}`);
    return;
  }
  if (!values.seed || !values.out) {
    console.error(HELP);
    process.exit(1);
  }

  const extension = extname(values.out).toLowerCase();
  if (extension !== '.webp' && extension !== '.png') {
    throw new Error(`--out must end in .webp or .png. Got: ${values.out}`);
  }

  const result = await generateMeshGradient({
    seed: values.seed,
    palette: values.palette === undefined ? undefined : findPalette(values.palette),
    width: parseInteger('width', values.width),
    height: parseInteger('height', values.height),
    quality: parseInteger('quality', values.quality),
    format: extension === '.png' ? 'png' : 'webp',
  });

  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, result.buffer);

  if (values.json) {
    const { buffer, palette, ...meta } = result;
    console.log(JSON.stringify({ ...meta, palette: palette.name, out: values.out, bytes: buffer.length }));
  } else {
    console.log(`✓ ${values.out} (${(result.buffer.length / 1024).toFixed(2)} KB)`);
    console.log(`  seed: ${result.seed}`);
    console.log(`  palette: ${result.palette.name} (accent: ${result.accent})`);
  }
}

function parseInteger(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${flag} must be a positive integer. Got: ${value}`);
  }
  return parsed;
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
