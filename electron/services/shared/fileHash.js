'use strict';

const crypto = require('crypto');
const fs = require('fs');

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readSlice(filePath, start, length) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function hashFilePartial(filePath, size, bytesPerEdge = 8192) {
  const total = Number(size || 0);
  if (total <= bytesPerEdge * 2) return hashFile(filePath);
  const [head, tail] = await Promise.all([
    readSlice(filePath, 0, bytesPerEdge),
    readSlice(filePath, Math.max(0, total - bytesPerEdge), bytesPerEdge),
  ]);
  const hash = crypto.createHash('sha256');
  hash.update(head);
  hash.update(tail);
  hash.update(String(total));
  return hash.digest('hex');
}

module.exports = {
  hashFile,
  hashFilePartial,
};
