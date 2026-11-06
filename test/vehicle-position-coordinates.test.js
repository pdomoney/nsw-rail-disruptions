import test from 'node:test';
import assert from 'node:assert/strict';
import { vehiclePositions } from '../src/lib/gtfs-rt.js';
import { project } from '../src/lib/netmap.js';
import { geographicCoordinates } from '../site/geo-map.js';

const vehicle = (tripId, lat, lon) => ({
  vehicle: {
    trip: { tripId, routeId: 'T4' },
    position: { lat, lon, bearing: 90 },
    consist: [{ position: 1, occupancy: 2 }],
  },
});

test('valid NSW vehicle observations retain trip and occupancy data for geographic mapping', () => {
  const rows = vehiclePositions({ entity: [
    vehicle('T4-1', -33.8832, 151.2061),
    vehicle('SCO-1', -34.00427, 151.068),
  ] });
  assert.deepEqual(rows.map(row => row.tripId), ['T4-1', 'SCO-1']);
  assert.equal(rows[0].routeId, 'T4');
  assert.equal(rows[0].bearing, 90);
  assert.equal(rows[0].cars, 1);
  assert.deepEqual(rows[0].levels, [2]);
  for (const row of rows) {
    const [lat, lon] = geographicCoordinates(...project(row.lat, row.lon));
    assert.ok(Math.abs(lat - row.lat) < 0.00007);
    assert.ok(Math.abs(lon - row.lon) < 0.00007);
  }
});

test('impossible or non-finite geographic coordinates never enter the published vehicle path', () => {
  const rows = vehiclePositions({ entity: [
    vehicle('valid', -33.8832, 151.2061),
    vehicle('invalid-north', 91, 151.2),
    vehicle('invalid-south', -91, 151.2),
    vehicle('invalid-east', -33.88, 181),
    vehicle('invalid-west', -33.88, -181),
    vehicle('nonfinite-lat', Infinity, 151.2),
    vehicle('nonfinite-lon', -33.88, NaN),
    vehicle('missing-lat', undefined, 151.2),
  ] });
  assert.deepEqual(rows.map(row => row.tripId), ['valid']);
});
