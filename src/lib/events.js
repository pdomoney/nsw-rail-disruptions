// Ended alert events are stored as JSON lines, one file per month (by Sydney start date).
import path from 'node:path';
import { appendLines, listFiles, readLines } from './store.js';
import { sydDate, toMs } from './time.js';

export function eventFile(dataDir, rec) {
  const month = sydDate(toMs(rec.st)).slice(0, 7);
  return path.join(dataDir, 'alerts', 'events', `${month}.jsonl`);
}

export function appendEvents(dataDir, records) {
  const byFile = new Map();
  for (const r of records) {
    const f = eventFile(dataDir, r);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(JSON.stringify(r));
  }
  for (const [f, lines] of byFile) appendLines(f, lines);
}

export function* readAllEvents(dataDir) {
  for (const f of listFiles(path.join(dataDir, 'alerts', 'events'), /\.jsonl$/)) {
    for (const line of readLines(f)) {
      try { yield JSON.parse(line); } catch { /* skip a damaged line */ }
    }
  }
}
