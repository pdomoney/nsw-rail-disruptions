// RFC 4180 CSV parser → array of objects keyed by the header row.
// `columns` limits which columns are kept (saves memory on big GTFS files).
export function parseCsv(text, columns = null) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let field = '', row = [], inQuotes = false, i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  const idx = header.map((h, j) => [h, j]).filter(([h]) => !columns || columns.includes(h));
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === '') continue;
    const o = {};
    for (const [h, j] of idx) o[h] = cells[j] ?? '';
    out.push(o);
  }
  return out;
}

export function toCsvLine(values) {
  return values.map(v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}

// Streaming reader for large CSV files (e.g. GTFS stop_times.txt) held in a Buffer.
// Calls fn(values) with the requested columns for each row, without building every row in memory.
export function forEachCsvRow(buf, columns, fn) {
  let pos = 0;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) pos = 3;
  const nextLine = () => {
    if (pos >= buf.length) return null;
    let end = buf.indexOf(10, pos);
    if (end < 0) end = buf.length;
    let line = buf.toString('utf8', pos, end);
    pos = end + 1;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    return line;
  };
  const split = line => {
    if (!line.includes('"')) return line.split(',');
    const out = [];
    let field = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(field); field = ''; } else field += c;
    }
    out.push(field);
    return out;
  };
  const header = split(nextLine() || '').map(h => h.trim());
  const idx = columns.map(c => header.indexOf(c));
  let line;
  while ((line = nextLine()) !== null) {
    if (!line) continue;
    const cells = split(line);
    fn(idx.map(i => (i < 0 ? '' : cells[i] ?? '')));
  }
}
