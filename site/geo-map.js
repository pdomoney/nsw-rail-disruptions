// Geographic basemap uses TfNSW GTFS stop locations, shapes and vehicle positions.
// The hand-authored schematic must never supply geographic coordinates.
const LAT0 = -33.87, LON0 = 151.0;
const KX = (111_320 * Math.cos(LAT0 * Math.PI / 180)) / 10;
const KY = 110_574 / 10;
const SOURCE = 'https://unpkg.com/leaflet@1.9.4/dist/';

export function geographicCoordinates(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [LAT0 - y / KY, LON0 + x / KX];
}
export function decodeProjectedChain(flat) {
  if (!Array.isArray(flat) || flat.length < 4 || flat.length % 2) return [];
  const result = [];
  let x = flat[0], y = flat[1];
  result.push(geographicCoordinates(x, y));
  for (let i = 2; i < flat.length; i += 2) {
    x += flat[i]; y += flat[i + 1];
    result.push(geographicCoordinates(x, y));
  }
  return result.filter(Boolean);
}

export function trainDescription({ line, destination, delay, passengers, fullness }) {
  const direction = destination ? ' towards ' + String(destination).replace(/\s+Station$/i, '') : '';
  const timing = delay == null ? 'delay not reported' : delay < 60 ? 'on time' : Math.round(delay / 60) + ' minutes late';
  const crowding = passengers == null ? 'occupancy not reported' : 'approximately ' + (Math.round(passengers / 10) * 10).toLocaleString('en-AU') + ' people aboard (estimate)';
  const level = fullness == null ? '' : '; highest reported occupancy level ' + fullness + ' of 5';
  return line + ' service' + direction + '; ' + timing + '; ' + crowding + level;
}

// A vehicle is a rectangular train with windows and rails; stations are hollow circles.
export const TRAIN_SYMBOL = '<svg viewBox="0 0 24 22" aria-hidden="true" focusable="false"><rect x="4" y="1.5" width="16" height="16" rx="4" fill="currentColor"/><rect x="7" y="4.5" width="10" height="6.5" rx="1" fill="#fff"/><circle cx="8" cy="13.5" r="1.15" fill="#fff"/><circle cx="16" cy="13.5" r="1.15" fill="#fff"/><path d="M9 17.5l-2.5 3M15 17.5l2.5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

let loadingLeaflet;
export function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (loadingLeaflet) return loadingLeaflet;
  loadingLeaflet = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SOURCE + 'leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = 'anonymous';
    let cssReady = false, jsReady = false;
    const timer = setTimeout(() => reject(new Error('Map library unavailable')), 10000);
    const ready = () => {
      if (!cssReady || !jsReady) return;
      clearTimeout(timer);
      window.L?.map ? resolve(window.L) : reject(new Error('Map library did not initialise'));
    };
    link.onload = () => { cssReady = true; ready(); };
    link.onerror = () => { clearTimeout(timer); reject(new Error('Map stylesheet unavailable')); };
    document.head.append(link);
    const script = document.createElement('script');
    script.src = SOURCE + 'leaflet.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.onload = () => { jsReady = true; ready(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('Map library unavailable')); };
    document.head.append(script);
  }).catch(e => { loadingLeaflet = null; throw e; });
  return loadingLeaflet;
}

// A viewport/zoom display grouping, never an inferred vehicle location.
// Grid grouping keeps every original reported position in a cluster's members.
// The centroid is ONLY a visual summary anchor (not a GPS measurement).
export function groupReportedVehicles(items, project, cellSize = 72) {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('Invalid marker group size');
  const buckets = new Map();
  for (const item of items) {
    const point = project?.(item.position);
    // If projection is unavailable, render separately rather than fabricate coordinates.
    const valid = point && Number.isFinite(point.x) && Number.isFinite(point.y);
    const key = valid ? Math.floor(point.x / cellSize) + ':' + Math.floor(point.y / cellSize)
      : 'individual:' + buckets.size;
    let group = buckets.get(key);
    if (!group) {
      group = { members: [], lat: 0, lon: 0 };
      buckets.set(key, group);
    }
    group.members.push(item);
    group.lat += item.position[0];
    group.lon += item.position[1];
  }
  return [...buckets.values()].map(group => ({
    members: group.members,
    centre: [group.lat / group.members.length, group.lon / group.members.length],
  }));
}

const delayClass = delay => delay == null ? 'mt-none' : delay < 120 ? 'mt-ok' : delay < 300 ? 'mt-2' : delay < 600 ? 'mt-5' : 'mt-10';
const safeColor = color => /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#355a70';
const cssSafe = id => /^[A-Za-z0-9_-]+$/.test(id) ? id : '';
const levels = ['empty', 'many seats available', 'few seats available', 'standing room', 'crowded', 'full'];

function popup(title, details) {
  const wrap = document.createElement('div');
  const header = document.createElement('strong'); header.textContent = title; wrap.append(header);
  for (const line of details.filter(Boolean)) {
    const p = document.createElement('p');
    p.textContent = line; wrap.append(p);
  }
  return wrap;
}

// Display-only distinction. Every GTFS station-line association remains in net.stations.
// If provenance is unavailable (old/cached data), preserve the original line set.
export function geographicStationLines(net, name, lines) {
  const source = Array.isArray(lines) ? lines : String(lines || '').split(/\s+/).filter(Boolean);
  const flagged = net?.stationProximity?.version === 1
    ? net.stationProximity.distant?.[name] : null;
  if (!Array.isArray(flagged)) return { near: source, distant: [] };
  const distant = source.filter(line => flagged.includes(line));
  const near = source.filter(line => !flagged.includes(line));
  return { near, distant };
}

export function createGeographicMap(container, {
  net, live, view, lineFilter, colors, onTrainSelect, onStationSelect, railFocus = 'rail',
}) {
  const L = window.L;
  if (!L?.map) throw new Error('Leaflet is not loaded');
  const root = document.createElement('div');
  // Use the existing attributed OSM basemap without another provider's key.
  // "Rail focus" is a visual-only tile treatment. It never changes the
  // GTFS coordinates or reroutes a live vehicle.
  const setRailFocus = value => {
    railFocus = value === 'streets' ? 'streets' : 'rail';
    root.className = 'geo-map' + (railFocus === 'rail' ? ' geo-map-rail-focus' : '');
  };
  setRailFocus(railFocus);
  root.setAttribute('aria-label', 'Geographic rail map using TfNSW GTFS route shapes and reported positions');
  container.replaceChildren(root);
  const map = L.map(root, { zoomControl: false, scrollWheelZoom: false, preferCanvas: true, minZoom: 5, maxZoom: 18, worldCopyJump: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 19, minZoom: 5, crossOrigin: true,
  }).addTo(map);
  const canvas = L.canvas({ padding: .3 });
  const rails = L.layerGroup().addTo(map);
  const stations = L.layerGroup().addTo(map);
  const incidents = L.layerGroup().addTo(map);
  const vehicles = L.layerGroup().addTo(map);
  const paths = Object.fromEntries(Object.entries(net.lines).map(([id, chains]) =>
    [id, chains.map(decodeProjectedChain).filter(chain => chain.length > 1)]));
  let lastView = null;
  let lastFilter = null;
  let staticLayersReady = false;
  let stationLayersReady = false, stationFilter = null, stationZoomBand = null;
  const boundsFor = name => {
    const v = net.views[name] || net.views.sydney;
    return L.latLngBounds(geographicCoordinates(v[0], v[1]), geographicCoordinates(v[2], v[3]));
  };
  let latestVehicles = live, latestLineFilter = lineFilter;
  // Marker grouping is screen/zoom presentation, not a replacement for
  // the underlying realtime vehicle coordinates or trip data.
  function renderVehicles() {
    vehicles.clearLayers();
    const observations = [];
    // Only positions actually supplied by the realtime feed are shown, not guessed positions.
    for (const train of latestVehicles?.trains || []) {
      const [line, x, y, delay, pax, fullest, , headsign] = train;
      if (!colors[line] || (latestLineFilter && line !== latestLineFilter)) continue;
      const p = geographicCoordinates(x, y);
      if (!p) continue;
      observations.push({line, delay, pax, fullest, headsign, position:p});
    }
    const zoom = map.getZoom?.() ?? 13;
    const cellSize = zoom < 9 ? 88 : zoom < 11 ? 76 : zoom < 14 ? 64 : 45;
    const groups = groupReportedVehicles(observations,
      map.project ? point => map.project(point, zoom) : null, cellSize);
    for (const group of groups) {
      const items = group.members;
      if (items.length > 1) {
        const counts = new Map();
        for (const item of items) counts.set(item.line, (counts.get(item.line) || 0) + 1);
        const summary = [...counts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
        const [leading] = summary[0];
        const lineDetail = summary.map(([line,count]) => line + ' ' + count).join(' · ');
        const label = items.length + ' reported vehicles grouped for map clarity';
        // This centroid represents a group. It must NEVER be described as a live train position.
        const icon = L.divIcon({className:'geo-vehicle geo-cluster-marker',
          iconSize:[52,52], iconAnchor:[26,26],
          html:'<span class="geo-vehicle-cluster" style="--route-color:'+
            safeColor(colors[leading])+'"><span class="geo-cluster-count">'+items.length+
            '</span><span class="geo-cluster-caption">'+(summary.length===1?cssSafe(leading):'LINES')+'</span></span>'});
        const marker = L.marker(group.centre, {icon, keyboard:true,
          title:label+'. '+lineDetail+'. Select to inspect.'});
        marker.bindPopup(popup(label, [lineDetail,
          'Approximate centre of grouped icons, not a vehicle GPS location.',
          zoom < 17 ? 'Select to zoom in and separate nearby trains.' : 'Select to review individual services.']));
        marker.bindTooltip(popup(label, [lineDetail, 'Zoom in to inspect reported positions.']), {
          direction:'top', opacity:.97, offset:[0,-20], className:'rail-map-hover'});
        marker.on('click',() => {
          if (zoom < 17 && typeof map.setView === 'function') {
            map.setView(group.centre,Math.min(zoom+2,18),{animate:true});
          } else {
            onTrainSelect?.(label + '. ' + lineDetail + '. ' +
              items.slice(0,8).map(item => trainDescription({
                line:item.line,destination:item.headsign,delay:item.delay,
                passengers:item.pax,fullness:item.fullest,
              })).join(' | ') + (items.length>8?' | Additional services omitted from summary.':''));
          }
        });
        marker.addTo(vehicles);
        continue;
      }
      const {line,delay,pax,fullest,headsign,position} = items[0];
      const cls = delayClass(delay);
      const icon = L.divIcon({className:'geo-vehicle',iconSize:[46,30],iconAnchor:[23,15],
        html:'<span class="geo-vehicle-symbol '+cls+'" style="--route-color:'+safeColor(colors[line])+'">'+
          '<span class="geo-vehicle-line">'+cssSafe(line)+'</span>'+TRAIN_SYMBOL+
          '<span class="geo-vehicle-status" aria-hidden="true"></span></span>'});
      const description = trainDescription({
        line, destination:headsign, delay, passengers:pax, fullness:fullest,
      });
      const item = L.marker(position, {icon, keyboard:true, title:(line==='M1'?'Reported metro: ':'Reported train: ')+description});
      item.bindPopup(popup((line==='M1'?'Reported Metro ':'Reported train ')+line, [
        headsign?'Destination: '+headsign.replace(/\s+Station$/i,''):'Destination not reported',
        delay==null?'Delay not available':delay<60?'On time':Math.round(delay/60)+' minutes late',
        pax==null?'Estimated occupancy unavailable':'Approximately '+(Math.round(pax/10)*10).toLocaleString('en-AU')+' people aboard (estimate)',
        fullest==null?'':'Fullest carriage: '+(levels[fullest]||'unknown'),
      ]));
      item.bindTooltip(popup((line==='M1'?'Reported Metro ':'Reported train ')+line+' service', [
        headsign?'Towards '+headsign.replace(/\s+Station$/i,''):'Destination not reported',
        delay==null?'Delay not reported':delay<60?'On time':Math.round(delay/60)+' min late',
        pax==null?'Occupancy not reported':'Approximately '+
          (Math.round(pax/10)*10).toLocaleString('en-AU')+' people aboard (estimate)',
      ]),{direction:'top',opacity:.97,offset:[0,-16],className:'rail-map-hover'});
      item.on('click',() => onTrainSelect?.(description));
      item.addTo(vehicles);
    }
  }

  function update({ live: latest, view: nextView, lineFilter: filter }) {
    incidents.clearLayers();
    if (nextView !== lastView) {
      map.fitBounds(boundsFor(nextView).pad(.03), { animate: false });
      lastView = nextView;
    }
    // Track geometry and station positions remain stable for the lifetime of this map.
    // Do not recreate thousands of rail segments on every five-minute live refresh.
    // The first view must create track/station layers even when All lines is
    // selected (filter === null). Previously lastFilter also started as null,
    // so the initial render skipped both layers completely.
    if (!staticLayersReady || lastFilter !== filter) {
      rails.clearLayers();
      staticLayersReady = true;
      lastFilter = filter;
    const faded = !!filter;
    for (const [id, pieces] of Object.entries(paths)) {
      if (!colors[id]) continue;
      const selected = id === filter;
      for (const coords of pieces) {
        L.polyline(coords, {
          color: selected ? colors[id] : faded ? '#8795a6' : colors[id],
          weight: selected ? 5.4 : faded ? 1.25 : 3,
          opacity: selected ? 1 : faded ? .13 : .84,
          lineCap:'round', lineJoin:'round',
          renderer: canvas, interactive: false,
        }).addTo(rails);
      }
    }
    }
    const zoomLevel = map.getZoom?.() ?? 13;
    const stationDetail = zoomLevel < 10 ? 0 : zoomLevel < 12 ? 1 : 2;
    if (!stationLayersReady || stationFilter !== filter || stationZoomBand !== stationDetail) {
      stations.clearLayers();
      stationLayersReady = true;
      stationFilter = filter;
      stationZoomBand = stationDetail;
    for (const [name, x, y, ids, priority] of net.stations || []) {
      const served = ids.split(' ').filter(id => colors[id]);
      const { near, distant } = geographicStationLines(net, name, served);
      // A line-specific geographic map must not mark a stop kilometres away
      // from all the line geometry currently available in the GTFS feed.
      if (!served.length || (filter && !near.includes(filter))) continue;
      if (!filter && ((stationDetail===0 && priority<2) || (stationDetail===1 && priority<1))) continue;
      const p = geographicCoordinates(x, y);
      if (!p) continue;
      const st = L.circleMarker(p, { radius: priority >= 2 ? 5.3 : priority ? 4.2 : 3.2,
        color:'#25475d',fillColor:'#fff',fillOpacity:1,weight:1.7,renderer:canvas });
      const routeNote = near.length
        ? 'Close to plotted GTFS lines: ' + near.join(', ')
        : 'No plotted GTFS line is close to this station.';
      const exceptionNote = distant.length
        ? 'Other GTFS stop-time associations (outside mapped line paths): ' + distant.join(', ')
        : '';
      st.bindPopup(popup(name + ' station', [
        routeNote, exceptionNote, 'Position from TfNSW GTFS stops; associations can include unusual services.',
      ]));
      st.bindTooltip(popup(name + ' station', [routeNote, exceptionNote]), {
        direction: 'top', opacity: 0.97, sticky: true, className: 'rail-map-hover',
      });
      // Shared persistent station panel receives route-near and additional
      // recorded associations separately, without rewriting timetable data.
      st.on('click', () => onStationSelect?.(name, near, distant));
      st.addTo(stations);
    }
    }
    for (const o of latest?.overlays || []) {
      if (filter && !o.lines.includes(filter)) continue;
      for (const part of o.paths || []) {
        const coords = decodeProjectedChain(part);
        if (coords.length < 2) continue;
        L.polyline(coords, { color: o.kind === 'incident' ? '#db5030' : '#ac6816',
          opacity: .75, weight: o.kind === 'incident' ? 7 : 6,
          dashArray: o.kind === 'closed' ? '8 6' : null, renderer: canvas })
          .bindPopup(popup(o.title, [o.kind === 'closed' ? 'Trackwork closure' : 'Service disruption'])).addTo(incidents);
      }
    }
    latestVehicles = latest;
    latestLineFilter = filter;
    renderVehicles();
    map.invalidateSize({ animate: false });
  }
  update({ live, view, lineFilter });
  // Leaflet owns zoom/centre; refresh only visual density when zoom changes.
  map.on?.('zoomend',() => update({live:latestVehicles,view:lastView,lineFilter:lastFilter}));
  const key = document.createElement('div');
  key.className = 'geo-map-key';
  key.textContent = '○ Station  ·  ▪ Live vehicle  ·  Number = grouped vehicles';
  key.setAttribute('aria-label', 'Station rings, live vehicle badges, and grouped vehicle counts');
  root.append(key);
  return {
    update,
    setRailFocus,
    zoomBy: factor => factor > 1 ? map.zoomIn(1) : map.zoomOut(1),
    reset: () => map.fitBounds(boundsFor(lastView || view).pad(.03), { animate: false }),
    resize: () => map.invalidateSize({ animate: false }),
    destroy: () => { map.remove(); container.replaceChildren(); },
  };
}
