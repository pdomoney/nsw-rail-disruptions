// Matching of line references in the various TfNSW feeds to our canonical line ids.

const INTERCITY = [
  [/blue mountains/i, 'BMT'],
  [/central coast|newcastle line|newcastle & central coast/i, 'CCN'],
  [/hunter/i, 'HUN'],
  [/south coast/i, 'SCO'],
  [/southern highlands/i, 'SHL'],
];

const INTERCITY_CODES = { BMT: 'BMT', CCN: 'CCN', HUN: 'HUN', SCO: 'SCO', SHL: 'SHL' };

// Sydney Trains GTFS route_id prefixes (e.g. "NSN_1a"). Only used when the static timetable is unavailable.
const SYDNEY_TRAINS_CODES = { NSN: 'T1', WST: 'T1', NTH: 'T9', ESI: 'T4', APS: 'T8', CMB: 'T5', OLY: 'T7', IWL: 'T2' };

// Trip Planner add_info `affected.lines[]` entry → line id, or null when not tracked.
// product.class: 1 = train, 2 = metro, 4 = light rail (others are buses, coaches, ferries, ...).
export function matchAffectedLine(l) {
  if (!l) return null;
  const cls = l.product?.class;
  const number = String(l.number || '').trim();
  const name = String(l.name || '');
  const text = `${number} ${name}`;
  if (cls === 1) {
    if (/^\d/.test(number)) return null; // numbered NSW TrainLink regional services (and coaches)
    const t = number.match(/^T(\d)\b/);
    if (t) return 'T' + t[1];
    for (const [re, id] of INTERCITY) if (re.test(text)) return id;
    return null;
  }
  if (cls === 2) {
    const m = number.match(/^M(\d+)\b/);
    if (m) return 'M' + m[1];
    if (/north west/i.test(text)) return 'M1';
    return null;
  }
  if (cls === 4) {
    const m = number.match(/^L(\d+)\b/);
    if (m) return 'L' + m[1];
    if (/^NLR$/i.test(number) || /newcastle/i.test(text)) return 'NLR';
    return null; // e.g. "LX Special Event Services"
  }
  return null;
}

export function modeOfLineId(id) {
  if (/^T\d$/.test(id)) return 'train';
  if (INTERCITY_CODES[id]) return 'intercity';
  if (/^M\d+$/.test(id)) return 'metro';
  if (/^L\d+$/.test(id) || id === 'NLR') return 'lightrail';
  return null;
}

// Static GTFS routes.txt row → line id. `feedDefault` is used for single-line feeds
// (Inner West = L1, Parramatta = L4, Newcastle = NLR).
export function matchGtfsRoute(route, feedDefault = null) {
  const short = String(route.route_short_name || '').trim();
  const long = String(route.route_long_name || '');
  const desc = String(route.route_desc || '');
  const rid = String(route.route_id || '');
  let m;
  if ((m = short.match(/^T(\d)\b/))) return 'T' + m[1];
  if ((m = short.match(/^M(\d+)\b/))) return 'M' + m[1];
  if ((m = short.match(/^L(\d+)\b/))) return 'L' + m[1];
  if (/^NLR$/i.test(short)) return 'NLR';
  const code = short.toUpperCase();
  if (INTERCITY_CODES[code]) return INTERCITY_CODES[code];
  const ridPrefix = rid.split(/[_\-.\s]/)[0].toUpperCase();
  if (INTERCITY_CODES[ridPrefix]) return INTERCITY_CODES[ridPrefix];
  if ((m = ridPrefix.match(/^([TML])(\d+)$/))) return m[1] + m[2];
  if (!short && SYDNEY_TRAINS_CODES[ridPrefix]) return SYDNEY_TRAINS_CODES[ridPrefix];
  if (ridPrefix === 'NLR') return 'NLR';
  const text = `${short} ${long} ${desc}`;
  for (const [re, id] of INTERCITY) if (re.test(text)) return id;
  if ((m = text.match(/\bT(\d)\b/))) return 'T' + m[1];
  if (/metro north west/i.test(text)) return 'M1';
  if (/^LX\b/i.test(short) || /special event/i.test(text)) return null;
  return feedDefault;
}
