// Turns one Trip Planner `add_info` item into a normalised alert record (or null if irrelevant).
//
// Kinds:
//   incident  unplanned disruption (track/signal faults, emergencies, weather, industrial action…)
//   planned   trackwork, planned closures and timetable changes with set dates
//   advisory  general advice (special events, wet weather, HSC exams…)
//   notice    standing editorial notices without dates
//   trip      a message about one train/tram trip (cancelled, running late, not stopping…)
//   station   station-level updates
import { matchAffectedLine } from './lines.js';
import { lineOrder } from '../config/lines.js';
import { htmlToText, truncate } from './text.js';

export const KINDS = ['incident', 'planned', 'advisory', 'notice', 'trip', 'station'];

const RE_ADVISORY_TITLE = /(special events?|wet weather|weather wise|heat smart|extreme heat|\bhsc\b|mind the gap|last carriage|easter show|vivid|sculpture by the sea|\blifts?\b|escalators?|\bopal\b|wheelchair|book your seat|on demand|reservation|new year|christmas|school holidays|reminder|marathon|anzac|australia day|mardi gras|festival|concert|\bnrl\b|\bafl\b|cricket|football|racing|race day|information displays?|displays? out of service|car park|commuter parking|station access|access changes|temporary access|accessib|wayfinding|toilets?|bike|customer information)/i;

const RE_INCIDENT = /(urgent|emergency services|medical (assistance|emergency|attention)|police|an incident|incident (at|near|on|between|involving)|freight train|animals? (in|on) the (rail )?(corridor|track)|vandal|trespass|power (supply|outage|issue|failure)|signal(ling)? (repairs|fault|issue|failure|equipment)|track (repairs|fault|issue)|overhead (wiring|wire|power)|equipment (fault|issue|repairs|failure)|flood|severe weather|storm|bushfire|\bfire\b|landslip|fallen tree|tree (on|across)|operational issue|mechanical|broken.?down|breakdown|disabled (train|tram|vehicle)|(tram|train|fleet|vehicle) availability|industrial action|derail|collision|(extra|additional) travel time|running late|not running|services (are )?(resuming|resumed|returning)|return(ing)? to normal|reduced (number of services|service|frequency)|less frequent|limited (number of )?(services|buses)|delays? (to|on|are|of|continue)|gaps in service|damage)/i;

const RE_PLANNED_STRONG = /(planned (trackwork|maintenance|works?)|trackwork|road closures?|timetable changes?|changed timetable|minor (train )?timetable|extra (services|trains)|additional services|(weeknight|weekend|nightly|overnight|evening) (full |partial )?(line )?closures?|(partial|full) (line )?closures?|may be (temporarily )?held at stops)/i;

const RE_CLOSURE = /(buses (will )?replace|replacement buses|will not run|do not run|don't run|not run between|closure|closed|no (trains|services|light rail))/i;

export const CAUSES = [
  ['industrial', 'Industrial action', /industrial action|protected action|work bans?|union/i],
  ['emergency', 'Emergency or medical', /emergency services|medical|injur|fatal|person (hit|struck|on|in)|unwell|ambulance/i],
  ['security', 'Police, security or trespass', /police|security|trespass|vandal|suspicious|unattended|graffiti/i],
  ['weather', 'Weather or environment', /flood|storm|severe weather|weather|heat|lightning|fallen tree|tree (on|across)|bushfire|\bfire\b|landslip|wind|animal/i],
  ['vehicle', 'Train or tram fault', /freight train|(train|tram) (fault|failure|breakdown|repairs?)|repairs? to (a|the) (train|tram)|broken.?down|breakdown|mechanical|disabled (train|tram)|(tram|fleet|vehicle|train) availability|faulty (train|tram)|derail|issue with (a|the) (train|tram)/i],
  ['infrastructure', 'Track, signals or power', /signal|track|overhead|wiring|power|points|equipment|infrastructure|rail (break|fracture)|level crossing|bridge|repairs|network (issue|outage)|communication|system/i],
  ['operational', 'Operational', /operational|crew|staff(ing)?|driver/i],
];

export function causeOf(text) {
  for (const [id, , re] of CAUSES) if (re.test(text)) return id;
  return 'unknown';
}

export function tripSub(title) {
  const t = title.toLowerCase();
  if (/cancel/.test(t)) return 'cancelled';
  if (/late/.test(t)) return 'late';
  if (/not stopping|skip/.test(t)) return 'skipped';
  if (/now ending|terminat|starting from|start(s|ing)? at/.test(t)) return 'altered';
  if (/added stops/.test(t)) return 'added';
  return 'update';
}

function idScheme(id) {
  if (/^ems-/.test(id)) return 'editorial';
  return 'live';
}

function isOpenEnded(to) {
  if (!to) return true;
  const y = Number(String(to).slice(0, 4));
  return !(y > 1990 && y < 2400);
}

// Line-level alerts (not trackwork, not trip or station messages): incident, planned, advisory or notice.
// Also used by the site build to re-check stored records, so improvements here apply to all history.
export function classifyLineAlert({ editorial, title, text, finite }) {
  const all = `${title}\n${text}`;
  const incident = RE_INCIDENT.test(all);
  const advisoryTitle = RE_ADVISORY_TITLE.test(title);
  const plannedStrong = RE_PLANNED_STRONG.test(all);
  const closure = RE_CLOSURE.test(all);
  let kind, sub = null, cause = null;
  if (editorial) {
    if (incident && !plannedStrong && !advisoryTitle) kind = 'incident';
    else if (plannedStrong || (closure && finite)) kind = 'planned';
    else if (advisoryTitle) kind = 'advisory';
    else if (finite) kind = 'planned';
    else kind = 'notice';
  } else {
    if (advisoryTitle) kind = 'advisory';
    else if (incident) kind = 'incident';
    else if (plannedStrong) kind = 'planned';
    else kind = 'advisory';
  }
  if (kind === 'planned') {
    const extraOnly = /^(extra|additional|more)\b/i.test(title) && !RE_CLOSURE.test(title);
    sub = !extraOnly && (closure || /trackwork|maintenance/i.test(all)) ? 'closure' : 'change';
  }
  if (kind === 'incident') cause = causeOf(all);
  return { kind, sub, cause };
}

// Re-check a stored record with the current rules (trip, station and trackwork records are kept as they are).
export function reclassify(rec) {
  if (!['incident', 'planned', 'advisory', 'notice'].includes(rec.k) || rec.s === 'trackwork') return rec;
  // The tracker keeps the most serious classification seen while an alert was live, so check both the
  // first and the last title and keep the more serious result.
  const RANK = { incident: 3, planned: 2, advisory: 1, notice: 0 };
  const base = { editorial: /^ems-/.test(rec.id), text: rec.x || '', finite: !!rec.w?.some(w => w[1]) };
  const options = [...new Set([rec.t || '', rec.t0 || rec.t || ''])].map(title => classifyLineAlert({ ...base, title }));
  const best = options.sort((a, b) => RANK[b.kind] - RANK[a.kind])[0];
  const { kind, sub } = best;
  // An alert's wording often drops the cause as it is updated; keep the cause seen while it was live.
  let cause = best.cause;
  if (kind === 'incident' && (!cause || cause === 'unknown') && rec.c && rec.c !== 'unknown') cause = rec.c;
  if (kind === rec.k && (sub ?? undefined) === rec.s && (cause ?? undefined) === rec.c) return rec;
  const out = { ...rec, k: kind };
  if (sub) out.s = sub; else delete out.s;
  if (cause) out.c = cause; else delete out.c;
  return out;
}

export function normalizeInfo(x) {
  if (!x || !x.id) return null;
  const props = x.properties || {};
  const annType = String(props.announcementType || '').toLowerCase();
  if (annType === 'liftsescalators') return null;
  if (x.type === 'infrastructure') return null;
  if (x.priority === 'veryLow') return null;

  const lineIds = new Set();
  for (const l of x.affected?.lines || []) {
    const id = matchAffectedLine(l);
    if (id) lineIds.add(id);
  }
  if (!lineIds.size) return null;
  const lines = [...lineIds].sort((a, b) => lineOrder(a) - lineOrder(b) || a.localeCompare(b));

  const il = x.infoLinks?.[0] || {};
  const title = htmlToText(il.subtitle || x.subtitle || il.urlText || x.urlText || props.smsText || '');
  const text = htmlToText(il.content || x.content || props.speechText || '');
  const ts = x.timestamps || {};
  const windows = (ts.validity || [])
    .filter(v => v && v.from)
    .map(v => [v.from, isOpenEnded(v.to) ? null : v.to]);

  const scheme = idScheme(String(x.id));
  let kind, sub = null, cause = null;

  if (x.type === 'tripMessage') {
    kind = 'trip';
    sub = tripSub(title);
  } else if (annType === 'trackwork') {
    kind = 'planned';
    sub = 'trackwork';
  } else if (x.type === 'stopInfo' || x.type === 'stopBlocking') {
    kind = 'station';
  } else {
    const finite = windows.some(w => w[1]);
    ({ kind, sub, cause } = classifyLineAlert({ editorial: scheme === 'editorial', title, text, finite }));
  }

  const rec = {
    id: String(x.id),
    k: kind,
    l: lines,
    t: truncate(title, 160),
    x: kind === 'trip' ? '' : truncate(text, kind === 'station' ? 300 : 900),
    cr: ts.creation || null,
    m: ts.lastModification || ts.creation || null,
  };
  if (kind === 'trip') delete rec.x; // trip messages are only counted, never displayed
  if (sub) rec.s = sub;
  if (cause) rec.c = cause;
  if (kind === 'planned' && windows.length) rec.w = windows.slice(0, 60);
  if (x.priority && x.priority !== 'normal') rec.p = x.priority;
  return rec;
}
