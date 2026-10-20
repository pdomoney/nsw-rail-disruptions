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
    document.head.append(link);
    const script = document.createElement('script');
    script.src = SOURCE + 'leaflet.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('Map library unavailable')), 9000);
    script.onload = () => { clearTimeout(timer); window.L?.map ? resolve(window.L) : reject(new Error('Map library did not initialise')); };
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

export function createGeographicMap(container, { net, live, view, lineFilter, colors, onTrainSelect }) {
  const L = window.L;
  if (!L?.map) throw new Error('Leaflet is not loaded');
  const root = document.createElement('div');
  root.className = 'geo-map';
  root.setAttribute('aria-label', 'Geographic map showing accurately located stations and live trains');
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
  const boundsFor = name => {
    const v = net.views[name] || net.views.sydney;
    return L.latLngBounds(geographicCoordinates(v[0], v[1]), geographicCoordinates(v[2], v[3]));
  };
  function update({ live: latest, view: nextView, lineFilter: filter }) {
    rails.clearLayers(); stations.clearLayers(); incidents.clearLayers(); vehicles.clearLayers();
    if (nextView !== lastView) {
      map.fitBounds(boundsFor(nextView).pad(.03), { animate: false });
      lastView = nextView;
    }
    const faded = !!filter;
    for (const [id, pieces] of Object.entries(paths)) {
      if (!colors[id]) continue;
      const selected = id === filter;
      for (const coords of pieces) {
        L.polyline(coords, {
          color: selected ? colors[id] : faded ? '#8d9ca6' : colors[id],
          weight: selected ? 5 : faded ? 1.2 : 2.6,
          opacity: selected ? 1 : faded ? .18 : .68,
          renderer: canvas, interactive: false,
        }).addTo(rails);
      }
    }
    for (const [name, x, y, ids, priority] of net.stations || []) {
      const served = ids.split(' ').filter(id => colors[id]);
      if (!served.length || (filter && !served.includes(filter))) continue;
      const p = geographicCoordinates(x, y);
      if (!p) continue;
      const st = L.circleMarker(p, { radius: priority >= 2 ? 5.4 : 3.6,
        color: '#354552', fillColor: '#fff', fillOpacity: 1, weight: 1.4, renderer: canvas });
      st.bindPopup(popup(name + ' station', ['Served by: ' + served.join(', '), 'Location from TfNSW GTFS stops.']));
      st.addTo(stations);
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
      item.bindPopup(popup('Train / Metro ' + line,
        [headsign ? 'Destination: ' + headsign.replace(/\s+Station$/i, '') : 'Destination not reported',
          delay == null ? 'Delay not available' : delay < 60 ? 'On time' : Math.round(delay / 60) + ' minutes late',
          pax == null ? 'Estimated occupancy unavailable' : 'Approximately ' + (Math.round(pax / 10) * 10).toLocaleString('en-AU') + ' people aboard (estimate)',
          fullest == null ? '' : 'Fullest carriage: ' + (levels[fullest] || 'unknown')]));
      item.on('click', () => onTrainSelect?.(description));
      item.addTo(vehicles);
    }
    map.invalidateSize({ animate: false });
  }
  update({ live, view, lineFilter });
  return {
    update,
    zoomBy: factor => factor > 1 ? map.zoomIn(1) : map.zoomOut(1),
    reset: () => map.fitBounds(boundsFor(lastView || view).pad(.03), { animate: false }),
    resize: () => map.invalidateSize({ animate: false }),
    destroy: () => { map.remove(); container.replaceChildren(); },
  };
}
