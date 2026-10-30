import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyOfficialMap } from '../scripts/verify-official-map.mjs';

// A real 1x1 PNG exercises the file format checks without requiring the TfNSW
// PDF or network access inside unit tests. CI separately verifies the actual PDF.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xz00AAAAASUVORK5CYII=',
  'base64'
);
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-map-png-'));
  try { fn(path.join(dir, 'map.png')); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const onePixel = { width: 1, minHeight: 1, maxHeight: 1, minBytes: 50 };

test('production publication rejects a missing official map instead of silently deploying', () => {
  fixture(file => assert.throws(() => verifyOfficialMap(file), /Missing official TfNSW map/));
});

test('official map verification accepts a valid, calibrated PNG structure', () => {
  fixture(file => {
    fs.writeFileSync(file, png);
    assert.deepEqual(verifyOfficialMap(file, onePixel),
      { width: 1, height: 1, bytes: png.length });
  });
});

test('reject HTML, empty files, truncated PNGs and mismatched map geometry', () => {
  fixture(file => {
    fs.writeFileSync(file, '<html>Not Found</html>');
    assert.throws(() => verifyOfficialMap(file, onePixel), /suspiciously small/);
    fs.writeFileSync(file, Buffer.alloc(80));
    assert.throws(() => verifyOfficialMap(file, onePixel), /not a complete PNG/);
    fs.writeFileSync(file, png.subarray(0, png.length - 12));
    assert.throws(() => verifyOfficialMap(file, onePixel), /IEND/);
    fs.writeFileSync(file, png);
    assert.throws(() => verifyOfficialMap(file), /suspiciously small/);
    assert.throws(() => verifyOfficialMap(file, { ...onePixel, width: 2048 }), /dimensions differ/);
  });
});

test('Pages publisher cannot report success if the official PDF map fails to render', () => {
  const workflow = fs.readFileSync(path.resolve('.github/workflows/collect.yml'), 'utf8');
  assert.match(workflow, /Install PDF renderer on first official-map publish/);
  assert.match(workflow, /sudo apt-get -y -qq install poppler-utils/);
  assert.match(workflow, /Publish and verify the original TfNSW map image/);
  assert.match(workflow, /node scripts\/verify-official-map\.mjs dist\/assets\/tfnsw-sydney-rail-2026\.png/);
  assert.doesNotMatch(workflow, /TfNSW PDF background could not be verified\. The app will fall back/);
});
