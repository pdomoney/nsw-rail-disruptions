import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { project } from '../src/lib/netmap.js';
import { build2026PdfAlignment } from '../site/official-2026-alignment.js';
import { drawOfficialOverlay } from '../site/official-map.js';

// Tiny synthetic SVG host: inspect the real overlay function, not a copied model.
function element(tag) {
  return {
    tag, attrs: {}, children: [],
    setAttribute(key, value) { this.attrs[key] = String(value); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    addEventListener() {},
  };
}
function countMovingIcons(root) {
  return (root.attrs?.class === 'official-vehicle' ? 1 : 0)
    + (root.children || []).reduce((sum, child) => sum + countMovingIcons(child), 0);
}
function fixture() {
  const a = project(-33.96613, 151.08939);
  const b = project(-33.97059, 151.08129);
  const network = { stations: [
    ['Penshurst Station', ...a, 'T4 SCO', 1],
    ['Mortdale Station', ...b, 'T4 SCO', 1],
  ] };
  const edge = build2026PdfAlignment(network).T4
    .find(item => item.from === 'Penshurst' && item.to === 'Mortdale');
  assert.ok(edge, 'existing approved T4 station pair must remain eligible');
  const midpoint = edge.geoA.map((value, i) => Math.round((value + edge.geoB[i]) / 2));
  const live = { trains: [
    ['T4', ...midpoint, 60, null, null, null, 'Cronulla'], // verified printed pair
    ['T4', 90000, 90000, 0, null, null, null, 'Cronulla'], // no valid pair
    ['HUN', 90000, 90000, 0, null, null, null, 'Newcastle'], // outside PDF
    ['L1', 90000, 90000, 0, null, null, null, 'Dulwich Hill'], // outside PDF
  ], overlays: [] };
  return { network, live };
}
function render(network, live, lineFilter = '') {
  const prior = globalThis.document;
  globalThis.document = { createElementNS: (_namespace, tag) => element(tag) };
  try {
    const host = { clientWidth: 900, children: [],
      replaceChildren(...children) { this.children = children; } };
    const result = drawOfficialOverlay(host, { network, live, lineFilter });
    return { result, movingIcons: countMovingIcons(host.children[0]) };
  } finally {
    globalThis.document = prior;
  }
}

test('unfiltered PDF diagram reconciles printed, unmatched, and outside-scope services', () => {
  const { network, live } = fixture();
  const { result, movingIcons } = render(network, live);
  assert.equal(result.positioned, 1);
  assert.equal(result.unmatched, 1);
  assert.equal(result.outsideDiagram, 2);
  assert.equal(result.positioned + result.unmatched + result.outsideDiagram,
    live.trains.length);
  assert.equal(movingIcons, 1, 'outside lines must never get invented PDF markers');
});

test('line selection counts only the selected service without inventing an icon', () => {
  const { network, live } = fixture();
  const t4 = render(network, live, 'T4');
  assert.deepEqual([t4.result.positioned, t4.result.unmatched,
    t4.result.outsideDiagram, t4.movingIcons], [1, 1, 0, 1]);
  const hunter = render(network, live, 'HUN');
  assert.deepEqual([hunter.result.positioned, hunter.result.unmatched,
    hunter.result.outsideDiagram, hunter.movingIcons], [0, 0, 1, 0]);
  const m1 = render(network, live, 'M1');
  assert.deepEqual([m1.result.positioned, m1.result.unmatched,
    m1.result.outsideDiagram, m1.movingIcons], [0, 0, 0, 0]);
});

test('empty feed stays empty and the application displays both omission reasons', () => {
  const { network } = fixture();
  const empty = render(network, { trains: [], overlays: [] });
  assert.deepEqual([empty.result.positioned, empty.result.unmatched,
    empty.result.outsideDiagram, empty.movingIcons], [0, 0, 0, 0]);
  const app = fs.readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
  assert.match(app, /geo\\.unmatched\\+' omitted \\(no verified station pair\\)'/);
  assert.match(app, /geo\\.outsideDiagram\\+' omitted \\(line outside published diagram\\)'/);
});
