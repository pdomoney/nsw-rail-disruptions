import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { publishSiteRelease } from '../src/lib/site-version.js';

const source = path.resolve('site');
const createOutput = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-release-'));
  fs.cpSync(source, dir, { recursive: true });
  return dir;
};

test('real site HTML refers to fingerprinted CSS and JS, including both imported modules', () => {
  const out = createOutput();
  try {
    const { release, stamped } = publishSiteRelease(source, out, { generatedAt: 10_000 });
    assert.match(release, /^[0-9a-f]{16}$/);
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(out, stamped['app.js']), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'data/site-version.json'), 'utf8'));
    assert.equal(manifest.release, release);
    assert.equal(manifest.generatedAt, new Date(10_000).toISOString());
    for (const asset of ['app.js', 'styles.css', 'patronage.css', 'station-patronage.css', 'map-enhancements.css', 'official-map.css', 'ux-refresh.css', 'favicon.svg', 'rail-mark.svg']) {
      assert.ok(html.includes(stamped[asset]), 'HTML must reference ' + stamped[asset]);
      assert.ok(fs.existsSync(path.join(out, stamped[asset])));
      assert.ok(!html.includes('="' + asset + '"'), 'HTML must not use stale ' + asset);
    }
    for (const asset of ['charts.js', 'patronage.js', 'station-patronage.js', 'geo-map.js', 'official-map.js']) {
      assert.ok(app.includes("from './" + stamped[asset] + "'"), 'App import must be versioned: ' + asset);
      assert.ok(fs.existsSync(path.join(out, stamped[asset])));
    }
    const official = fs.readFileSync(path.join(out, stamped['official-map.js']), 'utf8');
    assert.ok(official.includes("from './" + stamped['official-vector-stops.js'] + "'"),
      'TfNSW coordinate registry must be referenced by a hashed module filename');
    assert.ok(fs.existsSync(path.join(out, stamped['official-vector-stops.js'])));
    assert.ok(official.includes("from './" + stamped['metro-southwest.js'] + "'"),
      '2026 diagram still needs a hashed Metro position-screening module');
    assert.ok(fs.existsSync(path.join(out, stamped['metro-southwest.js'])));
    assert.ok(!app.includes("from './metro-southwest.js'"),
      'Retired opening banner must not keep an unnecessary app module dependency');
    assert.ok(official.includes("from './" + stamped['official-2026-alignment.js'] + "'"));
    assert.ok(fs.existsSync(path.join(out, stamped['official-2026-alignment.js'])));
    assert.ok(app.includes("const SITE_RELEASE = '" + release + "'"));
    assert.ok(!app.includes('__SITE_RELEASE__'));
    const syntax = spawnSync(process.execPath, ['--check', path.join(out, stamped['app.js'])], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  } finally { fs.rmSync(out, { force: true, recursive: true }); }
});

test('data publish timestamps must not change the site revision or stale asset names', () => {
  const first = createOutput();
  const second = createOutput();
  try {
    const a = publishSiteRelease(source, first, { generatedAt: 10_000 });
    const b = publishSiteRelease(source, second, { generatedAt: 55_000 });
    assert.equal(a.release, b.release);
    assert.deepEqual(a.stamped, b.stamped);
    const aHtml = fs.readFileSync(path.join(first, 'index.html'), 'utf8');
    const bHtml = fs.readFileSync(path.join(second, 'index.html'), 'utf8');
    assert.equal(aHtml, bHtml);
  } finally {
    fs.rmSync(first, { force: true, recursive: true });
    fs.rmSync(second, { force: true, recursive: true });
  }
});

test('changing a stylesheet produces new version and refreshes its HTML reference', () => {
  const modified = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-source-'));
  const original = createOutput();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-output-'));
  try {
    fs.cpSync(source, modified, { recursive: true });
    fs.cpSync(source, out, { recursive: true });
    const a = publishSiteRelease(source, original);
    fs.appendFileSync(path.join(modified, 'styles.css'), '\n/* new release */\n');
    const b = publishSiteRelease(modified, out);
    assert.notEqual(a.release, b.release);
    assert.notEqual(a.stamped['styles.css'], b.stamped['styles.css']);
    assert.notEqual(a.stamped['app.js'], b.stamped['app.js'], 'release-aware JS bytes must get a fresh filename');
    assert.ok(fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes(b.stamped['styles.css']));
  } finally {
    for (const dir of [modified, original, out]) fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('editing a child JavaScript module changes the published app filename and import', () => {
  for (const changed of ['charts.js', 'patronage.js', 'station-patronage.js', 'geo-map.js', 'official-map.js']) {
    const modified = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-module-source-'));
    const original = createOutput();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-module-build-'));
    try {
      fs.cpSync(source, modified, { recursive: true });
      fs.cpSync(source, out, { recursive: true });
      const a = publishSiteRelease(source, original);
      fs.appendFileSync(path.join(modified, changed), '\n// changed module\n');
      const b = publishSiteRelease(modified, out);
      const publishedApp = fs.readFileSync(path.join(out, b.stamped['app.js']), 'utf8');
      const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
      assert.notEqual(a.release, b.release, 'module change must change release: ' + changed);
      assert.notEqual(a.stamped[changed], b.stamped[changed], 'module URL must change: ' + changed);
      assert.notEqual(a.stamped['app.js'], b.stamped['app.js'], 'parent app URL must change: ' + changed);
      assert.ok(publishedApp.includes("from './" + b.stamped[changed] + "'"));
      assert.ok(html.includes('src="' + b.stamped['app.js'] + '"'));
      assert.ok(!html.includes(a.stamped['app.js']));
      const syntax = spawnSync(process.execPath, ['--check', path.join(out, b.stamped['app.js'])], { encoding: 'utf8' });
      assert.equal(syntax.status, 0, syntax.stderr);
    } finally {
      for (const dir of [modified, original, out]) fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});

test('incorrect static HTML references stop the build rather than silently publishing stale URLs', () => {
  const modified = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-source-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-output-'));
  try {
    fs.cpSync(source, modified, { recursive: true });
    fs.cpSync(source, out, { recursive: true });
    const html = path.join(modified, 'index.html');
    fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('src="app.js"', 'src="different.js"'));
    assert.throws(() => publishSiteRelease(modified, out), /exactly one.*src="app.js"/);
  } finally {
    fs.rmSync(modified, { force: true, recursive: true });
    fs.rmSync(out, { force: true, recursive: true });
  }
});

test('changing only the TfNSW station coordinate registry updates parent official map and app URLs',()=>{
  const modified=fs.mkdtempSync(path.join(os.tmpdir(),'nrd-coord-src-'));
  const first=createOutput();
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'nrd-coord-build-'));
  try {
    fs.cpSync(source,modified,{recursive:true});
    fs.cpSync(source,out,{recursive:true});
    const a=publishSiteRelease(source,first);
    fs.appendFileSync(path.join(modified,'official-vector-stops.js'),'\n// new validated station coordinate\n');
    const b=publishSiteRelease(modified,out);
    assert.notEqual(a.stamped['official-vector-stops.js'],b.stamped['official-vector-stops.js']);
    assert.notEqual(a.stamped['official-map.js'],b.stamped['official-map.js']);
    assert.notEqual(a.stamped['app.js'],b.stamped['app.js']);
    const parent=fs.readFileSync(path.join(out,b.stamped['official-map.js']),'utf8');
    const app=fs.readFileSync(path.join(out,b.stamped['app.js']),'utf8');
    assert.ok(parent.includes("from './"+b.stamped['official-vector-stops.js']+"'"));
    assert.ok(app.includes("from './"+b.stamped['official-map.js']+"'"));
  }finally{
    for(const dir of [modified,first,out])fs.rmSync(dir,{recursive:true,force:true});
  }
});


test('all locally referenced HTML CSS, JavaScript and SVG assets have fingerprinted URLs', () => {
  const out = createOutput();
  try {
    const { stamped } = publishSiteRelease(source, out, { generatedAt: 10_000 });
    const original = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const localRefs = [...original.matchAll(/(?:href|src)="([^"]+\.(?:css|js|svg))"/g)]
      .map(match => match[1]);
    const appFiles = [...new Set(localRefs)];
    assert.ok(appFiles.includes('ux-refresh.css'));
    assert.ok(appFiles.includes('favicon.svg'));
    assert.ok(appFiles.includes('rail-mark.svg'));
    for (const asset of appFiles) {
      assert.ok(stamped[asset], 'Missing fingerprint for public asset: ' + asset);
      assert.ok(html.includes('"' + stamped[asset] + '"'),
        'Generated HTML does not use fingerprinted URL for: ' + asset);
      assert.ok(!html.includes('="' + asset + '"'),
        'Generated HTML retains an unversioned cache-sensitive asset: ' + asset);
      const deployed = path.join(out, stamped[asset]);
      assert.ok(fs.existsSync(deployed), 'Published referenced file missing: ' + stamped[asset]);
    }
  } finally {
    fs.rmSync(out, { force: true, recursive: true });
  }
});

test('editing only the UX stylesheet or rail identity updates the shipped asset and HTML reference', () => {
  for (const changed of ['ux-refresh.css', 'favicon.svg', 'rail-mark.svg']) {
    const modified = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-public-asset-source-'));
    const baseline = createOutput();
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'nrd-public-asset-output-'));
    try {
      fs.cpSync(source, modified, { recursive: true });
      fs.cpSync(source, output, { recursive: true });
      const before = publishSiteRelease(source, baseline, { generatedAt: 10_000 });
      fs.appendFileSync(path.join(modified, changed), changed.endsWith('.css') ? '\n/* update */\n' : '\n<!-- update -->\n');
      const after = publishSiteRelease(modified, output, { generatedAt: 10_000 });
      const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
      assert.notEqual(before.release, after.release, 'Release must change for ' + changed);
      assert.notEqual(before.stamped[changed], after.stamped[changed],
        'Cache-safe asset path must change for ' + changed);
      assert.ok(html.includes(after.stamped[changed]),
        'HTML must load the latest ' + changed);
      assert.ok(!html.includes('="' + changed + '"'),
        'HTML must not load the stale unversioned ' + changed);
      assert.equal(fs.readFileSync(path.join(output, after.stamped[changed]), 'utf8'),
        fs.readFileSync(path.join(modified, changed), 'utf8'),
        'Published artifact bytes must match source: ' + changed);
    } finally {
      for (const dir of [modified, baseline, output])
        fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});
