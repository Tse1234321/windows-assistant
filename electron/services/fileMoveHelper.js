'use strict';

const fs = require('fs');
const path = require('path');

function getUniquePath(targetPath, reserved = new Set()) {
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let candidate = targetPath;
  let counter = 1;

  while (fs.existsSync(candidate) || reserved.has(path.resolve(candidate).toLowerCase())) {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    counter += 1;
  }

  reserved.add(path.resolve(candidate).toLowerCase());
  return candidate;
}

async function moveFile(sourcePath, targetPath) {
  try {
    await fs.promises.rename(sourcePath, targetPath);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(sourcePath, targetPath);
    await fs.promises.unlink(sourcePath);
  }
}

function relativeOrFull(rootPath, filePath, showFullPaths) {
  return showFullPaths ? filePath : path.relative(rootPath, filePath) || path.basename(filePath);
}

module.exports = {
  getUniquePath,
  moveFile,
  relativeOrFull,
};
