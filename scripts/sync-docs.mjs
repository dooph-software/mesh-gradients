#!/usr/bin/env node
/**
 * Fill the generated sections of README.md from the built package, so the docs
 * can't describe a flag, knob or palette count that the code doesn't have.
 *
 *   node scripts/sync-docs.mjs           rewrite README.md
 *   node scripts/sync-docs.mjs --check   fail if it is out of date (used by npm test)
 *
 * Marked regions look like:
 *   <!-- docs:begin:cli-help -->…<!-- docs:end:cli-help -->
 * Everything outside the markers is hand-written prose and is never touched.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpText } from '../dist/cli.js';
import { colorPalettes, defaultLook, lookDescriptions } from '../dist/index.js';
import { featuredImage, readFeatured, repoRoot } from './featured.mjs';

const readmePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'README.md');
const check = process.argv.includes('--check');

const featured = readFeatured();
for (const entry of featured) {
  if (!existsSync(join(repoRoot, featuredImage(entry)))) {
    throw new Error(
      `Missing ${featuredImage(entry)} for ${entry.palette}/${entry.seed}. Run \`npm run examples\`.`,
    );
  }
}

const sections = {
  'palette-count': String(colorPalettes.length),
  featured: [
    '<table>',
    '  <tr>',
    ...featured.map(
      (entry) =>
        `    <td align="center"><img src="./${featuredImage(entry)}" width="240" alt="${entry.palette}"><br>` +
        `<code>${entry.palette}</code> · seed <code>${entry.seed}</code>` +
        (entry.caption ? `<br><sub>${entry.caption}</sub>` : '') +
        '</td>',
    ),
    '  </tr>',
    '</table>',
  ].join('\n'),
  'look-knobs': [
    '| Knob | Default | Effect |',
    '| --- | --- | --- |',
    ...Object.entries(defaultLook).map(
      ([knob, value]) => `| \`${knob}\` | \`${value}\` | ${lookDescriptions[knob]} |`,
    ),
  ].join('\n'),
  'cli-help': ['```text', helpText.trimEnd(), '```'].join('\n'),
};

const original = readFileSync(readmePath, 'utf8');
let updated = original;

for (const [name, body] of Object.entries(sections)) {
  const pattern = new RegExp(
    `(<!-- docs:begin:${name} -->)[\\s\\S]*?(<!-- docs:end:${name} -->)`,
  );
  if (!pattern.test(updated)) throw new Error(`README.md is missing the ${name} markers.`);
  // Inline sections (no newline after the marker) stay on one line.
  const inline = !sections[name].includes('\n');
  updated = updated.replace(pattern, inline ? `$1${body}$2` : `$1\n${body}\n$2`);
}

if (updated === original) {
  console.log('✓ README.md generated sections are up to date');
} else if (check) {
  console.error(
    'README.md generated sections are out of date. Run `npm run docs` and commit the result.',
  );
  process.exit(1);
} else {
  writeFileSync(readmePath, updated);
  console.log(`✓ Updated README.md (${Object.keys(sections).join(', ')})`);
}
