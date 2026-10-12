// Follows alerts across successive snapshots of the alerts feed and emits an event when an
// alert disappears, with estimated start and end times.
//
// The same logic is used for live collection (one snapshot per run) and for importing the
// community archive (one snapshot per archived commit).
import { iso, toMs, HOUR, MIN } from './time.js';

// Alerts first seen with a last-modified time older than this are leftovers in the feed
// (the Trip Planner feed keeps some trip messages for months) and are ignored.
const STALE_AFTER = 48 * HOUR;
const STALE_KINDS = new Set(['incident', 'advisory', 'trip', 'station']);
const KIND_RANK = { incident: 5, planned: 4, trip: 3, station: 2, advisory: 1, notice: 0 };

export function createState() {
  return { open: {}, lastOkAt: null };
}

// Merge a newer version of an alert into the open record.
function merge(prev, cur) {
  const lines = new Set([...(prev.l || []), ...(cur.l || [])]);
  const out = { ...prev, ...cur, l: [...lines] };
  out.fs = prev.fs;
  out.st = prev.st;
  if (prev.stale) out.stale = true;
  // Keep the most significant classification seen during the alert's life.
  if ((KIND_RANK[prev.k] ?? 0) > (KIND_RANK[cur.k] ?? 0)) { out.k = prev.k; out.s = prev.s; }
  if (prev.c && prev.c !== 'unknown' && (!cur.c || cur.c === 'unknown')) out.c = prev.c;
  if (prev.k === 'incident' && out.k === 'incident' && !out.c) out.c = prev.c;
  if (prev.t0 == null) out.t0 = prev.t; else out.t0 = prev.t0;
  if (out.t0 === out.t) delete out.t0;
  out.n = (prev.n || 1) + (prev.m !== cur.m ? 1 : 0);
  return out;
}

function startTime(rec, firstSeenMs) {
  const cr = toMs(rec.cr);
  if (cr != null && cr <= firstSeenMs && cr >= firstSeenMs - 6 * HOUR) return cr;
  return firstSeenMs;
}

function finish(rec, lastSeenMs, goneMs, src) {
  const gap = Math.max(0, goneMs - lastSeenMs);
  const end = lastSeenMs + Math.min(gap, 30 * MIN) / 2;
  const out = { ...rec, ls: iso(lastSeenMs), en: iso(Math.max(end, toMs(rec.st))) };
  delete out.stale;
  if (src) out.src = src;
  return out;
}

// Apply one snapshot. `records` are normalised alerts present at `snapshotMs`.
// Returns the list of alerts that ended (are no longer present).
export function applySnapshot(state, snapshotMs, records, { src = null } = {}) {
  const closed = [];
  const seen = new Set();
  const prevOk = state.lastOkAt ? toMs(state.lastOkAt) : null;
  for (const rec of records) {
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    const prev = state.open[rec.id];
    if (prev) {
      state.open[rec.id] = merge(prev, rec);
      continue;
    }
    const fs = snapshotMs;
    const o = { ...rec, fs: iso(fs), st: iso(startTime(rec, fs)) };
    const mod = toMs(rec.m) ?? toMs(rec.cr);
    if (STALE_KINDS.has(rec.k) && mod != null && mod < snapshotMs - STALE_AFTER) o.stale = true;
    state.open[rec.id] = o;
  }
  for (const id of Object.keys(state.open)) {
    if (seen.has(id)) continue;
    const rec = state.open[id];
    delete state.open[id];
    if (rec.stale) continue;
    const lastSeen = prevOk ?? toMs(rec.fs);
    closed.push(finish(rec, Math.max(lastSeen, toMs(rec.fs)), snapshotMs, src));
  }
  state.lastOkAt = iso(snapshotMs);
  return closed;
}

// Snapshot of currently open (non-stale) alerts, for the "right now" view.
export function openRecords(state) {
  return Object.values(state.open).filter(r => !r.stale);
}
