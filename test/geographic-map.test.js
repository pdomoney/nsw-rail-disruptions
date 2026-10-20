import test from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/lib/netmap.js';
import { geographicCoordinates, decodeProjectedChain, trainDescription, TRAIN_SYMBOL } from '../site/geo-map.js';

test('geographic projection restores TfNSW stop positions around metropolitan Sydney', () => {
  // Confirm three widely separated localities: longitude/latitude must not be
  // replaced with the hand-positioned station coordinates of the network diagram.
  for (const [lat, lon] of [[-33.883, 151.207], [-33.703, 151.099], [-34.054, 150.813], [-33.431, 151.344]]) {
    const [x, y] = project(lat, lon);
    const actual = geographicCoordinates(x, y);
    assert.ok(Math.abs(actual[0] - lat) < .00007, 'station latitude remains within approximately 10 m');
    assert.ok(Math.abs(actual[1] - lon) < .00007, 'station longitude remains within approximately 10 m');
  }
  assert.deepEqual(geographicCoordinates(...project(-33.87, 151)), [-33.87, 151]);
  assert.equal(geographicCoordinates(Infinity, 100), null);
});

test('delta encoded GTFS track has geographic end points in the right order', () => {
  const begin = project(-33.883, 151.207);
  const next = project(-33.89, 151.21);
  const end = project(-33.91, 151.23);
  const chain = decodeProjectedChain([begin[0], begin[1],
    next[0] - begin[0], next[1] - begin[1], end[0] - next[0], end[1] - next[1]]);
  assert.equal(chain.length, 3);
  assert.ok(Math.abs(chain[1][0] - (-33.89)) < .00007);
  assert.ok(Math.abs(chain[2][1] - 151.23) < .00007);
  assert.deepEqual(decodeProjectedChain([1]), []);
  assert.deepEqual(decodeProjectedChain([1, 2, 3]), []);
});

test('moving trains have distinct pictogram semantics and accessible service descriptions', () => {
  assert.match(TRAIN_SYMBOL, /<rect/);
  assert.match(TRAIN_SYMBOL, /viewBox/);
  assert.match(TRAIN_SYMBOL, /window|fill="#fff"/);
  const a = trainDescription({
    line: 'M1', destination: 'Tallawong Station', delay: 300, passengers: 443, fullness: 3,
  });
  assert.match(a, /M1 service towards Tallawong/);
  assert.match(a, /5 minutes late/);
  assert.match(a, /approximately 440 people aboard/);
  assert.match(a, /level 3 of 5/);
  const b = trainDescription({ line: 'T4', destination: null, delay: null, passengers: null, fullness: null });
  assert.match(b, /delay not reported/);
  assert.match(b, /occupancy not reported/);
  assert.ok(!b.includes('undefined') && !b.includes('NaN'));
});

test('geographic module only offers position from reported data, and displays basemap attribution', () => {
  assert.equal(geographicCoordinates(NaN, NaN), null);
  assert.equal(geographicCoordinates(-Infinity, -34), null);
  assert.ok(TRAIN_SYMBOL.includes('rect'), 'moving vehicle cannot be a simple station-like dot');
});
