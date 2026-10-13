// Tiny zip reader (stored + deflate entries) using node:zlib. Enough for GTFS bundles.
import zlib from 'node:zlib';

// Entries of the central directory: { name, method, compSize, size, localOffset }.
export function zipEntries(buf) {
  // Locate the End Of Central Directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip: end of central directory not found');
  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  // Zip64
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && buf.readUInt32LE(loc) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(loc + 8));
      count = Number(buf.readBigUInt64LE(z64 + 32));
      cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
    }
  }
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    let compSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (compSize === 0xffffffff || localOffset === 0xffffffff || size === 0xffffffff) {
      // Zip64 extra field: the 64-bit values appear in this order, only for fields that are 0xffffffff.
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e < end) {
        const id = buf.readUInt16LE(e), sz = buf.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (size === 0xffffffff) { size = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (compSize === 0xffffffff) { compSize = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (localOffset === 0xffffffff) { localOffset = Number(buf.readBigUInt64LE(q)); }
        }
        e += 4 + sz;
      }
    }
    p += 46 + nameLen + extraLen + commentLen;
    entries.push({ name, method, compSize, size, localOffset });
  }
  return entries;
}

// Reads the entries named in `wanted` (base names), or all of them. Returns { baseName: Buffer }.
export function readZip(buf, wanted = null) {
  const out = {};
  for (const { name, method, compSize, localOffset } of zipEntries(buf)) {
    const base = name.split('/').pop();
    if (wanted && !wanted.includes(base)) continue;
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) out[base] = Buffer.from(data);
    else if (method === 8) out[base] = zlib.inflateRawSync(data);
    else throw new Error(`zip: unsupported compression method ${method} for ${name}`);
  }
  return out;
}
