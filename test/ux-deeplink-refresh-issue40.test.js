import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site/ux-refresh.css',import.meta.url),'utf8');
const section=(from,to)=>{
  const a=app.indexOf(from),b=app.indexOf(to,a+from.length);
  assert.ok(a>0&&b>a,'Source section '+from);
  return app.slice(a,b);
};
const hashSource=section('let lastHashPath = null;','// ---------- Home Screen app release updates ----------');
const overviewSource=section('function onOverview() {','function userIsInteracting() {');
const historySource=section('async function viewLog(main) {','// ----- about -----');

test('hash-only and same-page query-string navigation both route, without stealing focus', async()=>{
  let handler, navigated=0, scrolled=0, focused=0;
  const location={hash:'#/service'};
  const win={
    addEventListener:(type,listener)=>{assert.equal(type,'hashchange');handler=listener;},
    scrollTo:()=>{scrolled++;}
  };
  const doc={getElementById:()=>({focus:()=>{focused++;}})};
  new Function('window','location','route','document',hashSource)(
    win,location,()=>{navigated++;return Promise.resolve(true);},doc);
  assert.equal(typeof handler,'function');
  handler();await Promise.resolve();
  assert.equal(navigated,1);
  assert.equal(scrolled,1);
  assert.equal(focused,1);

  // External URL changes and browser Back must not be dismissed as "filter
  // changes": internal filter UI uses history.replaceState (no hashchange).
  location.hash='#/service?period=30d';
  handler();await Promise.resolve();
  location.hash='#/service?period=7d';
  handler();await Promise.resolve();
  assert.equal(navigated,3,'every full hash change navigates');
  assert.equal(scrolled,1,'same-view query changes should preserve scroll');
  assert.equal(focused,1,'same-view query changes should not steal focus');

  location.hash='#/map?map=official&line=T4';
  handler();await Promise.resolve();
  assert.equal(navigated,4);
  assert.equal(scrolled,2);
  location.hash='#/map?map=track&line=T9';
  handler();await Promise.resolve();
  assert.equal(navigated,5);
  assert.equal(scrolled,2,'map query links should preserve scroll');

  location.hash='#/log?year=2025';
  handler();await Promise.resolve();
  location.hash='#/log?year=2024';
  handler();await Promise.resolve();
  assert.equal(navigated,7,'History year deep links are routed');
  assert.equal(scrolled,2,'History navigation does not scroll to top');
});

test('live refresh identifies the Insights alias as a section, not Today',()=>{
  const location={hash:'#/insights'};
  const onOverview=new Function('location',overviewSource+'return onOverview;')(location);
  for(const hash of ['#/insights','#/insights?period=7d','#/service?period=30d',
    '#/crowding','#/stations','#/log?year=2025','#/map?map=official',
    '#/trackwork?line=T4','#/trip','#/line/T4','#/about']){
    location.hash=hash;
    assert.equal(onOverview(),false,hash+' must not redraw Today');
  }
  for(const hash of ['#/','#','']){
    location.hash=hash;
    assert.equal(onOverview(),true,hash+' should draw Today');
  }
});

test('History fetch errors show a retry control while preserving the chosen year and filters',()=>{
  assert.match(historySource,/const searchId = \+\+newestSearch/);
  assert.match(historySource,/const year = f\.year/);
  assert.match(historySource,/try \{\s*list = D\.log\[year\] \|\| await getJson/);
  assert.match(historySource,/catch \{\s*if \(searchId !== newestSearch/);
  assert.match(historySource,/role:'alert'/);
  assert.match(historySource,/class:'history-load-error'/);
  assert.match(historySource,/onclick:\(\) => update\(\)/);
  assert.match(historySource,/Retry loading history/);
  assert.match(historySource,/listHolder\.style\.opacity = '';\s*return;/);
  assert.match(historySource,/if \(searchId !== newestSearch \|\| main\.dataset\.routeId !== requestRoute/);
  assert.match(historySource,/history\.replaceState\(null, '', \`#\/log\?\$\{p\}\`\)/);
});

test('historical error recovery uses visible keyboard-sized and focusable controls',()=>{
  assert.match(css,/\.history-load-error \{/);
  assert.match(css,/\.history-retry \{/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/\.history-retry:focus-visible \{/);
  assert.match(app,/const INSIGHT_SECTIONS=Object\.freeze/);
  assert.match(app,/function trackworkChart\(/);
  assert.match(app,/drawOfficialOverlay\(holder,/);
  assert.match(app,/function plannerUrl\(from, to, when, t, railOnly\)/);
});
