import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
