// Verify that GitHub Pages actually contains the official rendered map, rather
// than reporting a successful deployment with a missing image as before.
// PNG header + final chunk + source PDF's portrait page aspect are checked.
// The PDF's SHA-256 is separately pinned in scripts/render-official-map.sh.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyOfficialMap(file, {
  width = 2048, minHeight = 2850, maxHeight = 2940, minBytes = 50_000,
} = {}) {
  if (!fs.existsSync(file)) throw new Error('Missing official TfNSW map image: ' + file);
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size < minBytes) {
    throw new Error('Official TfNSW map image is missing, empty or suspiciously small: ' + file);
  }
  const fd = fs.openSync(file, 'r');
  let imageWidth, imageHeight;
  try {
    const header = Buffer.alloc(33);
    if (fs.readSync(fd, header, 0, header.length, 0) !== header.length ||
        header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        header.readUInt32BE(8) !== 13 ||
        header.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('Official TfNSW map file is not a complete PNG image: ' + file);
    }
    imageWidth = header.readUInt32BE(16);
    imageHeight = header.readUInt32BE(20);
    if (imageWidth !== width || imageHeight < minHeight || imageHeight > maxHeight) {
      throw new Error('Official TfNSW map PNG dimensions differ from the verified 2026 PDF: ' +
        imageWidth + ' × ' + imageHeight);
    }
    const tail = Buffer.alloc(12);
    if (fs.readSync(fd, tail, 0, tail.length, stat.size - tail.length) !== tail.length ||
        tail.readUInt32BE(0) !== 0 || tail.toString('ascii', 4, 8) !== 'IEND') {
      throw new Error('Official TfNSW map PNG has no final IEND chunk: ' + file);
    }
  } finally { fs.closeSync(fd); }
  return { width: imageWidth, height: imageHeight, bytes: stat.size };
}

const runningAsCli = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runningAsCli) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('Usage: node scripts/verify-official-map.mjs <path-to-map.png>');
    const result = verifyOfficialMap(file);
    console.log('Verified TfNSW official network map PNG:', JSON.stringify(result));
  } catch (error) {
    console.error('::error::TfNSW original map is not publishable: ' + error.message);
    process.exitCode = 1;
  }
}
