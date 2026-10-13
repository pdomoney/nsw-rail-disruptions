// TfNSW Open Data endpoints. Where TfNSW has moved a feed between API versions,
// several candidate paths are listed and the first one that answers is used.

export const API_BASE = 'https://api.transport.nsw.gov.au';

// Trip Planner service alerts (the same source the transportnsw.info alerts page uses).
export const ADD_INFO = {
  path: '/v1/tp/add_info',
  params: {
    outputFormat: 'rapidJSON',
    coordOutputFormat: 'EPSG:4326',
    TfNSWAI: 'true',
    AIXMLReduction: 'removeSourceSystem',
    version: '10.2.2.48',
  },
};

// GTFS-realtime trip updates, the matching static timetables (used to map trips to lines and to
// know which trips were scheduled each day) and vehicle positions (measured occupancy where
// published; elsewhere checked hourly for diagnostics).
export const FEEDS = [
  {
    key: 'sydneytrains',
    label: 'Sydney Trains and Intercity',
    realtime: ['/v2/gtfs/realtime/sydneytrains'],
    schedule: ['/v2/gtfs/schedule/sydneytrains', '/v1/gtfs/schedule/sydneytrains'],
    vehiclePositions: ['/v2/gtfs/vehiclepos/sydneytrains', '/v1/gtfs/vehiclepos/sydneytrains'],
    vehicleOccupancy: true, // vehicle positions carry measured occupancy: fetched every run
    defaultLine: null,
  },
  {
    key: 'metro',
    label: 'Sydney Metro',
    realtime: ['/v2/gtfs/realtime/metro'],
    schedule: ['/v2/gtfs/schedule/metro', '/v1/gtfs/schedule/metro'],
    vehiclePositions: ['/v2/gtfs/vehiclepos/metro', '/v1/gtfs/vehiclepos/metro'],
    vehicleOccupancy: true, // vehicle positions carry measured occupancy: fetched every run
    defaultLine: 'M1',
  },
  {
    key: 'lr-innerwest',
    label: 'Inner West Light Rail (L1)',
    realtime: ['/v2/gtfs/realtime/lightrail/innerwest', '/v1/gtfs/realtime/lightrail/innerwest'],
    schedule: ['/v2/gtfs/schedule/lightrail/innerwest', '/v1/gtfs/schedule/lightrail/innerwest'],
    vehiclePositions: ['/v2/gtfs/vehiclepos/lightrail/innerwest', '/v1/gtfs/vehiclepos/lightrail/innerwest'],
    defaultLine: 'L1',
  },
  {
    key: 'lr-cbdandsoutheast',
    label: 'CBD and South East Light Rail (L2, L3)',
    realtime: ['/v1/gtfs/realtime/lightrail/cbdandsoutheast'],
    schedule: ['/v1/gtfs/schedule/lightrail/cbdandsoutheast'],
    vehiclePositions: ['/v1/gtfs/vehiclepos/lightrail/cbdandsoutheast'],
    defaultLine: null,
  },
  {
    key: 'lr-parramatta',
    label: 'Parramatta Light Rail (L4)',
    realtime: ['/v1/gtfs/realtime/lightrail/parramatta'],
    schedule: ['/v1/gtfs/schedule/lightrail/parramatta'],
    vehiclePositions: ['/v1/gtfs/vehiclepos/lightrail/parramatta'],
    vehicleOccupancy: true, // vehicle positions carry measured occupancy: fetched every run
    defaultLine: 'L4',
  },
  {
    key: 'lr-newcastle',
    label: 'Newcastle Light Rail',
    realtime: ['/v1/gtfs/realtime/lightrail/newcastle'],
    schedule: ['/v1/gtfs/schedule/lightrail/newcastle'],
    vehiclePositions: ['/v1/gtfs/vehiclepos/lightrail/newcastle'],
    vehicleOccupancy: true, // vehicle positions carry measured occupancy: fetched every run
    defaultLine: 'NLR',
  },
];
