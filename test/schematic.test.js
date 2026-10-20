import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchematic, corridorPath, diagramSections, labelSide, LINE_ROUTES, terminalCallouts, SCHEMATIC_VIEWS, DIAGRAM_LAYOUT_VERSION, NODES, octilinearSegment, offsetLine, pointAt, polyLen, trainPlacer } from '../src/lib/schematic.js';

const S = buildSchematic();
const near = (a, b, eps = 0.011) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;

test('the diagram is laid out on straight lines at 45° steps, joined up at every station', () => {
  for (const [k, e] of S.lay.edges) {
    assert.ok(near(e.pts[0], S.lay.pos.get(e.a)) && near(e.pts[e.pts.length - 1], S.lay.pos.get(e.b)), `${k} ends at its stations`);
    for (let i = 1; i < e.pts.length; i++) {
      const dx = Math.abs(e.pts[i][0] - e.pts[i - 1][0]), dy = Math.abs(e.pts[i][1] - e.pts[i - 1][1]);
      assert.ok(dx < 0.02 || dy < 0.02 || Math.abs(dx - dy) < 0.03, `${k}: a stretch at 0°, 45° or 90°`);
    }
  }
  // No two stations on the same spot.
  const spots = new Set([...S.lay.pos.values()].map(p => p.join(',')));
  assert.equal(spots.size, S.lay.pos.size);
  // Every line's route runs through the corridors.
  for (const line of Object.keys(LINE_ROUTES)) assert.ok(S.seqs[line].every(s => s.length >= 2), line);
});

test('lines run through the right stations, side by side where they share track', () => {
  const t4 = S.seqs.T4;
  assert.deepEqual([t4[0][0], t4[0].at(-1)], ['Bondi Junction', 'Cronulla']);
  assert.ok(t4[0].includes('Central') && t4[0].includes('Sutherland'));
  assert.deepEqual(corridorPath(S.lay, 'Waterfall', 'Sutherland'), ['Waterfall', 'Heathcote', 'Engadine', 'Loftus', 'Sutherland']);
  assert.ok(S.seqs.M1[0].includes('Waterloo') && S.seqs.M1[0].includes('Gadigal'));
  // Six lines between Central and Redfern, in a fixed order across the bundle.
  assert.deepEqual(S.drawnOn.get(S.key('Central', 'Redfern')), ['T4', 'T8', 'T2', 'T3', 'T1', 'T9']);
  // Intercity trains use the suburban track, but are only drawn beyond it.
  assert.ok(S.usedBy.get(S.key('Hornsby', 'Asquith')).has('CCN'));
  assert.deepEqual(S.drawnOn.get(S.key('Hornsby', 'Asquith')), ['T1']);
  assert.deepEqual(S.drawnOn.get(S.key('Berowra', 'Cowan')), ['CCN']);
  // Side by side: each strand is a gap apart.
  const e = S.lay.edges.get(S.key('Central', 'Redfern'));
  const a = S.piece.get(`T4|${S.key('Central', 'Redfern')}`), b = S.piece.get(`T8|${S.key('Central', 'Redfern')}`);
  assert.equal(a.length, e.pts.length);
  assert.ok(Math.abs(Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]) - S.gap) < 0.02);
  assert.deepEqual(offsetLine([[0, 0], [2, 0]], 1), [[0, -1], [2, -1]]);
});

test('station markers and where names go', () => {
  assert.equal(S.marker.get('Central').lines, 6);
  assert.equal(S.marker.get('Central').ring, true);
  assert.equal(S.marker.get('Stanmore').lines, 4);
  assert.equal(S.marker.get('Stanmore').ring, false);
  assert.equal(S.marker.get('Kogarah').ring, false);
  assert.equal(S.marker.get('Chatswood').ring, true);
  assert.equal(labelSide(S, 'Stanmore'), 'ur');   // along a level stretch: slanted
  assert.equal(labelSide(S, 'Kogarah'), 'r');     // along an upright one: to the right
  assert.equal(labelSide(S, 'Redfern'), 'bl');    // set by hand
  assert.deepEqual(pointAt([[0, 0], [2, 0], [2, 2]], 3), [2, 1]);
  assert.equal(polyLen([[0, 0], [3, 4]]), 5);
});

test('trains go on their line, between the stations they are between', () => {
  // A made-up real world: each station 100 units (1 km) per diagram unit from where it is on the diagram.
  const real = n => S.lay.pos.get(n)?.map(v => v * 100);
  const place = trainPlacer(S, real);
  const [st, nt] = [real('Stanmore'), real('Newtown')];
  const k = S.key('Newtown', 'Stanmore');
  // Halfway along: halfway along that line's own strand, not the middle of the bundle.
  for (const line of ['T2', 'T3']) {
    const p = place(line, (st[0] + nt[0]) / 2, (st[1] + nt[1]) / 2);
    const piece = S.piece.get(`${line}|${k}`);
    assert.ok(near(p, pointAt(piece, polyLen(piece) / 2), 0.02), line);
  }
  assert.notDeepEqual(place('T2', st[0], st[1]), place('T3', st[0], st[1]));
  // Far from any stretch of its line: left off.
  assert.equal(place('T2', st[0], st[1] + 5000), null);
  assert.equal(place('XX', st[0], st[1]), null);
});

test('a section named in an alert is drawn on the affected lines only', () => {
  const sp = diagramSections(S, [['Waterfall', 'Sutherland']], ['T4', 'SCO']);
  assert.equal(sp.length, 4);                       // four stretches, each once
  const k = S.key('Loftus', 'Sutherland');
  assert.ok(sp.some(p => p === S.piece.get(`T4|${k}`)));
  // Between Central and Redfern only the T1 strand, not the whole bundle.
  const one = diagramSections(S, [['Central', 'Redfern']], ['T1']);
  assert.deepEqual(one, [S.piece.get(`T1|${S.key('Central', 'Redfern')}`)]);
  // A line not drawn there (an intercity line on suburban track): the corridor's middle.
  const ic = diagramSections(S, [['Hornsby', 'Asquith']], ['CCN']);
  assert.deepEqual(ic, [S.lay.edges.get(S.key('Hornsby', 'Asquith')).pts]);
  assert.deepEqual(diagramSections(S, [['Central', 'Nowhere']], ['T1']), []);
});

test('network diagram termini correspond to stations in the connected schematic', () => {
  const ends = terminalCallouts(S.lay);
  for (const [line, name, x, y] of ends) {
    assert.ok(S.seqs[line].some(route => route[0] === name || route.at(-1) === name || route.includes(name)), line + ' / ' + name);
    assert.deepEqual([x, y], S.lay.pos.get(name));
  }
  assert.ok(ends.some(e => e[0] === 'T4' && e[1] === 'Bondi Junction'));
  assert.ok(ends.some(e => e[0] === 'M1' && e[1] === 'Tallawong'));
});

test('Sydney 2024-style rail topology is evident from anchor orientation', () => {
  assert.equal(DIAGRAM_LAYOUT_VERSION, 2);
  const at = station => S.lay.pos.get(station);
  const before = (a, b) => assert.ok(at(a)[0] < at(b)[0], a + ' should be west of ' + b);
  const above = (a, b) => assert.ok(at(a)[1] < at(b)[1], a + ' should be north of ' + b);
  for (const [a, b] of [
    ['Emu Plains', 'Blacktown'], ['Blacktown', 'Parramatta'],
    ['Parramatta', 'Strathfield'], ['Strathfield', 'Central'],
    ['Tallawong', 'Epping'], ['Epping', 'Chatswood'],
    ['Lidcombe', 'Central'], ['Central', 'Bondi Junction'],
    ['Liverpool', 'Sydenham'], ['Sutherland', 'Cronulla'],
  ]) before(a, b);
  for (const [a, b] of [
    ['Berowra', 'Hornsby'], ['Hornsby', 'Chatswood'],
    ['Chatswood', 'Central'], ['Wynyard', 'Town Hall'],
    ['Circular Quay', 'Central'], ['Richmond', 'Blacktown'],
    ['Blacktown', 'Liverpool'], ['Central', 'Sydenham'],
    ['Sydenham', 'Sutherland'], ['Sutherland', 'Waterfall'],
    ['Glenfield', 'Campbelltown'], ['Campbelltown', 'Macarthur'],
  ]) above(a, b);
  assert.ok(at('Museum')[0] > at('Town Hall')[0], 'City Circle eastern return');
  assert.ok(at('International Airport')[0] > at('Wolli Creek')[0], 'Airport branch east of Wolli Creek');
  assert.ok(at('Regents Park')[1] > at('Lidcombe')[1], 'Regents Park branch south');
  assert.ok(at('Olympic Park')[1] < at('Lidcombe')[1], 'Olympic Park branch north');
  assert.ok(at('Glenfield')[0] > at('Leppington')[0], 'Leppington branch west');
  assert.deepEqual(octilinearSegment([0,0],[7,3]), [[0,0],[4,0],[7,3]]);
  assert.deepEqual(octilinearSegment([0,0],[3,7]), [[0,0],[0,4],[3,7]]);
});

test('City centre view is a bounded, more readable window on Sydney network', () => {
  const [x0, y0, x1, y1] = SCHEMATIC_VIEWS.city;
  const [sx0, sy0, sx1, sy1] = SCHEMATIC_VIEWS.sydney;
  assert.ok(x1 - x0 < (sx1 - sx0) / 2, 'City view should show less than half Sydney width');
  assert.ok(y1 - y0 < (sy1 - sy0) / 2, 'City view should show less than half Sydney height');
  const hubs = ['Central', 'Town Hall', 'Wynyard', 'Circular Quay', 'Martin Place',
    'Barangaroo', 'Victoria Cross', 'Crows Nest', 'Chatswood', 'Waterloo', 'Gadigal',
    'Sydenham', 'Bondi Junction'];
  for (const station of hubs) {
    const [x, y] = S.lay.pos.get(station);
    assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1, station + ' missing from City view');
  }
  for (const station of ['Richmond', 'Blacktown', 'Leppington', 'Macarthur', 'Berowra', 'Waterfall']) {
    const [x, y] = S.lay.pos.get(station);
    assert.ok(x < x0 || x > x1 || y < y0 || y > y1, station + ' should be outside CBD focus');
  }
  assert.ok(S.gap >= 0.28);
});
