"""Mock of the TfNSW endpoints used by the collector, for end-to-end tests without an API key.
Usage: python3 test/mock_tfnsw.py <port> <add_info snapshot.json>
Serves a real alerts snapshot plus generated GTFS-realtime feeds stamped with the current time."""
import io, json, random, sys, time, zipfile
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
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
SYD = ZoneInfo('Australia/Sydney')

def service_day():
    """Today's Sydney date (YYYYMMDD) and the seconds since its midnight."""
    now = datetime.now(SYD)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return now.strftime('%Y%m%d'), int((now - midnight).total_seconds())

def hms(s):
    return f'{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}'

def feed_pb(key):
    now = int(time.time())
    fm = g.FeedMessage(); fm.header.gtfs_realtime_version = '2.0'; fm.header.timestamp = now
    for rid, short in FEEDS[key]:
        for k in range(12):
            e = fm.entity.add(id=f'{rid}-{k}'); tu = e.trip_update
            tu.trip.trip_id = f'{rid}.trip.{k}'; tu.trip.route_id = rid; tu.trip.start_date = service_day()[0]
            if k == 0: tu.trip.schedule_relationship = 3; continue
            delay = random.choice([0, 0, 30, 60, 90, 120, 240, 400, 700])
            for i, off in enumerate([-300, -60, 240, 600]):
                s = tu.stop_time_update.add(stop_sequence=i + 1, stop_id=f'S{i}')
                s.departure.time = now + off; s.departure.delay = delay
                if key == 'sydneytrains':  # predictive occupancy, as Sydney Trains publishes it
                    s.departure_occupancy_status = (k + i) % 5
                    for pos in range(1, 9 if k % 2 else 5):
                        c = s.carriage_seq_predictive_occupancy.add(position_in_consist=pos, name=str(pos))
                        c.departure_occupancy_status = min(5, (k + i + pos) % 6)
    return fm.SerializeToString()

def static_zip(key):
    rows = ['route_id,route_short_name,route_long_name,route_desc,route_color']
    rows += [f'{rid},{short},{short} line,,123456' for rid, short in FEEDS[key]]
    # Trips 0-11 appear in the realtime feed; trip 12 is timetabled but never shows up.
    trips = ['route_id,service_id,trip_id,direction_id'] + [f'{rid},daily,{rid}.trip.{k},{k % 2}' for rid, _ in FEEDS[key] for k in range(13)]
    today, secs = service_day()
    start = (datetime.now(SYD) - timedelta(days=30)).strftime('%Y%m%d')
    end = (datetime.now(SYD) + timedelta(days=30)).strftime('%Y%m%d')
    cal = ['service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date', f'daily,1,1,1,1,1,1,1,{start},{end}']
    st = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence']
    for rid, _ in FEEDS[key]:
        for k in range(13):
            t0 = max(0, secs - 3600 + k * 600)
            st += [f'{rid}.trip.{k},{hms(t0)},{hms(t0)},S0,1', f'{rid}.trip.{k},{hms(t0 + 1500)},{hms(t0 + 1500)},S1,2']
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('routes.txt', '\n'.join(rows) + '\n'); z.writestr('trips.txt', '\n'.join(trips) + '\n')
        z.writestr('calendar.txt', '\n'.join(cal) + '\n'); z.writestr('stop_times.txt', '\n'.join(st) + '\n')
        z.writestr('stops.txt', 'stop_id,stop_name\nS0,First Station\nS1,Last Station\n')
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
            body = SNAP if isinstance(SNAP, dict) else {'version': 'x', 'infos': {'current': SNAP}}  # a full response or just the list
            return self.send(200, json.dumps(body).encode(), 'application/json')
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
