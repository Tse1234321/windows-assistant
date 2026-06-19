'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

if (path.relative(root, dist).startsWith('..')) {
  throw new Error(`Refusing to clean outside project root: ${dist}`);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

console.log(`Cleaned ${path.relative(root, dist)}`);
