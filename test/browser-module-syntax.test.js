import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The static site is written as browser ES modules. Earlier tests only imported
// isolated helpers, so a malformed bracket in app.js was not caught in CI.
// Node --check parses each entire module without running browser-only code.
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const siteDir=path.join(root,'site');

test('every browser JavaScript module parses before GitHub Pages publishes',()=>{
  const modules=fs.readdirSync(siteDir)
    .filter(name=>name.endsWith('.js'))
    .sort();
  assert.ok(modules.includes('app.js'),
    'The main browser entrypoint must be included in this check');
  assert.ok(modules.includes('official-map.js'),
    'The protected map renderer must be included in this check');
  for(const name of modules){
    const file=path.join(siteDir,name);
    const result=spawnSync(process.execPath,['--check',file],{
      cwd:root,encoding:'utf8',timeout:20000,
    });
    assert.equal(result.error,undefined,name+' syntax check could not run');
    assert.equal(result.status,0,name+' is not valid JavaScript:\n'+
      (result.stderr||result.stdout));
  }
});
