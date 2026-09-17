#!/usr/bin/env node
/**
 * Typecheck every ```ts block in README.md against the real source, so a sample
 * that no longer matches the API fails the build instead of misleading a reader.
 *
 * Package specifiers are rewritten to the local sources, and each block becomes
 * its own module so blocks can't collide.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = join(root, 'README.md');
const blocks = [...readFileSync(readme, 'utf8').matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);

if (blocks.length === 0) throw new Error('No ```ts blocks found in README.md — check the parser.');

const dir = mkdtempSync(join(tmpdir(), 'mesh-readme-'));
const srcFrom = (file) => relative(dirname(file), join(root, 'src')).replaceAll('\\', '/');
const files = blocks.map((block, i) => {
  const file = join(dir, `readme-${i + 1}.ts`);
  // Matches either quote style, and the /palettes subpath as well as the root.
  const code = block.replace(
    /(['"])@dooph-software\/mesh-gradients(\/[\w-]+)?\1/g,
    (_match, quote, subpath) => `${quote}${srcFrom(file)}${subpath ?? '/index'}${quote}`,
  );
  writeFileSync(file, code);
  return file;
});

try {
  // Run TypeScript's own entry with this Node, rather than the npx shim:
  // spawning .cmd files fails with EINVAL on Windows.
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--noEmit',
      '--strict',
      '--target', 'es2022',
      '--module', 'esnext',
      '--moduleResolution', 'bundler',
      '--skipLibCheck',
      '--types', 'node',
      ...files,
    ],
    { cwd: root, stdio: 'pipe', encoding: 'utf8' },
  );
  console.log(`✓ ${blocks.length} README code samples typecheck`);
} catch (err) {
  // tsc reports temp-file paths; map them back to block numbers for the reader.
  const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n');
  console.error(output.replaceAll(dir, '<temp>'));
  console.error(
    `README code samples failed to typecheck. readme-N.ts is the Nth \`\`\`ts block in README.md (${blocks.length} total).`,
  );
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
