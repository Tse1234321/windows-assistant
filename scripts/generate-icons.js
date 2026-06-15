'use strict';

/**
 * Generates simple placeholder PNG icons (no external dependencies).
 *  - build/icon.png            -> 256x256, used by electron-builder for the app icon
 *  - electron/assets/tray-icon.png -> 32x32, used for the Windows system tray
 *
 * Replace these files with your own branded artwork any time.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- CRC32 (for PNG chunks) ---------------------------------------------
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Draw the icon into an RGBA buffer.
function renderPixels(size) {
  const px = Buffer.alloc(size * size * 4);
  const accent = [56, 189, 248]; // light blue
  const bgTop = [17, 24, 39]; // dark slate
  const bgBottom = [30, 41, 59];

  const set = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };

  const radius = Math.round(size * 0.18);
  const inCorner = (x, y) => {
    // rounded-corner mask
    const corners = [
      [radius, radius],
      [size - radius - 1, radius],
      [radius, size - radius - 1],
      [size - radius - 1, size - radius - 1],
    ];
    const nearLeft = x < radius;
    const nearRight = x > size - radius - 1;
    const nearTop = y < radius;
    const nearBottom = y > size - radius - 1;
    if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
      const cx = nearLeft ? corners[0][0] : corners[1][0];
      const cy = nearTop ? corners[0][1] : corners[2][1];
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= radius * radius;
    }
    return true;
  };

  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = Math.round(bgTop[0] + (bgBottom[0] - bgTop[0]) * t);
    const g = Math.round(bgTop[1] + (bgBottom[1] - bgTop[1]) * t);
    const b = Math.round(bgTop[2] + (bgBottom[2] - bgTop[2]) * t);
    for (let x = 0; x < size; x++) {
      if (inCorner(x, y)) {
        set(x, y, r, g, b, 255);
      } else {
        set(x, y, 0, 0, 0, 0);
      }
    }
  }

  // Draw a simple "heartbeat / pulse" line across the middle in accent colour.
  const midY = Math.round(size * 0.5);
  const amp = Math.round(size * 0.18);
  const thickness = Math.max(2, Math.round(size * 0.06));
  const points = [];
  for (let x = Math.round(size * 0.12); x < size * 0.88; x++) {
    const phase = (x - size * 0.12) / (size * 0.76);
    let y = midY;
    if (phase > 0.38 && phase < 0.46) y = midY - amp;
    else if (phase >= 0.46 && phase < 0.54) y = midY + amp;
    else if (phase >= 0.54 && phase < 0.6) y = midY - Math.round(amp * 0.5);
    points.push([x, y]);
  }
  for (const [x, y] of points) {
    for (let ty = -thickness; ty <= thickness; ty++) {
      const yy = y + ty;
      if (yy >= 0 && yy < size && inCorner(x, yy)) {
        set(x, yy, accent[0], accent[1], accent[2], 255);
      }
    }
  }

  return px;
}

function buildPng(size) {
  const pixels = renderPixels(size);
  // Add filter byte (0) at the start of every scanline.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

const targets = [
  { file: path.join(__dirname, '..', 'build', 'icon.png'), size: 256 },
  { file: path.join(__dirname, '..', 'electron', 'assets', 'tray-icon.png'), size: 32 },
];

for (const { file, size } of targets) {
  ensureDir(file);
  fs.writeFileSync(file, buildPng(size));
  console.log(`Generated ${path.relative(process.cwd(), file)} (${size}x${size})`);
}
