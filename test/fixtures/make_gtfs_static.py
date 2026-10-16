"""Generates test/fixtures/gtfs-static.zip, a tiny static GTFS bundle.
Run: python3 test/fixtures/make_gtfs_static.py  (only needed when changing the fixture).
stops.txt is stored uncompressed and stop_times.txt starts with a byte-order mark, to exercise the readers."""
import os, zipfile

FILES = {
    'routes.txt': '''route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_color
T1_route,SydneyTrains,T1,"North Shore & Western Line, City to Emu Plains",Sydney Trains Network,2,F99D1C
BMT_1,SydneyTrains,BMT,Blue Mountains Line,Intercity Trains Network,2,F99D1C
T9_route,SydneyTrains,T9,Northern Line,Sydney Trains Network,2,D11F2F
RTTA_DEF,SydneyTrains,,Non Revenue,,2,
''',
    'trips.txt': '''route_id,service_id,trip_id,trip_headsign,direction_id,vehicle_category_id,shape_id
T1_route,s1,T1.trip.1,"Emu Plains, via Strathfield",0,B8,sh1
T1_route,s2,T1.trip.2,Hornsby,1,,sh1r
BMT_1,s1,BMT.trip.9,Lithgow,0,H4,sh1
T9_route,s3,T9.trip.1,Gordon,1,B8,
RTTA_DEF,s1,X.trip,Empty,0,B8,shx
''',
    # Central → Strathfield, with a point in a straight line that simplification drops, and the same
    # track the other way round (shared track is stored once).
    'shapes.txt': '''shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence
sh1,-33.8832,151.2061,1
sh1,-33.8800,151.1500,3
sh1,-33.8816,151.17805,2
sh1,-33.8730,151.0940,4
sh1r,-33.8730,151.0940,1
sh1r,-33.8800,151.1500,2
sh1r,-33.8832,151.2061,3
shx,-33.9000,151.0000,1
shx,-33.9100,151.0100,2
''',
    # Train consists (Sydney Trains publishes these): an 8-car and a 4-car set.
    'vehicle_categories.txt': '''vehicle_category_id,vehicle_category_name
B8,8 car Waratah Series 2
Bcar,Individual Waratah Series 2 car
H4,4 car OSCAR
''',
    'vehicle_couplings.txt': 'parent_id,child_id,child_sequence,child_label\n' + ''.join(f'B8,Bcar,{i},{i}\n' for i in range(1, 9)) + ''.join(f'H4,Hcar,{i},{i}\n' for i in range(1, 5)),
    # Forecast occupancy per stop and day of week: T1.trip.1 averages level 2 on weekdays, 5 on Saturdays.
    'occupancies.txt': '''"trip_id","stop_sequence","occupancy_status","monday","tuesday","wednesday","thursday","friday","saturday","sunday","start_date","end_date","exception"
"T1.trip.1","1","1","1","1","1","1","1","0","0","20261001","","0"
"T1.trip.1","2","3","1","1","1","1","1","0","0","20261001","","0"
"T1.trip.1","1","5","0","0","0","0","0","1","0","20261001","","0"
"X.trip","1","4","1","1","1","1","1","1","1","20261001","","0"
''',
    'agency.txt': '''agency_id,agency_name
SydneyTrains,Sydney Trains
''',
    'stops.txt': '''stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
200060,Central Station,-33.88,151.20,1,
2000331,"Central Station, Platform 18",-33.88,151.20,0,200060
2000332,"Central Station, Platform 19",-33.88,151.20,0,200060
213510,Strathfield Station,-33.87,151.09,1,
2135111,"Strathfield Station, Platform 1",-33.87,151.09,0,213510
278010,Lithgow Station,-33.48,150.15,1,
2780101,"Lithgow Station, Platform 1",-33.48,150.15,0,278010
207710,Hornsby Station,-33.70,151.10,1,
2077101,"Hornsby Station, Platform 1",-33.70,151.10,0,207710
999999,Yard,-33.9,151.0,0,
''',
    # T1.trip.2 runs after midnight (times past 24:00) and its rows are out of order.
    'stop_times.txt': '''﻿trip_id,arrival_time,departure_time,stop_id,stop_sequence
T1.trip.1,10:00:00,10:00:00,2000331,1
T1.trip.1,10:15:00,10:15:00,2135111,2
BMT.trip.9,10:00:00,10:00:00,2000332,1
BMT.trip.9,10:16:00,10:16:00,2135111,2
BMT.trip.9,12:00:00,12:00:00,2780101,3
T9.trip.1,10:05:00,10:05:00,2000331,1
X.trip,10:00:00,10:00:00,999999,1
T1.trip.2,25:10:00,25:10:00,2077101,3
T1.trip.2,24:30:00,24:31:00,2135111,1
T1.trip.2,,,2000332,2
''',
    # s1 weekdays in October except Monday 12 October; s2 weekends; s3 only on Sunday 11 October.
    'calendar.txt': '''service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
s1,1,1,1,1,1,0,0,20261001,20261031
s2,0,0,0,0,0,1,1,20261001,20261031
''',
    'calendar_dates.txt': '''service_id,date,exception_type
s1,20261012,2
s3,20261011,1
''',
}


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gtfs-static.zip')
    with zipfile.ZipFile(out, 'w') as z:
        for name, text in FILES.items():
            z.writestr(name, text.encode('utf-8'), zipfile.ZIP_STORED if name == 'stops.txt' else zipfile.ZIP_DEFLATED)
    print('wrote', out)


if __name__ == '__main__':
    main()
