/*
 * mesh-gradients.test — the suite that pins determinism, palette selection and
 * CLI/API parity.
 *
 * ## behavior
 * - Everything is imported from `dist/`, not `src/`. `npm test` builds first, so
 *   these run against the published artifact.
 * - `test/fixtures/jewel-peacock-aspect.webp` is Aspect's released 0.3.0
 *   artwork. The render of seed `aspect` + `jewel-peacock` is compared to it
 *   byte-for-byte.
 *
 * ## constraints
 * - The fixture is evidence, not a snapshot. Never regenerate it, replace it
 *   with current output, or relax the comparison to a size or pixel-tolerance
 *   check to get the suite green: it is the only thing standing between an edit
 *   to `src/render.ts` or `src/random.ts` and silently re-rendering artwork that
 *   has already shipped in another product. A failure here means the change is
 *   wrong, unless a `sharp`/`libwebp` bump is the cause — then compare decoded
 *   pixels first and say so in the commit that touches the fixture.
 * - The CLI checks read flags back out of the generated `helpText`, which is why
 *   they catch a render option that has no flag. Replacing that with a
 *   hardcoded list of flag names turns the test into a restatement of itself and
 *   it will pass forever.
 * - The rendezvous-hashing tests (order independence, add/remove stability, even
 *   distribution over 2000 seeds) are the specification of `pickPalette`, not
 *   sampling noise. Do not loosen the thresholds or shrink the seed count to
 *   quiet a failure — a genuine failure there means seeds have been reassigned
 *   to different palettes.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  colorPalettes,
  createMeshGradients,
  findPalette,
  generateMeshGradient,
  paletteAccent,
  pickPalette,
  validatePalette,
} from '../dist/index.js';

test('palette names are unique and every color is a 6-digit hex', () => {
  const names = colorPalettes.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  for (const palette of colorPalettes) {
    assert.doesNotThrow(() => validatePalette(palette), palette.name);
  }
});

test('findPalette throws with the valid names on a miss', () => {
  assert.equal(findPalette('mint-sea').name, 'mint-sea');
  assert.throws(() => findPalette('nope'), /Unknown palette "nope"/);
});

const seeds = Array.from({ length: 2000 }, (_, i) => `seed-${i}`);
const picks = (palettes) => seeds.map((seed) => pickPalette(seed, palettes).name);

test('pickPalette is deterministic and ignores list order', () => {
  assert.equal(pickPalette('autocad-0.3.0').name, pickPalette('autocad-0.3.0').name);
  assert.deepEqual(picks([...colorPalettes].reverse()), picks(colorPalettes));
});

test('pickPalette uses every palette roughly evenly', () => {
  const counts = new Map();
  for (const name of picks(colorPalettes)) counts.set(name, (counts.get(name) ?? 0) + 1);
  assert.equal(counts.size, colorPalettes.length);
  const expected = seeds.length / colorPalettes.length; // ~54
  for (const [name, count] of counts) assert.ok(count > expected * 0.4 && count < expected * 2, `${name}: ${count}`);
});

test('adding a palette only moves seeds onto the new palette', () => {
  const extra = { name: 'brand', colors: ['#ffffff', '#888888', '#000000'] };
  const before = picks(colorPalettes);
  const after = picks([...colorPalettes, extra]);
  const moved = after.filter((name, i) => name !== before[i]);
  assert.ok(moved.length > 0);
  assert.ok(moved.every((name) => name === 'brand'));
});

test('removing a palette only moves seeds that had picked it', () => {
  const before = picks(colorPalettes);
  const after = picks(colorPalettes.filter((p) => p.name !== 'mint-sea'));
  after.forEach((name, i) => {
    if (before[i] !== 'mint-sea') assert.equal(name, before[i]);
  });
});

test('validatePalette enforces 3–5 #rrggbb colors', () => {
  const colors = (n) => Array.from({ length: n }, () => '#abcdef');
  assert.throws(() => validatePalette({ name: 'a', colors: colors(2) }), /3–5 colors. Got 2/);
  assert.throws(() => validatePalette({ name: 'a', colors: colors(6) }), /3–5 colors. Got 6/);
  assert.throws(() => validatePalette({ name: 'a', colors: ['#fff', '#000000', '#000000'] }), /invalid color "#fff"/);
  assert.throws(() => validatePalette({ name: '', colors: colors(3) }), /non-empty name/);
  assert.doesNotThrow(() => validatePalette({ name: 'a', colors: colors(5) }));
});

test('createMeshGradients validates its set up front', () => {
  const good = { name: 'a', colors: ['#ffffff', '#888888', '#000000'] };
  assert.throws(() => createMeshGradients({ palettes: [] }), /At least one/);
  assert.throws(() => createMeshGradients({ palettes: [good, good] }), /Duplicate palette name "a"/);
  assert.throws(() => createMeshGradients({ palettes: [{ name: 'b', colors: ['#ffffff'] }] }), /Got 1/);
});

test('createMeshGradients picks, finds, and renders only from its own set', async () => {
  const brand = { name: 'brand', colors: ['#ffffff', '#888888', '#000000'] };
  const gradients = createMeshGradients({ palettes: [brand] });
  assert.equal(gradients.pickPalette('anything').name, 'brand');
  assert.throws(() => gradients.findPalette('mint-sea'), /Unknown palette "mint-sea"/);
  const result = await gradients.generate({ seed: 'x', format: 'png', width: 8, height: 8 });
  assert.equal(result.palette.name, 'brand');
  await assert.rejects(
    gradients.generate({ seed: 'x', palette: { name: 'bad', colors: ['#ffffff', '#000000'] } }),
    /3–5 colors/,
  );
});

test('createMeshGradients applies default size, per-call size wins', async () => {
  const gradients = createMeshGradients({ palettes: colorPalettes, width: 40, height: 20 });
  const defaults = await gradients.generate({ seed: 'x', format: 'png' });
  assert.deepEqual([defaults.width, defaults.height], [40, 20]);
  const overridden = await gradients.generate({ seed: 'x', format: 'png', height: 10 });
  assert.deepEqual([overridden.width, overridden.height], [40, 10]);
  const canvas = await gradients.render({ seed: 'x' });
  assert.deepEqual([canvas.canvas.width, canvas.canvas.height], [40, 20]);
});

test('createMeshGradients rejects invalid sizes', async () => {
  assert.throws(() => createMeshGradients({ palettes: colorPalettes, width: 0 }), /width must be a positive integer/);
  assert.throws(() => createMeshGradients({ palettes: colorPalettes, height: 1.5 }), /height must be a positive integer/);
  const gradients = createMeshGradients({ palettes: colorPalettes });
  await assert.rejects(gradients.generate({ seed: 'x', width: -1 }), /width must be a positive integer/);
});

test('paletteAccent returns the mid-tone', () => {
  assert.equal(paletteAccent(findPalette('jewel-peacock')), '#1f7a99');
});

// Fixture is Aspect's released 0.3.0 artwork (seed "aspect", jewel-peacock,
// 1200×1500, WebP q82). Matching it byte-for-byte proves the extraction did not
// change the look. Encoder upgrades (sharp/libwebp) can shift bytes without a
// visual change — if this alone fails after a dependency bump, compare pixels.
test('reproduces the Aspect 0.3.0 release gradient exactly', async () => {
  const result = await generateMeshGradient({ seed: 'aspect', palette: 'jewel-peacock' });
  const fixture = readFileSync(new URL('./fixtures/jewel-peacock-aspect.webp', import.meta.url));
  assert.equal(result.accent, '#1f7a99');
  assert.equal(result.width, 1200);
  assert.equal(result.height, 1500);
  assert.ok(result.buffer.equals(fixture), 'rendered WebP differs from fixture');
});

test('png output honors custom size', async () => {
  const result = await generateMeshGradient({ seed: 'x', format: 'png', width: 64, height: 32 });
  assert.equal(result.format, 'png');
  assert.equal(result.buffer.subarray(1, 4).toString(), 'PNG');
  assert.equal(result.width, 64);
});

// ── CLI ────────────────────────────────────────────────────────────────────
// The CLI holds no flag list of its own: parser, help and options all come from
// the flag tables, so these checks are what keeps it level with the TS API.
const { helpText, runCli } = await import('../dist/cli.js');
const { defaultLook } = await import('../dist/index.js');

test('every render option has a CLI flag', () => {
  // The help text is generated from the flag tables, so reading it back is the
  // same as reading the tables.
  const flagged = [...helpText.matchAll(/^ {2}--([a-z-]+)/gm)].map((m) => m[1]);
  for (const knob of Object.keys(defaultLook)) {
    const flag = knob.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    assert.ok(flagged.includes(flag), `missing --${flag}`);
  }
  for (const flag of ['seed', 'palette', 'width', 'height', 'quality', 'out', 'json']) {
    assert.ok(flagged.includes(flag), `missing --${flag}`);
  }
});

test('runCli writes a file and honors look flags', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesh-cli-'));
  const out = join(dir, 'out.png');
  await runCli(['--seed', 'cli', '--palette', 'mint-sea', '--width', '32', '--height', '32', '--grain-opacity', '0', '--out', out]);
  assert.ok(statSync(out).size > 0);
  rmSync(dir, { recursive: true, force: true });
});

/** Runs the CLI with --json and returns the parsed metadata line. */
async function runJson(args) {
  const lines = [];
  const log = console.log;
  console.log = (line) => lines.push(line);
  try {
    await runCli([...args, '--json']);
  } finally {
    console.log = log;
  }
  return JSON.parse(lines.at(-1));
}

test('runCli derives the palette from the seed and honors an explicit one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesh-cli-'));
  const args = ['--width', '4', '--height', '4'];
  const a = await runJson([...args, '--seed', 'fixed', '--out', join(dir, 'a.png')]);
  const b = await runJson([...args, '--seed', 'fixed', '--out', join(dir, 'b.png')]);
  assert.equal(a.palette, b.palette);
  assert.equal(a.palette, pickPalette('fixed').name);

  const explicit = await runJson([...args, '--seed', 'fixed', '--palette', 'mint-sea', '--out', join(dir, 'c.png')]);
  assert.equal(explicit.palette, 'mint-sea');
  rmSync(dir, { recursive: true, force: true });
});

test('runCli uses a random seed when none is given', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesh-cli-'));
  const a = await runJson(['--width', '4', '--height', '4', '--out', join(dir, 'a.png')]);
  const b = await runJson(['--width', '4', '--height', '4', '--out', join(dir, 'b.png')]);
  rmSync(dir, { recursive: true, force: true });
  assert.notEqual(a.seed, b.seed);
  assert.equal(a.palette, pickPalette(a.seed).name);
});

test('runCli rejects bad flag values through the flag specs', async () => {
  await assert.rejects(runCli(['--width', '0']), /--width must be a positive integer/);
  await assert.rejects(runCli(['--grain-opacity', 'abc']), /--grain-opacity must be a number/);
  await assert.rejects(runCli(['--out', 'x.gif']), /must end in .webp or .png/);
});
