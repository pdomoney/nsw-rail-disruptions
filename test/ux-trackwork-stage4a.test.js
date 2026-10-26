import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site/ux-refresh.css',import.meta.url),'utf8');
const start=app.indexOf('async function viewTrackwork(main) {');
const end=app.indexOf("// Line page: this line's planned trackwork.",start);
assert.ok(start>0 && end>start);
const view=app.slice(start,end);

test('Trackwork places published today/weekend summaries before searchable notice groups',()=>{
  assert.match(view,/class: 'tw-summary'/);
  assert.match(view,/summaryCard\('Today and tonight'/);
  assert.match(view,/summaryCard\('This weekend'/);
  assert.match(view,/summaryCard\('Published schedule'/);
  assert.match(view,/class: 'section tw-list-section'/);
  assert.match(view,/h\('h2', \{ id: 'tw-list-h' \}, 'Upcoming changes'\)/);
  assert.ok(view.indexOf('summary,')<view.indexOf('filterBar, list'),
    'Headline cards appear ahead of detailed notices');
  assert.ok(view.indexOf('filterBar, list')<view.indexOf('timeline,'),
    'Detailed timeline is below the actionable notice list');
});

test('Trackwork never claims that an absent published notice means no actual work',()=>{
  assert.match(view,/No major work listed/);
  assert.match(view,/No major planned changes in the published alerts/);
  assert.match(view,/No closures listed/);
  assert.match(view,/The current feed does not include the next complete weekend/);
  assert.match(view,/This page only shows planned notices in the available TfNSW data/);
  assert.match(view,/Notices can change/);
  assert.doesNotMatch(view,/There is no trackwork on the network/);
});

test('single rail-line filter scopes notice cards and updates permalink in place',()=>{
  assert.match(view,/new URLSearchParams\(location\.hash\.split\('\?'\)\[1\] \|\| ''\)/);
  assert.match(view,/lines\.includes\(q\.get\('line'\)\)/);
  assert.match(view,/const visibleItems = \(\) => items\.filter\(it => !lineFilter \|\| it\.l\.includes\(lineFilter\)\)/);
  assert.match(view,/const lineSelect = h\('select'/);
  assert.match(view,/const setLine = value =>/);
  assert.match(view,/lineSelect\.value = value/);
  assert.match(view,/encodeURIComponent\(value\)/);
  assert.match(view,/history\.replaceState\(null, '', '#\/trackwork'/);
  assert.match(view,/updateSummary\(\);\s*drawList\(\);\s*drawChart\(\)/);
  assert.match(view,/list\.replaceChildren\(\.\.\.trackworkGroups\(shown, tw\.days\)\)/);
});

test('historical week-by-week details, legend, drilldown and keyboard support remain available',()=>{
  assert.match(view,/class: 'tw-timeline-disclosure'/);
  assert.match(view,/h\('summary', \{\}/);
  assert.match(view,/const drawChart = \(\) => \{/);
  assert.match(view,/if \(!timeline\.open \|\| !timeline\.isConnected\) return/);
  assert.match(view,/timeline\.addEventListener\('toggle'/);
  assert.match(view,/requestAnimationFrame\(drawChart\)/);
  assert.match(view,/onResize\(drawChart\)/);
  assert.match(view,/trackworkChart\(chart, \{ items, lines, days: tw\.days, selected: lineFilter/);
  assert.match(app,/blk\.addEventListener\('keydown', ev =>/);
  assert.match(app,/scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(app,/function trackworkGroups\(items, days\)/);
  assert.match(app,/function trackworkItem\(it\)/);
  assert.match(app,/TW_SEV\[it\.sev\]/);
  assert.match(app,/transportnsw\.info\/alerts\/details/);
});

test('Trackwork has responsive cards and high-visibility accessible controls',()=>{
  assert.match(css,/\.tw-summary \{/);
  assert.match(css,/\.tw-summary-card \{/);
  assert.match(css,/\.tw-line-field select \{width:100%;min-height:44px\}/);
  assert.match(css,/\.tw-timeline-disclosure>summary:focus-visible/);
  assert.match(css,/@media \(max-width:640px\)\{/);
  assert.match(css,/\.tw-items \{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(view,/aria-label': 'Published trackwork at a glance'/);
  assert.match(view,/aria-label': 'Show planned trackwork for rail line'/);
  assert.match(view,/class: 'tw-filter-context', role: 'status'/);
});

test('Trackwork does not require changes to verified maps or historical data',()=>{
  assert.match(view,/await loadTrackwork\(\)/);
  assert.match(view,/pageRefresh = async \(\) =>/);
  assert.match(app,/drawOfficialOverlay\(holder,/);
  assert.match(app,/viewStationPatronage\(main, D\.meta\)/);
  assert.match(app,/viewService\(main\)/);
});
