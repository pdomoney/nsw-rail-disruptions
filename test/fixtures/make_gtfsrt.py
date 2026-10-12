"""Generates test/fixtures/tripupdates.pb (and a JSON copy) with the official protobuf runtime.
Run: python3 test/fixtures/make_gtfsrt.py  (only needed when changing the fixture)."""
import json, os
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory
from google.protobuf.json_format import MessageToDict

F = descriptor_pb2.FieldDescriptorProto
fd = descriptor_pb2.FileDescriptorProto(name='gtfs_rt_test.proto', package='transit_realtime', syntax='proto2')

def msg(name, fields):
    m = fd.message_type.add(name=name)
    for (fname, num, ftype, label, tname) in fields:
        f = m.field.add(name=fname, number=num, type=ftype, label=label)
        if tname: f.type_name = tname
    return m

OPT, REP = F.LABEL_OPTIONAL, F.LABEL_REPEATED
msg('StopTimeEvent', [('delay',1,F.TYPE_INT32,OPT,None),('time',2,F.TYPE_INT64,OPT,None),('uncertainty',3,F.TYPE_INT32,OPT,None)])
msg('StopTimeUpdate', [('stop_sequence',1,F.TYPE_UINT32,OPT,None),('arrival',2,F.TYPE_MESSAGE,OPT,'.transit_realtime.StopTimeEvent'),
    ('departure',3,F.TYPE_MESSAGE,OPT,'.transit_realtime.StopTimeEvent'),('stop_id',4,F.TYPE_STRING,OPT,None),('schedule_relationship',5,F.TYPE_INT32,OPT,None)])
msg('TripDescriptor', [('trip_id',1,F.TYPE_STRING,OPT,None),('start_time',2,F.TYPE_STRING,OPT,None),('start_date',3,F.TYPE_STRING,OPT,None),
    ('schedule_relationship',4,F.TYPE_INT32,OPT,None),('route_id',5,F.TYPE_STRING,OPT,None),('direction_id',6,F.TYPE_UINT32,OPT,None)])
msg('VehicleDescriptor', [('id',1,F.TYPE_STRING,OPT,None),('label',2,F.TYPE_STRING,OPT,None),('extra',1007,F.TYPE_STRING,OPT,None)])
msg('TripUpdate', [('trip',1,F.TYPE_MESSAGE,OPT,'.transit_realtime.TripDescriptor'),('stop_time_update',2,F.TYPE_MESSAGE,REP,'.transit_realtime.StopTimeUpdate'),
    ('vehicle',3,F.TYPE_MESSAGE,OPT,'.transit_realtime.VehicleDescriptor'),('timestamp',4,F.TYPE_UINT64,OPT,None),('delay',5,F.TYPE_INT32,OPT,None),
    ('unknown_double',900,F.TYPE_DOUBLE,OPT,None),('unknown_fixed32',901,F.TYPE_FIXED32,OPT,None)])
msg('FeedHeader', [('gtfs_realtime_version',1,F.TYPE_STRING,OPT,None),('incrementality',2,F.TYPE_INT32,OPT,None),('timestamp',3,F.TYPE_UINT64,OPT,None)])
msg('FeedEntity', [('id',1,F.TYPE_STRING,OPT,None),('is_deleted',2,F.TYPE_BOOL,OPT,None),('trip_update',3,F.TYPE_MESSAGE,OPT,'.transit_realtime.TripUpdate')])
msg('FeedMessage', [('header',1,F.TYPE_MESSAGE,OPT,'.transit_realtime.FeedHeader'),('entity',2,F.TYPE_MESSAGE,REP,'.transit_realtime.FeedEntity')])

pool = descriptor_pool.DescriptorPool(); pool.Add(fd)
FeedMessage = message_factory.GetMessageClass(pool.FindMessageTypeByName('transit_realtime.FeedMessage'))

def main():
    global fm
    NOW = 1791700000  # 2026-10-11T04:26:40Z
    fm = FeedMessage()
    fm.header.gtfs_realtime_version = '2.0'; fm.header.timestamp = NOW

    def trip(eid, route, trip_id, stops, sr=None, start_date='20261011', tu_delay=None, extras=False, ts=None):
        e = fm.entity.add(id=eid)
        tu = e.trip_update
        tu.trip.trip_id = trip_id; tu.trip.start_date = start_date
        if route is not None: tu.trip.route_id = route
        if sr is not None: tu.trip.schedule_relationship = sr
        if tu_delay is not None: tu.delay = tu_delay
        if extras:
            tu.vehicle.id = 'V1'; tu.vehicle.extra = 'tfnsw extension'
            tu.unknown_double = 3.25; tu.unknown_fixed32 = 7
        tu.timestamp = NOW - 5 if ts is None else ts
        for i, (t_off, delay, kind, rel) in enumerate(stops):
            s = tu.stop_time_update.add(stop_sequence=i+1, stop_id=f'S{i}')
            if rel is not None: s.schedule_relationship = rel
            ev = s.departure if kind == 'dep' else s.arrival
            if t_off is not None: ev.time = NOW + t_off
            if delay is not None: ev.delay = delay
        return e

    # T1: running 6 min late (passed a stop 2 min ago with +360s)
    trip('e1', 'T1_route', 'T1.trip.1', [(-600, 300, 'dep', None), (-120, 360, 'dep', None), (300, 360, 'arr', None)], extras=True)
    # T1: early (negative delay), counts as 0 lateness
    trip('e2', 'T1_route', 'T1.trip.2', [(-60, -45, 'dep', None), (240, -30, 'arr', None)])
    # T1: not started yet (first stop 40 min away) -> not active
    trip('e3', 'T1_route', 'T1.trip.3', [(2400, 0, 'dep', None)])
    # T1: cancelled
    trip('e4', 'T1_route', 'T1.trip.4', [(600, None, 'dep', None)], sr=3)
    # BMT via trips map only (no route_id): 12 min late, skipped stop ignored
    trip('e5', None, 'BMT.trip.9', [(-300, 9999, 'dep', 1), (-200, 720, 'dep', None), (500, 700, 'arr', None)])
    # Unknown route
    trip('e6', 'RTTA_DEF', 'X.trip', [(-30, 60, 'dep', None)])
    # Trip whose stops have time but no delay -> falls back to trip-level delay 90s
    trip('e7', 'T1_route', 'T1.trip.5', [(-100, None, 'dep', None), (200, None, 'arr', None)], tu_delay=90)
    # Finished trip (last stop 30 min ago) -> not active
    trip('e8', 'T1_route', 'T1.trip.6', [(-1800, 500, 'arr', None)])
    # Huge negative int32 and big int64 edge values survive decoding
    trip('e9', 'T9_route', 'T9.trip.1', [(-10, -2147483648, 'dep', None), (100, 2147483647, 'arr', None)])

    # Delay-only trips (no times), as Sydney Trains publishes them: fresh → running, stale → ignored
    trip('e10', 'T1_route', 'T1.trip.7', [(None, 200, 'dep', None), (None, 260, 'arr', None)], ts=NOW - 60)
    trip('e11', 'T1_route', 'T1.trip.8', [(None, 900, 'dep', None)], ts=NOW - 3600)

    out = os.path.dirname(os.path.abspath(__file__))
    open(os.path.join(out, 'tripupdates.pb'), 'wb').write(fm.SerializeToString())
    json.dump(MessageToDict(fm, preserving_proto_field_name=True), open(os.path.join(out, 'tripupdates.json'), 'w'), indent=1)
    print('wrote', len(fm.SerializeToString()), 'bytes')

if __name__ == '__main__':
    main()
