import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeographicMap } from '../site/geo-map.js';

function fakeElement(tag) {
  return {
    tagName: tag, textContent: '', children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    setAttribute() {},
  };
}
function fakeLeaflet() {
  const layers = [];
  const map = { fitBounds() {}, invalidateSize() {}, remove() {}, zoomIn() {}, zoomOut() {} };
  function group() {
    const layer = {
      items: [],
      addTo() { return this; },
      clearLayers() { this.items.length = 0; },
    };
    layers.push(layer);
    return layer;
  }
  function item(kind, position) {
    return {
      kind, position, callbacks: {},
      addTo(layer) { layer.items.push(this); return this; },
      on(name, fn) { this.callbacks[name] = fn; return this; },
      bindPopup(content) { this.popup = content; return this; },
      bindTooltip(content) { this.tooltip = content; return this; },
    };
  }
  return {
    layers,
    L: {
      map: () => map,
      tileLayer: () => ({ addTo() { return this; } }),
      canvas: () => ({}),
      layerGroup: group,
      polyline: position => item('line', position),
      circleMarker: position => item('station', position),
      marker: position => item('vehicle', position),
      divIcon: options => options,
      latLngBounds: () => ({ pad() { return this; } }),
    }
  };
}
const data = {
  views: { sydney: [0,0,5000,5000] },
  lines: {
    T8: [[5000,0,0,1000]],
    T9: [[0,0,1000,0]],
  },
  stations: [
    ['Remote T9',5000,500,'T8 T9',2],
    ['Near T9',100,10,'T9',1],
    ['T8 only',5000,300,'T8',0],
  ],
  stationProximity: {
    version:1, thresholdM:1000,
    distant: {'Remote T9':['T9']},
  },
};
const sourceTrains = [
  ['T9',101,10,0,null,null,null,'Epping'],
  ['T8',5000,501,0,null,null,null,'Campbelltown'],
];
const textOf = element => element.children.map(child => child.textContent).join(' ');
function exercise(testBody, net = data) {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const { L, layers } = fakeLeaflet();
  const selections = [];
  globalThis.window = {L};
  globalThis.document = {createElement: fakeElement};
  try {
    const map = createGeographicMap(fakeElement('main'), {
      net,
      live:{trains: sourceTrains, overlays:[]},
      colors:{T8:'#008000',T9:'#a00000'},
      view:'sydney',
      lineFilter:null,
      onTrainSelect: message => selections.push({train:message}),
      onStationSelect:(name,near,distant) => selections.push({name,near,distant}),
    });
    testBody({map, layers, selections});
    map.destroy();
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
}
test('all-lines view separates plotted routes from distant GTFS station associations on hover and click', () => {
  exercise(({layers,selections}) => {
    const stationLayer = layers[1], vehicleLayer = layers[3];
    assert.equal(stationLayer.items.length,3,'All lines retains every station');
    assert.equal(vehicleLayer.items.length,2,'Train positions are not affected by station proximity');
    const remote = stationLayer.items[0];
    assert.deepEqual(remote.position,[ -33.87-500/11057.4, 151+5000/(111320*Math.cos(-33.87*Math.PI/180)/10) ].map(x=>x),
      'Geographic coordinates come from GTFS, not a schematic');
    assert.match(textOf(remote.popup),/Close to plotted GTFS lines: T8/);
    assert.match(textOf(remote.popup),/Other GTFS stop-time associations.*T9/);
    assert.match(textOf(remote.tooltip),/Other GTFS stop-time associations.*T9/);
    remote.callbacks.click();
    assert.deepEqual(selections[0],{name:'Remote T9',near:['T8'],distant:['T9']});
  });
});
test('line filtering excludes only stations distant from selected line, never moving trains', () => {
  exercise(({map,layers,selections}) => {
    const stations=layers[1],vehicles=layers[3];
    map.update({live:{trains:sourceTrains,overlays:[]},view:'sydney',lineFilter:'T9'});
    assert.equal(stations.items.length,1,'Remote T9 station must not appear on T9-only geographic map');
    assert.match(textOf(stations.items[0].popup),/Close to plotted GTFS lines: T9/);
    assert.equal(vehicles.items.length,1,'T9 live vehicle is unaffected');
    assert.match(textOf(vehicles.items[0].popup),/Moving service T9/);
    map.update({live:{trains:sourceTrains,overlays:[]},view:'sydney',lineFilter:'T8'});
    assert.equal(stations.items.length,2,'Remote station is still shown on its nearby T8 path');
    assert.equal(vehicles.items.length,1,'T8 train remains on route as originally reported');
    stations.items[0].callbacks.click();
    assert.deepEqual(selections[0],{name:'Remote T9',near:['T8'],distant:['T9']});
    map.update({live:{trains:sourceTrains,overlays:[]},view:'sydney',lineFilter:null});
    assert.equal(stations.items.length,3,'Returning to all-lines restores complete station visibility');
    assert.equal(vehicles.items.length,2);
  });
});
test('previously cached network versions preserve original station-line memberships', () => {
  exercise(({map,layers}) => {
    map.update({live:{trains:[],overlays:[]},view:'sydney',lineFilter:'T9'});
    assert.equal(layers[1].items.length,2,'without proximity metadata, both T9-assigned stations remain visible');
  },{...data,stationProximity:undefined});
  exercise(({map,layers}) => {
    map.update({live:{trains:[],overlays:[]},view:'sydney',lineFilter:'T9'});
    assert.equal(layers[1].items.length,2,'unrecognised metadata version must fail open');
  },{...data,stationProximity:{version:99,distant:data.stationProximity.distant}});
});
