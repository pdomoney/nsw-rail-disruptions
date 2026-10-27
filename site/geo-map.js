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

const delayClass = delay => delay == null ? 'mt-none' : delay < 120 ? 'mt-ok' : delay < 300 ? 'mt-2' : delay < 600 ? 'mt-5' : 'mt-10';
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
  const boundsFor = name => {
    const v = net.views[name] || net.views.sydney;
    return L.latLngBounds(geographicCoordinates(v[0], v[1]), geographicCoordinates(v[2], v[3]));
  };
  function update({ live: latest, view: nextView, lineFilter: filter }) {
    incidents.clearLayers();
    vehicles.clearLayers();
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
      rails.clearLayers(); stations.clearLayers();
      staticLayersReady = true;
      lastFilter = filter;
    const faded = !!filter;
    for (const [id, pieces] of Object.entries(paths)) {
      if (!colors[id]) continue;
      const selected = id === filter;
      for (const coords of pieces) {
        L.polyline(coords, {
          color: selected ? colors[id] : faded ? '#8d9ca6' : colors[id],
          weight: selected ? 6.5 : faded ? 1.5 : 3.7,
          opacity: selected ? 1 : faded ? .16 : .92,
          renderer: canvas, interactive: false,
        }).addTo(rails);
      }
    }
    for (const [name, x, y, ids, priority] of net.stations || []) {
      const served = ids.split(' ').filter(id => colors[id]);
      const { near, distant } = geographicStationLines(net, name, served);
      // A line-specific geographic map must not mark a stop kilometres away
      // from all the line geometry currently available in the GTFS feed.
      if (!served.length || (filter && !near.includes(filter))) continue;
      const p = geographicCoordinates(x, y);
      if (!p) continue;
      const st = L.circleMarker(p, { radius: priority >= 2 ? 6.3 : priority ? 4.9 : 3.8,
        color: '#203b4d', fillColor: '#fff', fillOpacity: 1, weight: 1.8, renderer: canvas });
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
    // Only positions actually supplied by the realtime feed are shown, not guessed positions.
    for (const train of latest?.trains || []) {
      const [line, x, y, delay, pax, fullest, , headsign] = train;
      if (!colors[line] || (filter && line !== filter)) continue;
      const p = geographicCoordinates(x, y);
      if (!p) continue;
      const cls = delayClass(delay);
      const icon = L.divIcon({ className: 'geo-vehicle', iconSize: [36, 30], iconAnchor: [18, 15],
        html: '<span class="geo-vehicle-symbol ' + cls + '">' + TRAIN_SYMBOL +
          '<span class="geo-vehicle-line">' + cssSafe(line) + '</span></span>' });
      const description = trainDescription({ line, destination: headsign, delay, passengers: pax, fullness: fullest });
      const item = L.marker(p, { icon, keyboard: true, title: 'Moving train: ' + description });
      item.bindPopup(popup('Moving service ' + line,
        [headsign ? 'Destination: ' + headsign.replace(/\s+Station$/i, '') : 'Destination not reported',
          delay == null ? 'Delay not available' : delay < 60 ? 'On time' : Math.round(delay / 60) + ' minutes late',
          pax == null ? 'Estimated occupancy unavailable' : 'Approximately ' + (Math.round(pax / 10) * 10).toLocaleString('en-AU') + ' people aboard (estimate)',
          fullest == null ? '' : 'Fullest carriage: ' + (levels[fullest] || 'unknown')]));
      item.bindTooltip(popup('Moving ' + line + ' service', [
        headsign ? 'Towards ' + headsign.replace(/\s+Station$/i, '') : 'Destination not reported',
        delay == null ? 'Delay not reported' : delay < 60 ? 'On time' : Math.round(delay / 60) + ' min late',
        pax == null ? 'Occupancy not reported' : 'Approximately ' +
          (Math.round(pax / 10) * 10).toLocaleString('en-AU') + ' people aboard (estimate)',
      ]), { direction: 'top', opacity: 0.97, offset: [0, -16], className: 'rail-map-hover' });
      item.on('click', () => onTrainSelect?.(description));
      item.addTo(vehicles);
    }
    map.invalidateSize({ animate: false });
  }
  update({ live, view, lineFilter });
  return {
    update,
    setRailFocus,
    zoomBy: factor => factor > 1 ? map.zoomIn(1) : map.zoomOut(1),
    reset: () => map.fitBounds(boundsFor(lastView || view).pad(.03), { animate: false }),
    resize: () => map.invalidateSize({ animate: false }),
    destroy: () => { map.remove(); container.replaceChildren(); },
  };
}
