"""Mock of the TfNSW endpoints used by the collector, for end-to-end tests without an API key.
Usage: python3 test/mock_tfnsw.py <port> <add_info snapshot.json>
Serves a real alerts snapshot plus generated GTFS-realtime feeds stamped with the current time."""
import io, json, random, sys, time, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
sys.path.insert(0, __import__('os').path.dirname(__file__))
from fixtures import make_gtfsrt as g  # noqa: E402  (module builds the descriptor at import)

FEEDS = {
  'sydneytrains': [('T1_route', 'T1'), ('T2_route', 'T2'), ('T8_route', 'T8'), ('BMT_1', 'BMT'), ('SCO_1', 'SCO')],
  'metro': [('M1', 'M1')],
  'lightrail/innerwest': [('IWLR-191', 'L1')],
  'lightrail/cbdandsoutheast': [('CSELR-L2', 'L2'), ('CSELR-L3', 'L3')],
  'lightrail/parramatta': [('PLR', 'L4')],
  'lightrail/newcastle': [('NLR', 'NLR')],
}
SNAP = json.load(open(sys.argv[2]))

def feed_pb(key):
    now = int(time.time())
    fm = g.FeedMessage(); fm.header.gtfs_realtime_version = '2.0'; fm.header.timestamp = now
    for rid, short in FEEDS[key]:
        for k in range(12):
            e = fm.entity.add(id=f'{rid}-{k}'); tu = e.trip_update
            tu.trip.trip_id = f'{rid}.trip.{k}'; tu.trip.route_id = rid; tu.trip.start_date = time.strftime('%Y%m%d')
            if k == 0: tu.trip.schedule_relationship = 3; continue
            delay = random.choice([0, 0, 30, 60, 90, 120, 240, 400, 700])
            for i, off in enumerate([-300, -60, 240, 600]):
                s = tu.stop_time_update.add(stop_sequence=i + 1, stop_id=f'S{i}')
                s.departure.time = now + off; s.departure.delay = delay
    return fm.SerializeToString()

def static_zip(key):
    rows = ['route_id,route_short_name,route_long_name,route_desc,route_color']
    rows += [f'{rid},{short},{short} line,,123456' for rid, short in FEEDS[key]]
    trips = ['route_id,trip_id'] + [f'{rid},{rid}.trip.{k}' for rid, _ in FEEDS[key] for k in range(12)]
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('routes.txt', '\n'.join(rows) + '\n'); z.writestr('trips.txt', '\n'.join(trips) + '\n')
    return b.getvalue()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if not self.headers.get('Authorization', '').startswith('apikey '):
            return self.send(401, b'{"message":"no key"}', 'application/json')
        path = self.path.split('?')[0]
        if path == '/v1/tp/add_info':
            return self.send(200, json.dumps({'version': 'x', 'infos': {'current': SNAP}}).encode(), 'application/json')
        for prefix in ('/v2/gtfs/realtime/', '/v1/gtfs/realtime/'):
            if path.startswith(prefix) and path[len(prefix):] in FEEDS:
                if path == '/v2/gtfs/realtime/lightrail/innerwest':
                    return self.send(404, b'not here', 'text/plain')  # exercise the v1 fallback
                return self.send(200, feed_pb(path[len(prefix):]), 'application/x-google-protobuf')
        for prefix in ('/v2/gtfs/schedule/', '/v1/gtfs/schedule/'):
            if path.startswith(prefix) and path[len(prefix):] in FEEDS:
                return self.send(200, static_zip(path[len(prefix):]), 'application/zip')
        self.send(404, b'unknown', 'text/plain')

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
