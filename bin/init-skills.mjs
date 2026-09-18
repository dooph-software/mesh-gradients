#!/usr/bin/env node
/**
 * bin/init-skills.mjs — copy the bundled agent skills into a consuming project.
 * npm bin: mesh-gradients-init-skills
 *
 * From a project that has installed the package:
 *   npx mesh-gradients-init-skills
 *
 * Mirrors @dooph-software/design-system's init-skills. The bin name is prefixed
 * because both packages would otherwise claim node_modules/.bin/init-skills in a
 * project that installs both, and only one would win.
 *
 * Copies skills/ into the agent directories the user picks. Modifies nothing else.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const PKG_SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills');
const CWD = process.cwd();

const NO_COLOR = !process.stdout.isTTY || process.env.NO_COLOR;
const paint = (code) => (s) => (NO_COLOR ? s : `\x1b[${code}m${s}\x1b[0m`);
const bold = paint(1);
const dim = paint(2);
const green = paint(32);
const cyan = paint(36);
const yellow = paint(33);

/** Where each agent framework looks for skills inside a project. Append to support another. */
const TARGETS = [
  { dir: '.agents/skills', label: '.agents/   — Cursor Agent Skills' },
  { dir: '.claude/skills', label: '.claude/   — Claude Code' },
  { dir: '.agent/skills', label: '.agent/    — other agent frameworks' },
];

// Read answers through the async iterator rather than rl.question(): it buffers
// lines, so piped answers (`printf 'y\nn\n' | npx ...`) aren't dropped when they
// arrive before the prompt. End of input counts as Enter, i.e. the default yes.
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (question) => {
  process.stdout.write(question);
  const { value, done } = await lines.next();
  if (!process.stdin.isTTY) process.stdout.write('\n');
  return done ? '' : value.trim();
};

async function main() {
  console.log(`\n${bold('@dooph-software/mesh-gradients')}${dim(' · init-skills')}\n`);

  if (!existsSync(PKG_SKILLS)) {
    console.error('  ✗ skills/ not found in the installed package. Try reinstalling it.');
    process.exit(1);
  }

  const skills = readdirSync(PKG_SKILLS);
  console.log(`  ${skills.length} skill(s): ${dim(skills.join(', '))}\n`);
  console.log(`  Install to which directories? ${dim('Enter or y to install, n to skip.')}\n`);

  const selected = [];
  for (const target of TARGETS) {
    const note = existsSync(resolve(CWD, target.dir)) ? yellow('  (exists — will merge)') : '';
    const answer = await ask(`  ${target.label}${note}\n  ${dim('[Y/n]:')} `);
    if (answer.toLowerCase() !== 'n') selected.push(target);
  }

  if (selected.length === 0) {
    console.log(dim('\n  Nothing selected. No files changed.\n'));
    return;
  }

  console.log();
  for (const target of selected) {
    const dest = resolve(CWD, target.dir);
    mkdirSync(dest, { recursive: true });
    await cp(PKG_SKILLS, dest, { recursive: true, force: true });
    console.log(`  ${green('✓')} ${cyan(target.dir)}`);
  }
  console.log();
}

main()
  .catch((err) => {
    console.error(`\n  ✗ ${err.message ?? err}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
