import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGeographicMap } from '../site/geo-map.js';

function fakeElement(tag) {
  return {
    tagName: tag, children: [], attributes: {}, textContent: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    setAttribute(key, value) { this.attributes[key] = value; },
  };
}

function fakeLeaflet() {
  const markers = [];
  const map = {
    fitBounds() {}, invalidateSize() {}, remove() { this.removed = true; },
    zoomIn() {}, zoomOut() {},
  };
  const layerGroup = () => ({
    items: [],
    addTo() { return this; },
    clearLayers() { this.items = []; },
  });
  const layer = type => ({
    type, handlers: {},
    bindPopup(content) { this.popup = content; return this; },
    bindTooltip(content, opts) { this.tooltip = content; this.tooltipOptions = opts; return this; },
    on(name, handler) { this.handlers[name] = handler; return this; },
    addTo(group) { group.items.push(this); return this; },
  });
  return {
    markers, map,
    L: {
      map: () => map,
      tileLayer: () => ({ addTo() { return this; } }),
      canvas: () => ({}),
      layerGroup,
      polyline: () => layer('line'),
      circleMarker: () => { const item = layer('station'); markers.push(item); return item; },
      divIcon: obj => obj,
      marker: () => { const item = layer('train'); markers.push(item); return item; },
      latLngBounds: () => ({ pad() { return this; } }),
    },
  };
}

test('geographic map supports hover previews and click details for fixed stops and moving trains', () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const { L, markers, map } = fakeLeaflet();
  const selected = [];
  globalThis.window = { L };
  globalThis.document = { createElement: fakeElement };
  try {
    const container = fakeElement('main');
    const view = createGeographicMap(container, {
      net: {
        views: { sydney: [0, 0, 20, 20] },
        lines: { T1: [[0, 0, 2, 2]] },
        stations: [['Central', 10, 10, 'T1', 2]],
      },
      live: {
        trains: [['T1', 11, 11, 240, 125, 3, null, 'Parramatta Station']],
        overlays: [],
      },
      colors: { T1: '#f99e1d' },
      view: 'sydney',
      lineFilter: null,
      onTrainSelect: msg => selected.push(msg),
      onStationSelect: (name, lines) => selected.push(name + ': ' + lines.join(',')),
    });
    const station = markers.find(x => x.type === 'station');
    const train = markers.find(x => x.type === 'train');
    assert.ok(station?.tooltip, 'station hover preview should be attached');
    assert.equal(station.tooltipOptions.className, 'rail-map-hover');
    assert.ok(station.popup, 'station click popup remains available');
    station.handlers.click();
    assert.match(selected[0], /Central: T1/, 'geographic station tap shares detail-panel selection');
    assert.ok(train?.tooltip, 'train hover preview should be attached');
    assert.equal(train.tooltipOptions.className, 'rail-map-hover');
    assert.ok(train.popup, 'train click popup remains available');
    assert.ok(train.tooltip.children.some(x => x.textContent.includes('Moving T1')));
    train.handlers.click();
    assert.match(selected[1], /T1 service towards Parramatta/);
    view.setRailFocus('streets');
    assert.equal(container.children[0].className,'geo-map');
    view.setRailFocus('rail');
    assert.equal(container.children[0].className,'geo-map geo-map-rail-focus');
    view.destroy();
    assert.equal(map.removed, true);
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});

test('offline geographic SVG retains pointer-enter, movement and keyboard-focus tooltip handlers', () => {
  const source = fs.readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
  assert.match(source, /function bindSvgMapHover\(/);
  for (const handler of ['pointerenter', 'pointermove', 'pointerleave', 'focus', 'blur']) {
    assert.ok(source.includes("node.addEventListener('" + handler + "'"), handler + ' missing');
  }
  assert.match(source, /bindSvgMapHover\(group, tip\)/, 'geographic SVG trains retain hover');
  assert.match(source, /bindSvgMapHover\(station, \[/, 'offline geographic station hover');
  assert.doesNotMatch(source, /function schematicMap\(/, 'retired hand-drawn renderer must not remain');
  assert.match(source, /event\.pointerType === 'touch'/, 'tap selection should not be replaced by a hovering bubble');
});
