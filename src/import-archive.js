// Backfills alert history from the community archive of the TfNSW service alerts feed:
// https://github.com/jxeeno/nsw-service-alerts-historical (data branch, data/raw-ics/all.json).
//
// Every archived version of all.json is replayed through the same tracker as live collection.
//
// Usage:
//   node src/import-archive.js --repo <path to clone of the archive> --out <data dir> [--since 2023-07-01] [--until ...]
//
// The clone must contain the archive's `data` branch. A partial clone keeps it small:
//   git clone --filter=blob:none --single-branch --branch data https://github.com/jxeeno/nsw-service-alerts-historical archive
// Missing file versions are fetched in bulk first (see scripts/fetch-archive.sh) — otherwise git
// downloads them one by one, which is very slow.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { normalizeInfo } from './lib/classify.js';
import { applySnapshot, createState } from './lib/tracker.js';
import { appendEvents } from './lib/events.js';
import { readJson, writeJson } from './lib/store.js';
import { iso, sydDate } from './lib/time.js';

function args() {
  const a = process.argv.slice(2);
  const o = { since: '2023-07-01', until: null, repo: null, out: 'data', ref: 'data', file: 'data/raw-ics/all.json' };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    o[k] = a[++i];
  }
  if (!o.repo) throw new Error('--repo is required');
  return o;
}

// [{ t: unixSeconds, oid }] oldest first, one per change of the file.
export function listVersions(repo, ref, file, since, until) {
  const argv = ['log', '--format=%ct', '--raw', '--no-abbrev', '--reverse'];
  if (since) argv.push(`--since=${since}`);
  if (until) argv.push(`--until=${until}`);
  argv.push(ref, '--', file);
  const out = execFileSync('git', argv, { cwd: repo, maxBuffer: 1 << 30 }).toString();
  const list = [];
  let t = null;
  for (const line of out.split('\n')) {
    if (/^\d+$/.test(line)) t = Number(line);
    else if (line.startsWith(':')) {
      const parts = line.split(/\s+/);
      const oid = parts[3];
      if (t && oid && !/^0+$/.test(oid)) list.push({ t, oid });
    }
  }
  return list;
}

export async function* readBlobs(repo, oids) {
  const p = spawn('git', ['cat-file', '--batch'], { cwd: repo, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } });
  (async () => {
    for (const o of oids) if (!p.stdin.write(o + '\n')) await new Promise(r => p.stdin.once('drain', r));
    p.stdin.end();
  })();
  // Chunks are collected in a list and joined once per object (joining on every chunk is
  // quadratic for multi-megabyte files).
  let chunks = [], have = 0, need = 0, cur = null;
  const take = n => {
    const all = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, have);
    const head = all.subarray(0, n);
    const rest = all.subarray(n);
    chunks = rest.length ? [rest] : [];
    have = rest.length;
    return head;
  };
  for await (const chunk of p.stdout) {
    chunks.push(chunk);
    have += chunk.length;
    for (;;) {
      if (!cur) {
        // Header line: "<oid> <type> <size>\n" (or "<oid> missing\n")
        const first = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, have);
        if (chunks.length > 1) chunks = [first];
        const nl = first.indexOf(10);
        if (nl < 0) break;
        const [oid, type, size] = first.subarray(0, nl).toString().split(' ');
        take(nl + 1);
        if (type === 'missing') { yield { oid, data: null }; continue; }
        cur = oid; need = Number(size) + 1;
      }
      if (have < need) break;
      const body = take(need);
      yield { oid: cur, data: body.subarray(0, need - 1) };
      cur = null;
    }
  }
}

async function main() {
  const o = args();
  const all = listVersions(o.repo, o.ref, o.file, o.since, o.until);
  // Only read versions that are already downloaded (asking git for a missing object in a
  // partial clone with lazy fetching disabled can hang).
  const present = new Set(execFileSync('git', ['cat-file', '--batch-all-objects', '--batch-check=%(objectname)'],
    { cwd: o.repo, maxBuffer: 1 << 30 }).toString().split('\n'));
  const versions = all.filter(v => present.has(v.oid));
  console.log(`${all.length} archived snapshots from ${o.since}; ${all.length - versions.length} not downloaded, skipped`);
  const state = createState();
  const cache = new Map(); // `${id}|${lastModification}|${version}` → normalised record
  const coverage = {};
  let done = 0, missing = 0, events = 0, bad = 0;
  const t0 = Date.now();
  let batch = [];
  const flush = () => { appendEvents(o.out, batch); events += batch.length; batch = []; };
  let i = 0;
  for await (const { data } of readBlobs(o.repo, versions.map(v => v.oid))) {
    const v = versions[i++];
    if (!data) { missing++; continue; }
    let items;
    try { items = JSON.parse(data.toString('utf8')); } catch { bad++; continue; }
    if (!Array.isArray(items)) { bad++; continue; }
    const recs = [];
    const keep = new Set();
    for (const x of items) {
      const key = `${x.id}|${x.timestamps?.lastModification}|${x.version}`;
      keep.add(key);
      let r = cache.get(key);
      if (r === undefined) { r = normalizeInfo(x); cache.set(key, r); }
      if (r) recs.push(r);
    }
    if (cache.size > 50_000) for (const k of cache.keys()) if (!keep.has(k)) cache.delete(k);
    const ms = v.t * 1000;
    batch.push(...applySnapshot(state, ms, recs, { src: 'archive' }));
    const day = sydDate(ms);
    coverage[day] = (coverage[day] || 0) + 1;
    if (batch.length > 2000) flush();
    if (++done % 5000 === 0) console.log(`  ${done}/${versions.length} snapshots, ${events + batch.length} events, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  flush();
  const last = versions.length ? versions[versions.length - 1].t * 1000 : null;
  // Hand the still-open alerts to the live collector so tracking continues seamlessly.
  writeJson(path.join(o.out, 'alerts', 'open.json'), { updatedAt: last ? iso(last) : null, open: state.open });
  const metaFile = path.join(o.out, 'state', 'meta.json');
  const meta = readJson(metaFile, {});
  meta.alertsLastOkAt = state.lastOkAt;
  meta.archiveImport = { at: iso(Date.now()), since: o.since, snapshots: done, missing: missing + all.length - versions.length, unreadable: bad, events, lastSnapshot: last ? iso(last) : null };
  writeJson(metaFile, meta, { pretty: true });
  writeJson(path.join(o.out, 'coverage', 'archive.json'), coverage);
  console.log(`Done: ${done} snapshots (${missing} missing, ${bad} unreadable), ${events} events.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
