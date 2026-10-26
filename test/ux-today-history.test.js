import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site/ux-refresh.css',import.meta.url),'utf8');
const slice=(start,end)=>{
  const i=src.indexOf(start);
  const j=src.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'Expected source segment '+start+' to '+end);
  return src.slice(i,j);
};

test('Today displays immediate alerts, actions and line status without duplicate historical dashboards',()=>{
  const overview=slice('function viewOverview(main) {','// ---------- delay clock ----------');
  assert.match(overview,/nowSection\(head, sub, stale\)/);
  assert.match(overview,/const shortcuts=h\('nav', \{ class:'today-shortcuts'/);
  assert.match(overview,/const historical=h\('aside', \{ class:'today-history-link'/);
  assert.match(overview,/board,/);
  for(const url of ['#/map','#/trackwork','#/trip','#/log'])
    assert.ok(overview.includes("href:'"+url+"'"),'Missing useful action: '+url);
  assert.doesNotMatch(overview,/calendarSection\(\)/);
  assert.doesNotMatch(overview,/rankingSection\(\)/);
  assert.ok(overview.indexOf('nowSection(head, sub, stale)')<
    overview.indexOf('shortcuts,')&&overview.indexOf('shortcuts,')<
    overview.indexOf('board,'));
});

test('historical charts are lazy-loaded in a discoverable native disclosure on the History page',()=>{
  const log=slice('async function viewLog(main) {','// ----- about -----');
  assert.match(log,/class:'history-trends'/);
  assert.match(log,/h\('summary', \{\}, 'Disruption calendar and comparisons'\)/);
  assert.match(log,/trendChartsMounted=false/);
  assert.match(log,/trends\.addEventListener\('toggle',/);
  assert.match(log,/!trends\.open \|\| trendChartsMounted \|\| !trends\.isConnected/);
  assert.match(log,/trendContent\.replaceChildren\(calendarSection\(\),rankingSection\(\)\)/);
  assert.match(log,/Search recorded alerts/);
  assert.ok(log.indexOf('trends,')<log.indexOf("h('h2', { class:'history-log-heading'"),
    'Disclosure is discoverable before the archive search controls');
  assert.match(src,/function calendarSection\(\)/);
  assert.match(src,/function rankingSection\(\)/);
  assert.match(src,/document\.addEventListener\('range', draw, \{ signal: viewAbort\.signal \}\)/);
  assert.match(src,/document\.addEventListener\('metric', draw, \{ signal: viewAbort\.signal \}\)/);
  assert.match(src,/history\.replaceState\(null, '', \`#\/log\?\$\{p\}\`\)/);
});

test('responsive action cards and history section have visible focus and small-screen layout',()=>{
  assert.match(css,/\.today-shortcuts \{/);
  assert.match(css,/\.today-shortcut:focus-visible \{outline:3px solid var\(--focus\)/);
  assert.match(css,/\.history-trends summary:focus-visible \{/);
  assert.match(css,/@media \(max-width:640px\) \{/);
  assert.match(css,/\.today-shortcuts \{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.history-trends-content \.section:first-child/);
});

test('no change to protected map renderer/route and Insights remains four distinct views',()=>{
  const routing=slice('const INSIGHT_SECTIONS=Object.freeze([','// ---------- Home Screen app release updates ----------');
  for(const label of ['Reliability','Crowding','Stations','History'])
    assert.ok(routing.includes("'"+label+"'"));
  assert.match(routing,/hash\.startsWith\('#\/map'\).*await viewMap\(main\)/);
  assert.match(routing,/hash\.startsWith\('#\/log'\).*await viewLog\(main\)/);
});
