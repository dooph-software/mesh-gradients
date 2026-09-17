/*
 * cli — the `mesh-gradient` command: parse flags, render one image, write it out.
 *
 * ## behavior
 * - Parser config, help text and the options object are all derived from the
 *   tables in `./flags`; this file contributes the wiring, not the flag list.
 * - With no `--seed`, a random one is generated and the palette is derived from
 *   it exactly as the API would. Both are printed so any result can be
 *   reproduced.
 * - Output format comes from the `--out` extension; anything but `.webp` or
 *   `.png` throws.
 *
 * ## constraints
 * - No flag is defined here. Adding one to `parseOptions` or to the help string
 *   gives it no `parse`, no validation and no README entry, and the typecheck
 *   that pairs flags with render options never sees it — add it to `optionFlags`,
 *   `lookFlags` or `cliOnlyFlags` in `./flags` and this file picks it up.
 * - `helpText` is documentation, not just terminal output:
 *   `scripts/sync-docs.mjs` splices it into README.md between the
 *   `docs:begin:cli-help` markers, and `npm test` runs that script with
 *   `--check`. Changing the help layout without running `npm run docs` and
 *   committing the README fails the test run.
 * - The `realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)` guard
 *   stays. Importing this module must do nothing: the tests import `runCli` and
 *   `scripts/sync-docs.mjs` imports `helpText`, so a bare top-level `runCli()`
 *   would have both of them render an image and `process.exit` mid-run.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { cliOnlyFlags, lookFlags, optionFlags, type FlagSpec } from './flags';
import { colorPalettes, findPalette, generateMeshGradient, pickPalette } from './index';
import type { GradientLook } from './render';

const allFlags = [...Object.values(optionFlags), ...Object.values(lookFlags)];

/** Help text, generated from the flag tables so it can't document a flag that doesn't exist. */
export const helpText = (() => {
  const width = Math.max(
    ...[...allFlags, ...cliOnlyFlags].map((f) => `--${f.flag} ${f.placeholder}`.trimEnd().length),
  );
  const line = (f: { flag: string; placeholder: string; describe: string }) =>
    `  ${`--${f.flag} ${f.placeholder}`.trimEnd().padEnd(width)}  ${f.describe}`;
  return `Usage: mesh-gradient [options]

Every flag is optional. With none, writes one WebP with a random seed and a
palette picked from that seed.

Options:
${allFlags.map(line).join('\n')}

Output & info:
${cliOnlyFlags.map(line).join('\n')}
`;
})();

const parseOptions: ParseArgsConfig['options'] = {
  ...Object.fromEntries(allFlags.map((f) => [f.flag, { type: 'string' as const }])),
  out: { type: 'string' },
  json: { type: 'boolean' },
  'list-palettes': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

/** What a flag's own `parse` returns, e.g. `width` → number. */
type Parsed<K extends keyof typeof optionFlags> = ReturnType<(typeof optionFlags)[K]['parse']>;

export async function runCli(argv: string[]): Promise<void> {
  // parseArgs' inference is lost through the generated options table, so the
  // flag tables provide the types instead.
  const values = parseArgs({ args: argv, options: parseOptions }).values as Record<
    string,
    string | boolean | undefined
  >;
  const raw = (flag: string) => values[flag] as string | undefined;

  if (values.help) {
    console.log(helpText);
    return;
  }
  if (values['list-palettes']) {
    for (const palette of colorPalettes) {
      console.log(`${palette.name}  ${palette.colors.join(' ')}`);
    }
    return;
  }

  // Read each render option through its own spec, so parsing and validation live
  // with the flag definition rather than here.
  const read = <K extends keyof typeof optionFlags>(key: K): Parsed<K> | undefined => {
    const spec = optionFlags[key] as FlagSpec<Parsed<K>>;
    const value = raw(spec.flag);
    return value === undefined ? undefined : spec.parse(value);
  };

  const look: Partial<GradientLook> = {};
  for (const [key, spec] of Object.entries(lookFlags)) {
    const value = raw(spec.flag);
    if (value !== undefined) look[key as keyof GradientLook] = spec.parse(value);
  }

  // The seed is random when omitted; the palette then follows from it, exactly
  // as in the API. Both are printed, so any result can be reproduced.
  const seed = read('seed') ?? randomBytes(4).toString('hex');
  const paletteName = read('palette');
  const palette = paletteName === undefined ? pickPalette(seed) : findPalette(paletteName);
  const out = raw('out') ?? join('output', `${palette.name}-${seed}.webp`);

  const extension = extname(out).toLowerCase();
  if (extension !== '.webp' && extension !== '.png') {
    throw new Error(`--out must end in .webp or .png. Got: ${out}`);
  }

  const result = await generateMeshGradient({
    seed,
    palette,
    width: read('width'),
    height: read('height'),
    quality: read('quality'),
    format: extension === '.png' ? 'png' : 'webp',
    ...(Object.keys(look).length > 0 ? { look } : {}),
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, result.buffer);

  if (values.json) {
    const { buffer, palette: used, ...meta } = result;
    console.log(
      JSON.stringify({ ...meta, palette: used.name, out, bytes: buffer.length }),
    );
  } else {
    console.log(`✓ ${out} (${(result.buffer.length / 1024).toFixed(2)} KB)`);
    console.log(`  seed: ${result.seed}`);
    console.log(`  palette: ${result.palette.name} (accent: ${result.accent})`);
  }
}

// Only run when executed as a command; importing this module (tests, tooling) does nothing.
const invokedPath = process.argv[1];
if (invokedPath && realpathSync(invokedPath) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
