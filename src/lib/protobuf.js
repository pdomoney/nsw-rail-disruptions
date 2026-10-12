// Minimal protocol-buffers reader, enough to decode the GTFS-realtime messages we need.
// Unknown fields (including TfNSW extensions) are skipped.

export class Reader {
  constructor(buf, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
  }

  eof() { return this.pos >= this.end; }

  // Unsigned varint as BigInt (handles the full 64-bit range).
  varintBig() {
    let result = 0n, shift = 0n, b;
    do {
      if (this.pos >= this.end) throw new Error('protobuf: truncated varint');
      b = this.buf[this.pos++];
      result |= BigInt(b & 0x7f) << shift;
      shift += 7n;
    } while (b & 0x80);
    return result;
  }

  // Fast path for small varints; falls back to BigInt when needed.
  varint() {
    let result = 0, shift = 0, b, i = this.pos;
    while (i < this.end) {
      b = this.buf[i++];
      if (shift < 28) {
        result |= (b & 0x7f) << shift;
      } else {
        // Too big for 32-bit maths; redo with BigInt.
        return this.varintBig();
      }
      if (!(b & 0x80)) { this.pos = i; return result >>> 0; }
      shift += 7;
    }
    throw new Error('protobuf: truncated varint');
  }

  int32() {
    const v = this.varint();
    if (typeof v === 'bigint') return Number(BigInt.asIntN(32, v));
    return v | 0;
  }

  int64() {
    const v = this.varint();
    if (typeof v === 'bigint') return Number(BigInt.asIntN(64, v));
    return v;
  }

  uint64() {
    const v = this.varint();
    return typeof v === 'bigint' ? Number(v) : v;
  }

  bool() { return Boolean(this.varint()); }

  bytes() {
    const len = Number(this.varint());
    const start = this.pos;
    this.pos += len;
    if (this.pos > this.end) throw new Error('protobuf: truncated bytes');
    return [start, this.pos];
  }

  string() {
    const [s, e] = this.bytes();
    return this.buf.toString('utf8', s, e);
  }

  sub() {
    const [s, e] = this.bytes();
    return new Reader(this.buf, s, e);
  }

  tag() {
    const t = Number(this.varint());
    return [t >>> 3, t & 7];
  }

  skip(wireType) {
    switch (wireType) {
      case 0: this.varint(); break;
      case 1: this.pos += 8; break;
      case 2: this.bytes(); break;
      case 5: this.pos += 4; break;
      case 3: { // start group (deprecated) — skip until matching end group
        for (;;) {
          const [, wt] = this.tag();
          if (wt === 4) break;
          this.skip(wt);
        }
        break;
      }
      default: throw new Error('protobuf: unsupported wire type ' + wireType);
    }
    if (this.pos > this.end) throw new Error('protobuf: truncated field');
  }
}

// Decode a message with a field table: { fieldNumber: [name, decodeFn, repeated?] }.
export function decodeMessage(r, fields) {
  const out = {};
  while (!r.eof()) {
    const [num, wt] = r.tag();
    const f = fields[num];
    if (!f) { r.skip(wt); continue; }
    const [name, fn, repeated] = f;
    const val = fn(r, wt);
    if (repeated) (out[name] ||= []).push(val);
    else out[name] = val;
  }
  return out;
}
