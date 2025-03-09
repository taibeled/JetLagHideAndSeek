// This script processes GTFS data to extract bus stops for specific routes
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import csv from 'csv-parser';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Route IDs for Corridors (C1, C2, C3, C4) from Dublin Bus
const corridorRouteIds = [
  '4525_90529', // C1
  '4525_90530', // C2
  '4525_90531', // C3
  '4525_90532', // C4
];

// Route IDs for Orbitals (N, S, W routes) from Dublin Bus and Go-Ahead
const orbitalRouteMap = {
  N2: '4466_86737',
  N4: '4525_90542',
  N6: '4466_86738',
  S2: '4525_90543',
  S4: '4466_86739',
  S6: '4466_86740',
  S8: '4466_86741',
  W2: '4466_86742',
};

const orbitalRouteIds = Object.values(orbitalRouteMap);
const orbitalDublinBusRouteIds = [orbitalRouteMap.N4, orbitalRouteMap.S2];
const orbitalGoAheadRouteIds = [
  orbitalRouteMap.N2,
  orbitalRouteMap.N6,
  orbitalRouteMap.S4,
  orbitalRouteMap.S6,
  orbitalRouteMap.S8,
  orbitalRouteMap.W2,
];

// Route IDs for Irish Rail (DART)
const dartRouteIds = [
  '4452_86289', // DART
];

// Route IDs for Luas
const luasGreenLineRouteIds = [
  '4419_48886', // Green Line
];

const luasRedLineRouteIds = [
  '4419_48887', // Red Line
];

// All target route IDs
const allRouteIds = [
  ...corridorRouteIds,
  ...orbitalRouteIds,
  ...dartRouteIds,
  ...luasGreenLineRouteIds,
  ...luasRedLineRouteIds,
];

// Map of route IDs to route short names
const routeIdToName = {
  '4525_90529': 'C1',
  '4525_90530': 'C2',
  '4525_90531': 'C3',
  '4525_90532': 'C4',
  '4525_90542': 'N4',
  '4525_90543': 'S2',
  '4466_86737': 'N2',
  '4466_86738': 'N6',
  '4466_86739': 'S4',
  '4466_86740': 'S6',
  '4466_86741': 'S8',
  '4466_86742': 'W2',
  '4452_86289': 'DART',
  '4419_48886': 'Luas Green Line',
  '4419_48887': 'Luas Red Line',
};

// Function to read CSV files
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// For rail stations, we want to include all of them regardless of position
// For bus stops, we want to include only every 2nd stop
function shouldIncludeStop(
  stopId,
  isRail = false,
  routeId = null,
  stopIndex = -1
) {
  if (isRail) {
    return true; // Include all rail stations
  }

  // Include only every 2nd stop in a route
  return stopIndex % 2 === 0;
}

async function processGTFSData() {
  try {
    // Process Dublin Bus data for all routes
    const dublinBusDir = path.join(__dirname, 'GTFS_Dublin_Bus');
    const dublinBusStopsData = await processGTFSDataForProvider(
      dublinBusDir,
      [...corridorRouteIds, ...orbitalDublinBusRouteIds],
      false
    );

    // Process Go-Ahead data for orbital routes
    const goAheadDir = path.join(__dirname, 'GTFS_GoAhead');
    const goAheadStopsData = await processGTFSDataForProvider(
      goAheadDir,
      orbitalGoAheadRouteIds,
      false
    );

    // Process Irish Rail data for DART
    const irishRailDir = path.join(__dirname, 'GTFS_Irish_Rail');
    const dartStopsData = await processGTFSDataForProvider(
      irishRailDir,
      dartRouteIds,
      true
    );

    // Process Luas data for Green and Red lines
    const luasDir = path.join(__dirname, 'GTFS_LUAS');
    const luasGreenLineStopsData = await processGTFSDataForProvider(
      luasDir,
      luasGreenLineRouteIds,
      true
    );
    const luasRedLineStopsData = await processGTFSDataForProvider(
      luasDir,
      luasRedLineRouteIds,
      true
    );

    // Combine all stops data
    const allStopsData = [
      ...dublinBusStopsData,
      ...goAheadStopsData,
      ...dartStopsData,
      ...luasGreenLineStopsData,
      ...luasRedLineStopsData,
    ];

    // Merge stops with the same ID (they might be on multiple routes)
    const stopsMap = new Map();

    allStopsData.forEach((stopData) => {
      const { stop, routes } = stopData;
      const stopId = stop.stop_id;

      if (stopsMap.has(stopId)) {
        // Merge routes for existing stop
        const existingStopData = stopsMap.get(stopId);
        existingStopData.routes = [
          ...new Set([...existingStopData.routes, ...routes]),
        ];
      } else {
        // Add new stop
        stopsMap.set(stopId, { stop, routes });
      }
    });

    // Convert map to array
    const mergedStopsData = Array.from(stopsMap.values());

    console.log(`Total unique stops after merging: ${mergedStopsData.length}`);

    // Separate stops into different groups
    const corridorStops = [];
    const orbitalStops = {};
    const dartStops = [];
    const luasGreenLineStops = [];
    const luasRedLineStops = [];

    // Initialize orbital stops for each route
    Object.keys(orbitalRouteMap).forEach((routeName) => {
      orbitalStops[routeName] = [];
    });

    mergedStopsData.forEach((stopData) => {
      const { stop, routes } = stopData;

      // Check if stop is on any corridor routes
      const corridorRoutes = routes.filter((routeId) =>
        corridorRouteIds.includes(routeId)
      );

      // Check if stop is on DART
      const dartRoutes = routes.filter((routeId) =>
        dartRouteIds.includes(routeId)
      );

      // Check if stop is on Luas Green Line
      const luasGreenLineRoutes = routes.filter((routeId) =>
        luasGreenLineRouteIds.includes(routeId)
      );

      // Check if stop is on Luas Red Line
      const luasRedLineRoutes = routes.filter((routeId) =>
        luasRedLineRouteIds.includes(routeId)
      );

      // Add to corridor stops if it's on any corridor routes
      if (corridorRoutes.length > 0) {
        corridorStops.push({
          stop,
          routes: corridorRoutes,
        });
      }

      // Add to specific orbital route stops
      Object.entries(orbitalRouteMap).forEach(([routeName, routeId]) => {
        if (routes.includes(routeId)) {
          orbitalStops[routeName].push({
            stop,
            routes: [routeId],
          });
        }
      });

      // Add to DART stops if it's on DART
      if (dartRoutes.length > 0) {
        dartStops.push({
          stop,
          routes: dartRoutes,
        });
      }

      // Add to Luas Green Line stops if it's on Luas Green Line
      if (luasGreenLineRoutes.length > 0) {
        luasGreenLineStops.push({
          stop,
          routes: luasGreenLineRoutes,
        });
      }

      // Add to Luas Red Line stops if it's on Luas Red Line
      if (luasRedLineRoutes.length > 0) {
        luasRedLineStops.push({
          stop,
          routes: luasRedLineRoutes,
        });
      }
    });

    console.log(`Corridor stops: ${corridorStops.length}`);
    Object.entries(orbitalStops).forEach(([routeName, stops]) => {
      console.log(`${routeName} stops: ${stops.length}`);
    });
    console.log(`DART stops: ${dartStops.length}`);
    console.log(`Luas Green Line stops: ${luasGreenLineStops.length}`);
    console.log(`Luas Red Line stops: ${luasRedLineStops.length}`);

    // Create GeoJSON for all stops (combined)
    createAndSaveGeoJSON(
      mergedStopsData,
      'customBusRoutes.json',
      'custom_bus_routes.geojson'
    );

    // Create GeoJSON for corridor stops
    createAndSaveGeoJSON(
      corridorStops,
      'corridorBusRoutes.json',
      'corridor_bus_routes.geojson'
    );

    // Create GeoJSON for each orbital route
    Object.entries(orbitalStops).forEach(([routeName, stops]) => {
      createAndSaveGeoJSON(
        stops,
        `${routeName.toLowerCase()}BusRoutes.json`,
        `${routeName.toLowerCase()}_bus_routes.geojson`
      );
    });

    // Create GeoJSON for DART stops
    createAndSaveGeoJSON(dartStops, 'dartStops.json', 'dart_stops.geojson');

    // Create GeoJSON for Luas Green Line stops
    createAndSaveGeoJSON(
      luasGreenLineStops,
      'luasGreenLineStops.json',
      'luas_green_line_stops.geojson'
    );

    // Create GeoJSON for Luas Red Line stops
    createAndSaveGeoJSON(
      luasRedLineStops,
      'luasRedLineStops.json',
      'luas_red_line_stops.geojson'
    );

    console.log('GeoJSON files created successfully!');
  } catch (error) {
    console.error('Error processing GTFS data:', error);
  }
}

// Helper function to create and save GeoJSON
function createAndSaveGeoJSON(stopsData, jsonFileName, geojsonFileName) {
  // Create GeoJSON for the stops
  const features = stopsData.map((stopData) => {
    const { stop, routes } = stopData;
    const routeNames = routes.map((routeId) => routeIdToName[routeId]).sort();
    const routesString = routeNames.join(', ');

    return {
      type: 'Feature',
      properties: {
        id: stop.stop_id,
        name: `${stop.stop_name} (${routesString})`,
        routes: routesString,
      },
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(stop.stop_lon), parseFloat(stop.stop_lat)],
      },
    };
  });

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  // Write GeoJSON to file in public directory
  fs.writeFileSync(
    path.join(__dirname, '..', '..', 'public', geojsonFileName),
    JSON.stringify(geojson, null, 2)
  );

  // Also write GeoJSON to a file that can be imported directly
  fs.writeFileSync(
    path.join(__dirname, jsonFileName),
    JSON.stringify(geojson, null, 2)
  );

  console.log(`Created ${jsonFileName} with ${features.length} stops`);
}

// Helper function to process GTFS data for a specific provider
async function processGTFSDataForProvider(dataDir, routeIds, isRail = false) {
  try {
    // Read routes data
    const routes = await readCSV(path.join(dataDir, 'routes.txt'));
    const targetRoutes = routes.filter((route) =>
      routeIds.includes(route.route_id)
    );

    console.log(
      `Target Routes for ${path.basename(dataDir)}:`,
      targetRoutes.map((r) => r.route_short_name)
    );

    // Read trips data
    const trips = await readCSV(path.join(dataDir, 'trips.txt'));

    // Create a map of trip ID to route ID
    const tripToRouteMap = {};
    trips.forEach((trip) => {
      if (routeIds.includes(trip.route_id)) {
        tripToRouteMap[trip.trip_id] = trip.route_id;
      }
    });

    const targetTrips = trips.filter((trip) =>
      routeIds.includes(trip.route_id)
    );
    console.log(
      `Found ${targetTrips.length} trips for target routes in ${path.basename(dataDir)}`
    );

    // Get a sample of trip IDs (first trip for each route)
    const sampleTripIds = [];
    routeIds.forEach((routeId) => {
      const routeTrips = targetTrips.filter(
        (trip) => trip.route_id === routeId
      );
      if (routeTrips.length > 0) {
        sampleTripIds.push(routeTrips[0].trip_id);
      }
    });

    console.log(
      `Sample Trip IDs for ${path.basename(dataDir)}:`,
      sampleTripIds
    );

    // Read stop times data for all trips
    const stopTimes = await readCSV(path.join(dataDir, 'stop_times.txt'));

    // Create a map of route ID to ordered stops
    const routeToOrderedStopsMap = {};

    // Initialize the map for each route
    routeIds.forEach((routeId) => {
      routeToOrderedStopsMap[routeId] = [];
    });

    // Group stop times by trip ID
    const tripStopTimes = {};
    stopTimes.forEach((stopTime) => {
      const tripId = stopTime.trip_id;
      if (tripToRouteMap[tripId]) {
        if (!tripStopTimes[tripId]) {
          tripStopTimes[tripId] = [];
        }
        tripStopTimes[tripId].push(stopTime);
      }
    });

    // Sort stop times by stop sequence for each trip
    Object.entries(tripStopTimes).forEach(([tripId, stopTimesList]) => {
      stopTimesList.sort(
        (a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence)
      );

      const routeId = tripToRouteMap[tripId];
      if (routeId && sampleTripIds.includes(tripId)) {
        // Add stops to the route's ordered stops list
        routeToOrderedStopsMap[routeId] = stopTimesList.map(
          (stopTime) => stopTime.stop_id
        );
      }
    });

    // Create a map of stop ID to the routes it belongs to
    const stopToRoutesMap = {};

    // For each route, add every 2nd stop to the map
    Object.entries(routeToOrderedStopsMap).forEach(
      ([routeId, orderedStops]) => {
        orderedStops.forEach((stopId, index) => {
          if (shouldIncludeStop(stopId, isRail, routeId, index)) {
            if (!stopToRoutesMap[stopId]) {
              stopToRoutesMap[stopId] = new Set();
            }
            stopToRoutesMap[stopId].add(routeId);
          }
        });
      }
    );

    // Get all stop IDs that are on our target routes
    const stopIds = Object.keys(stopToRoutesMap);

    console.log(
      `Found ${stopIds.length} unique stops in ${path.basename(dataDir)}`
    );

    // Read stops data
    const stops = await readCSV(path.join(dataDir, 'stops.txt'));

    // Filter stops to include only those in our stopIds list
    const targetStops = stops.filter((stop) => stopIds.includes(stop.stop_id));

    const filterDescription = isRail ? 'all stops' : 'every 2nd stop';
    console.log(
      `Found ${targetStops.length} stops for target routes (${filterDescription}) in ${path.basename(dataDir)}`
    );

    // Create an array of stop data objects with routes information
    const stopsData = targetStops.map((stop) => ({
      stop,
      routes: Array.from(stopToRoutesMap[stop.stop_id] || []),
    }));

    return stopsData;
  } catch (error) {
    console.error(
      `Error processing GTFS data for ${path.basename(dataDir)}:`,
      error
    );
    return [];
  }
}

processGTFSData();
