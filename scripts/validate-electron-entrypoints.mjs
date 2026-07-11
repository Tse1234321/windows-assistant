/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'electron');
const localRequire = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const extensions = ['', '.js', '.cjs', '.mjs', '.json'];

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(target);
      return entry.isFile() && /\.(?:cjs|js|mjs)$/.test(entry.name) ? [target] : [];
    });
}

function resolveLocalImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const suffix of extensions) {
    const candidate = `${base}${suffix}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  for (const suffix of extensions.slice(1)) {
    const candidate = path.join(base, `index${suffix}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return '';
}

const missing = [];
for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(localRequire)) {
    if (!resolveLocalImport(file, match[1])) {
      missing.push(`${path.relative(process.cwd(), file)} -> ${match[1]}`);
    }
  }
}

if (missing.length) {
  console.error('Missing local Electron entrypoint dependencies:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Electron local require validation passed.');
