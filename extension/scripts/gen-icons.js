// Generates placeholder extension icons (16/48/128px) as PNGs:
// a brand-blue rounded square with a white circle. Replace with real art anytime.
// Run: node extension/scripts/gen-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const bg = [66, 133, 244, 255]; // #4285F4
  const fg = [255, 255, 255, 255];
  const r = size * 0.28; // white circle radius
  const cx = size / 2, cy = size / 2;
  const corner = size * 0.18; // rounded-square radius

  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      // rounded-square mask (transparent outside the corners)
      let inside = true;
      const dxC = Math.max(corner - x, x - (size - 1 - corner), 0);
      const dyC = Math.max(corner - y, y - (size - 1 - corner), 0);
      if (dxC > 0 && dyC > 0 && Math.hypot(dxC, dyC) > corner) inside = false;

      const inCircle = Math.hypot(x - cx, y - cy) <= r;
      const px = !inside ? [0, 0, 0, 0] : inCircle ? fg : bg;
      raw[p++] = px[0]; raw[p++] = px[1]; raw[p++] = px[2]; raw[p++] = px[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), makePng(size));
  console.log(`wrote icons/icon${size}.png`);
}
