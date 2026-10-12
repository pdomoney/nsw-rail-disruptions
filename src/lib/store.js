import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read ${file}: ${e.message}`);
  }
}

// Atomic write (write to temp file, then rename) so an interrupted run never leaves half a file.
export function writeJson(file, obj, { pretty = false } = {}) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, pretty ? 1 : 0) + '\n');
  fs.renameSync(tmp, file);
}

export function appendLines(file, lines, header = null) {
  if (!lines.length) return;
  ensureDir(path.dirname(file));
  const exists = fs.existsSync(file);
  const prefix = !exists && header ? header + '\n' : '';
  fs.appendFileSync(file, prefix + lines.join('\n') + '\n');
}

export function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export function listFiles(dir, re = null) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p, re));
    else if (!re || re.test(ent.name)) out.push(p);
  }
  return out.sort();
}
