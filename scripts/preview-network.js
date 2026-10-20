// Create reviewable SVG proof of the actual network layout and route geometry.
// This is a CI-only preview, not a substitute for on-device interactive QA.
import fs from 'node:fs';
import path from 'node:path';
import { buildSchematic, SCHEMATIC_VIEWS, DIAGRAM_LAYOUT_VERSION, terminalCallouts } from '../src/lib/schematic.js';
import { LINE_BY_ID } from '../src/config/lines.js';

const S = buildSchematic();
const output = process.env.PREVIEW_DIR || 'test-artifacts';
fs.mkdirSync(output, { recursive: true });
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mainLines = new Set(['T1','T2','T3','T4','T5','T6','T7','T8','T9','M1']);
const labels = new Set(['Tallawong','Epping','Chatswood','Gordon','Hornsby','Berowra',
 'Richmond','Emu Plains','Blacktown','Parramatta','Lidcombe','Olympic Park','Strathfield',
 'Central','Town Hall','Wynyard','Circular Quay','Martin Place','Gadigal','Crows Nest',
 'Barangaroo','Victoria Cross','Redfern','Sydenham','Wolli Creek','International Airport',
 'Bondi Junction','Bankstown','Liverpool','Glenfield','Leppington','Campbelltown',
 'Macarthur','Hurstville','Sutherland','Cronulla','Waterfall']);

for (const view of ['sydney','city']) {
 const [left, top, right, bottom] = SCHEMATIC_VIEWS[view], width = right - left, height = bottom - top;
 const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
    [left - 3, top - 4, width + 6, height + 8].join(' ') + '" width="1100" height="' +
    Math.round(1100 * (height + 8) / (width + 6)) + '">',
  '<title>Sydney rail schematic layout v' + DIAGRAM_LAYOUT_VERSION + ', ' + view + ' view</title>',
  '<rect x="' + (left - 4) + '" y="' + (top - 5) + '" width="' + (width + 8) +
    '" height="' + (height + 10) + '" fill="#f4f7f8"/>',
 ];
 for (const [id, pieces] of Object.entries(S.pieces)) {
   if (!mainLines.has(id)) continue;
   const color = LINE_BY_ID[id]?.color || '#596b77';
   for (const pts of pieces) {
     const d = 'M' + pts.map(([x,y]) => x + ',' + y).join(' L');
     svg.push('<path d="' + d + '" fill="none" stroke="' + escape(color) +
      '" stroke-width=".3" stroke-linejoin="round" stroke-linecap="round"/>');
   }
 }
 for (const [name, [x,y]] of S.lay.pos) {
   if (x < left || x > right || y < top || y > bottom) continue;
   const m = S.marker.get(name);
   const r = m.ring ? .48 : .22;
   svg.push('<circle cx="' + x + '" cy="' + y + '" r="' + r +
      '" stroke="#273f4b" stroke-width=".13" fill="white"/>');
   if (labels.has(name)) svg.push('<text x="' + (x + .6) + '" y="' + (y - .5) +
    '" font-family="Arial,sans-serif" font-weight="600" font-size="1.4" fill="#243a49" stroke="#f4f7f8" stroke-width=".2" paint-order="stroke">' +
      escape(name) + '</text>');
 }
 for (const [line, name, x, y] of terminalCallouts(S.lay)) {
   if (x < left || x > right || y < top || y > bottom) continue;
   const c = LINE_BY_ID[line]?.color || '#365c70';
   svg.push('<g><rect x="' + (x-1.5) + '" y="' + (y-2.9) +
    '" rx=".4" width="3" height="1.75" fill="' + escape(c) +
    '"/><text x="' + x + '" y="' + (y-1.6) +
    '" font-size="1.2" font-family="Arial,sans-serif" font-weight="700" fill="white" text-anchor="middle">' +
    escape(line) + '</text></g>');
 }
 svg.push('</svg>');
 fs.writeFileSync(path.join(output, 'network-schematic-' + view + '-v' +
   DIAGRAM_LAYOUT_VERSION + '.svg'), svg.join('\n'));
}
