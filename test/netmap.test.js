import test from 'node:test';
import assert from 'node:assert/strict';
import { alertPlaces, affectedPlaces, stationKey, TrackGraph, project } from '../src/lib/netmap.js';

test('places named in alerts', () => {
  assert.deepEqual(alertPlaces('Buses replace trains between Waterfall, Cronulla and Hurstville').between, [['Waterfall', 'Cronulla', 'Hurstville']]);
  assert.deepEqual(alertPlaces('Buses replace trains between Olympic Park and Ashfield or Central').between, [['Olympic Park', 'Ashfield', 'Central']]);
  assert.deepEqual(alertPlaces('Buses replace Inner West trains between Strathfield and Central. Buses also replace some trains between Olympic Park and Central').between,
    [['Strathfield', 'Central'], ['Olympic Park', 'Central']]);
  assert.deepEqual(alertPlaces('Trains run between Blue Mountains Line stations and Blacktown only').between, []);
  assert.deepEqual(alertPlaces('Allow extra travel time due to an incident requiring emergency services at Town Hall earlier.').at, ['Town Hall']);
  assert.deepEqual(alertPlaces('Allow extra travel time due to heavy rain at Coalcliff.').at, ['Coalcliff']);
  assert.equal(stationKey('Bomaderry (Nowra) Station'), 'bomaderry');
  assert.equal(stationKey('Newcastle Interchange'), stationKey('Newcastle Interchange Station'));
});

test('sections are traced along the track, across lines and along long straights', () => {
  // A line west to east, and a second line branching south from its middle (sharing that point
  // within 40 m), all in 10 m units.
  const g = new TrackGraph({ A: [[[0, 0], [2000, 0]]], B: [[[1002, 3], [1000, 1500]]] });
  const west = g.nearest([0, 10], 60), east = g.nearest([2000, -10], 60);
  const p = g.path(west, east);
  assert.deepEqual(p[0], [0, 0]);
  assert.deepEqual(p[p.length - 1], [2000, 0]);
  // A station in the middle of the long straight is near a point added along it.
  assert.ok(g.nearest([500, 20], 30) >= 0);
  // From the west end onto the branch.
  const south = g.nearest([1000, 1500], 60, ['B']);
  const q = g.path(west, south);
  assert.ok(q && q.length > 2);
  assert.deepEqual(q[q.length - 1], [1000, 1500]);
  // Preferring a line: a point between both tracks snaps to line B's when asked.
  assert.ok(g.lines[g.nearest([1001, 40], 60, ['B'])].has('B'));
  assert.deepEqual(project(-33.87, 151.0), [0, 0]);
});

test('only the closed or disrupted sections are traced, not where trains still run', () => {
  // T4, 17 October 2026: only Waterfall to Sutherland was closed, but the second sentence names the
  // rest of the line, which had trains.
  const t4 = 'Buses replace trains between Waterfall and Sutherland.\nFrom 3am to 11.30am, buses replace trains between Waterfall and Sutherland.\n'
    + 'Trains run to a changed timetable between Cronulla, Sutherland and Bondi Junction.\nPlan your trip before you travel.';
  assert.deepEqual(affectedPlaces(t4, 'closed'), { between: [['Waterfall', 'Sutherland']], at: [] });
  const city = 'City Circle: Trains do not run on the City Circle, or between Central and Wynyard.\nL2 and L3 light rail services run between Central and Circular Quay.\n'
    + 'Extra trains run between Hurstville and Bondi Junction.\nMetro services also run between Sydenham, the City and Tallawong.';
  assert.deepEqual(affectedPlaces(city, 'closed').between, [['Central', 'Wynyard']]);
  assert.deepEqual(affectedPlaces('T8 trains do not run between Sydenham and the City.', 'closed').between, [['Sydenham', 'Central']]);
  assert.deepEqual(affectedPlaces('Buses replace trains between Central and Bondi Junction. Trains do not stop at Wolli Creek', 'closed'),
    { between: [['Central', 'Bondi Junction']], at: ['Wolli Creek'] });
  assert.deepEqual(affectedPlaces('Light rail services will not run between Westmead and Parramatta Square.\nLight rail services will continue to run between Parramatta Square and Carlingford.', 'closed').between,
    [['Westmead', 'Parramatta Square']]);
  // Incidents: keep the disruption, drop where trains are still running.
  assert.deepEqual(affectedPlaces('Trains are not running between Blacktown and Richmond due to a signal fault at Riverstone. Trains are running between Central and Blacktown.', 'incident'),
    { between: [['Blacktown', 'Richmond']], at: ['Riverstone'] });
  assert.deepEqual(affectedPlaces('Allow extra travel time between Hornsby and Berowra due to a track fault.', 'incident').between, [['Hornsby', 'Berowra']]);
});
