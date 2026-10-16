import test from 'node:test';
import assert from 'node:assert/strict';
import { simplify, edgesToChains, encodeChain, decodeChain, TrackBuilder } from '../src/lib/geo.js';

test('simplification keeps bends and drops points on a straight line', () => {
  const pts = [[-33.9, 151.0], [-33.9, 151.001], [-33.9, 151.002], [-33.89, 151.002]];
  assert.deepEqual(simplify(pts, 5), [[-33.9, 151.0], [-33.9, 151.002], [-33.89, 151.002]]);
});

test('edges join into chains at ends and junctions', () => {
  // A Y: a-b-c, and b-d.
  const chains = edgesToChains([['1,1', '2,2'], ['2,2', '3,3'], ['2,2', '4,4']]);
  assert.equal(chains.length, 3);
  assert.deepEqual(chains.flat().length, 6);
  // A loop.
  const loop = edgesToChains([['1,1', '2,2'], ['2,2', '3,3'], ['3,3', '1,1']]);
  assert.equal(loop.length, 1);
  assert.equal(loop[0].length, 4);
});

test('chains round-trip through the delta encoding', () => {
  const pts = [[-338832, 1512061], [-338800, 1511500], [-338730, 1510940]];
  assert.deepEqual(decodeChain(encodeChain(pts)), pts);
  const tb = new TrackBuilder();
  tb.add('T1', [[-33.8832, 151.2061], [-33.88, 151.15]]);
  tb.add('T1', [[-33.88, 151.15], [-33.8832, 151.2061]]); // same track the other way
  assert.equal(tb.chains().T1.length, 1);
});
