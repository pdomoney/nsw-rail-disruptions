// Canonical list of lines tracked by the site.
// `id` is the stable key used everywhere in the data files.
// Colours approximate the line colours used on NSW network maps; they are only used for small badges.

export const MODES = {
  train: { label: 'Sydney Trains', order: 1 },
  intercity: { label: 'Intercity', order: 2 },
  metro: { label: 'Metro', order: 3 },
  lightrail: { label: 'Light rail', order: 4 },
};

export const LINES = [
  { id: 'T1', mode: 'train', name: 'North Shore & Western Line', color: '#F99D1C' },
  { id: 'T2', mode: 'train', name: 'Leppington & Inner West Line', color: '#0098CD' },
  { id: 'T3', mode: 'train', name: 'Liverpool & Inner West Line', color: '#F37021',
    note: 'Before September 2024, T3 was the Bankstown Line. Alerts from that period are kept under T3.' },
  { id: 'T4', mode: 'train', name: 'Eastern Suburbs & Illawarra Line', color: '#005AA3' },
  { id: 'T5', mode: 'train', name: 'Cumberland Line', color: '#C4258F' },
  { id: 'T6', mode: 'train', name: 'Lidcombe & Bankstown Line', color: '#7D3F21',
    note: 'T6 began in September 2024, when the Bankstown Line was cut back for metro conversion.' },
  { id: 'T7', mode: 'train', name: 'Olympic Park Line', color: '#6F818E' },
  { id: 'T8', mode: 'train', name: 'Airport & South Line', color: '#00954C' },
  { id: 'T9', mode: 'train', name: 'Northern Line', color: '#D11F2F' },
  { id: 'BMT', mode: 'intercity', name: 'Blue Mountains Line', color: '#F99D1C' },
  { id: 'CCN', mode: 'intercity', name: 'Central Coast & Newcastle Line', color: '#D11F2F' },
  { id: 'HUN', mode: 'intercity', name: 'Hunter Line', color: '#833134' },
  { id: 'SCO', mode: 'intercity', name: 'South Coast Line', color: '#005AA3' },
  { id: 'SHL', mode: 'intercity', name: 'Southern Highlands Line', color: '#00954C' },
  { id: 'M1', mode: 'metro', name: 'Metro North West & Bankstown Line', color: '#168388',
    note: 'Known as the Metro North West Line before the City section opened in August 2024.' },
  { id: 'L1', mode: 'lightrail', name: 'Dulwich Hill Line', color: '#BE1622' },
  { id: 'L2', mode: 'lightrail', name: 'Randwick Line', color: '#DD1E25' },
  { id: 'L3', mode: 'lightrail', name: 'Kingsford Line', color: '#781140' },
  { id: 'L4', mode: 'lightrail', name: 'Westmead & Carlingford Line', color: '#BB2043' },
  { id: 'NLR', mode: 'lightrail', name: 'Newcastle Light Rail', color: '#EE343F' },
];

export const LINE_BY_ID = Object.fromEntries(LINES.map(l => [l.id, l]));

// Punctuality thresholds used by TfNSW: 5 minutes for suburban/metro/light rail, 6 for intercity.
export function lateThresholdSeconds(lineId) {
  return LINE_BY_ID[lineId]?.mode === 'intercity' ? 360 : 300;
}

// Display order: by mode, then by the order above.
export function lineOrder(id) {
  const i = LINES.findIndex(l => l.id === id);
  return i === -1 ? 999 : i;
}

// Lines that are not in the list above but show up in the data (for example a new metro line)
// are created on the fly with a neutral colour.
export function dynamicLine(id, mode, name) {
  return { id, mode, name: name || id, color: '#7A7A7A', dynamic: true };
}
