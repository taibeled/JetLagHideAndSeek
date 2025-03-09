// This script processes GTFS data to generate KML files for radial bus routes
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import csv from 'csv-parser';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define route colors and pin colors
const routeColors = {
  // Bus routes
  N2: 'ff00aaff', // Orange-yellow
  N4: 'ff00d7ff', // Light orange
  N6: 'ffff0000', // Blue
  S2: 'ff00ffff', // Yellow
  S4: 'ffff00ff', // Magenta
  S6: 'ffffff00', // Cyan
  S8: 'ff7f00ff', // Purple
  W2: 'ffff7f00', // Orange

  // Core Spine Routes
  G1: 'ff4b0082', // Indigo
  G2: 'ff4b0082', // Indigo (same as G1)
  H1: 'ff8b4513', // Saddle Brown
  H2: 'ff8b4513', // Saddle Brown (same as H1)
  H3: 'ff8b4513', // Saddle Brown (same as H1)
  C1: 'ff483d8b', // Dark Slate Blue
  C2: 'ff483d8b', // Dark Slate Blue (same as C1)
  C3: 'ff483d8b', // Dark Slate Blue (same as C1)
  C4: 'ff483d8b', // Dark Slate Blue (same as C1)
  E1: 'ff2f4f4f', // Dark Slate Gray
  E2: 'ff2f4f4f', // Dark Slate Gray (same as E1)

  // Additional High-Frequency Routes
  1: 'ff8fbc8f', // Dark Sea Green
  39: 'ff9370db', // Medium Purple
  15: 'ffa0522d', // Sienna
  16: 'ff66cdaa', // Medium Aquamarine

  // Rail routes
  DART: 'ffadd8e6', // Light blue
  LuasGreen: 'ff90ee90', // Light green
  LuasRed: 'ff0000ff', // Red
};

// Map route names to pin colors for Google MyMaps
const pinColors = {
  // Bus routes
  N2: 'ylw', // Yellow
  N4: 'wht', // White
  N6: 'blu', // Blue
  S2: 'ylw', // Yellow
  S4: 'pink', // Pink/Magenta
  S6: 'ltblu', // Light Blue/Cyan
  S8: 'purple', // Purple
  W2: 'orange', // Orange

  // Core Spine Routes
  G1: 'purple-dk', // Dark Purple
  G2: 'purple-dk', // Dark Purple (same as G1)
  H1: 'brown', // Brown
  H2: 'brown', // Brown (same as H1)
  H3: 'brown', // Brown (same as H1)
  C1: 'blu-dk', // Dark Blue
  C2: 'blu-dk', // Dark Blue (same as C1)
  C3: 'blu-dk', // Dark Blue (same as C1)
  C4: 'blu-dk', // Dark Blue (same as C1)
  E1: 'grn-dk', // Dark Green
  E2: 'grn-dk', // Dark Green (same as E1)

  // Additional High-Frequency Routes
  1: 'grn', // Green
  39: 'purple', // Purple
  15: 'red', // Red
  16: 'cyan', // Cyan

  // Rail routes
  DART: 'ltblu', // Light blue
  LuasGreen: 'grn', // Green
  LuasRed: 'red', // Red
};

// Route IDs for Orbitals (N, S, W routes) from Dublin Bus and Go-Ahead
const orbitalRouteMap = {
  N2: '4466_86737', // GoAhead
  N4: '4525_90542', // Dublin Bus
  N6: '4466_86738', // GoAhead
  S2: '4525_90543', // Dublin Bus
  S4: '4466_86739', // GoAhead
  S6: '4466_86740', // GoAhead
  S8: '4466_86741', // GoAhead
  W2: '4466_86742', // GoAhead

  // Core Spine Routes
  G1: '4525_90537', // Dublin Bus
  G2: '4525_90538', // Dublin Bus
  H1: '4525_90539', // Dublin Bus
  H2: '4525_90540', // Dublin Bus
  H3: '4525_90541', // Dublin Bus
  C1: '4525_90529', // Dublin Bus
  C2: '4525_90530', // Dublin Bus
  C3: '4525_90531', // Dublin Bus
  C4: '4525_90532', // Dublin Bus
  E1: '4525_90535', // Dublin Bus
  E2: '4525_90536', // Dublin Bus

  // Additional High-Frequency Routes
  1: '4525_90515', // Dublin Bus
  39: '4525_90465', // Dublin Bus
  15: '4525_90443', // Dublin Bus
  16: '4525_90444', // Dublin Bus

  // Rail routes
  DART: '4452_86289', // Irish Rail
  LuasGreen: '4419_48886', // Luas Green Line
  LuasRed: '4419_48887', // Luas Red Line
};

// Map routes to their providers
const routeProviders = {
  N2: 'GoAhead',
  N4: 'DublinBus',
  N6: 'GoAhead',
  S2: 'DublinBus',
  S4: 'GoAhead',
  S6: 'GoAhead',
  S8: 'GoAhead',
  W2: 'GoAhead',

  // Core Spine Routes
  G1: 'DublinBus',
  G2: 'DublinBus',
  H1: 'DublinBus',
  H2: 'DublinBus',
  H3: 'DublinBus',
  C1: 'DublinBus',
  C2: 'DublinBus',
  C3: 'DublinBus',
  C4: 'DublinBus',
  E1: 'DublinBus',
  E2: 'DublinBus',

  // Additional High-Frequency Routes
  1: 'DublinBus',
  39: 'DublinBus',
  15: 'DublinBus',
  16: 'DublinBus',

  // Rail routes
  DART: 'IrishRail',
  LuasGreen: 'Luas',
  LuasRed: 'Luas',
};

// Define known starting and ending points for each route
const routeEndpoints = {
  N2: {
    start: 'Clontarf Road Station',
    end: 'Heuston Station',
  },
  N4: {
    start: 'Point Village',
    end: 'Blanchardstown Shopping Centre',
  },
  N6: {
    start: 'Finglas Village',
    end: 'Blackrock Station',
  },
  S2: {
    start: 'Sean Moore Road',
    end: 'Heuston Station',
  },
  S4: {
    start: 'Liffey Valley Shopping Centre',
    end: 'Monkstown Avenue',
  },
  S6: {
    start: 'Tallaght',
    end: 'Blackrock',
  },
  S8: {
    start: 'Kingswood Avenue',
    end: 'Dun Laoghaire Station',
  },
  W2: {
    start: 'Liffey Valley Shopping Centre',
    end: 'UCD Belfield',
  },

  // Core Spine Routes
  G1: {
    start: 'Red Cow Luas',
    end: 'Spencer Dock',
  },
  G2: {
    start: 'Liffey Valley SC',
    end: 'Spencer Dock',
  },
  H1: {
    start: 'Baldoyle',
    end: 'Lower Abbey Street',
  },
  H2: {
    start: 'Malahide',
    end: 'Lower Abbey Street',
  },
  H3: {
    start: 'Howth Summit',
    end: 'Lower Abbey Street',
  },
  C1: {
    start: 'Adamstown Station',
    end: 'Sandymount',
  },
  C2: {
    start: 'Adamstown Station',
    end: 'Sandymount',
  },
  C3: {
    start: 'Maynooth',
    end: 'Ringsend',
  },
  C4: {
    start: 'Maynooth',
    end: 'Ringsend',
  },
  E1: {
    start: 'Ballywaltrim',
    end: 'Northwood',
  },
  E2: {
    start: 'Dun Laoghaire',
    end: 'Harristown',
  },

  // Additional High-Frequency Routes
  1: {
    start: 'Santry',
    end: 'Sandymount',
  },
  39: {
    start: 'Ongar',
    end: 'Burlington Road',
  },
  15: {
    start: 'Ballycullen Road',
    end: 'Clongriffin',
  },
  16: {
    start: 'Ballinteer',
    end: 'Dublin Airport',
  },

  // Rail routes
  DART: {
    start: 'Howth',
    end: 'Greystones',
  },
  LuasGreen: {
    start: 'Broombridge',
    end: 'Brides Glen',
  },
  LuasRed: {
    start: 'The Point',
    end: 'Tallaght/Saggart',
  },
};

// Function to read CSV file and return a Promise with the data
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

// Function to get the GTFS directory path for a route
function getGTFSDir(routeName) {
  const provider = routeProviders[routeName];
  if (provider === 'DublinBus') return path.join(__dirname, 'GTFS_Dublin_Bus');
  if (provider === 'GoAhead') return path.join(__dirname, 'GTFS_GoAhead');
  if (provider === 'IrishRail') return path.join(__dirname, 'GTFS_Irish_Rail');
  if (provider === 'Luas') return path.join(__dirname, 'GTFS_LUAS');
  return path.join(__dirname, 'GTFS_Dublin_Bus'); // Default fallback
}

// Function to get all trips for a route
async function getTripsForRoute(routeName) {
  const routeId = orbitalRouteMap[routeName];
  const gtfsDir = getGTFSDir(routeName);
  const tripsPath = path.join(gtfsDir, 'trips.txt');

  const trips = await readCSV(tripsPath);
  return trips.filter((trip) => trip.route_id === routeId);
}

// Function to get all stops for a trip
async function getStopsForTrip(tripId, gtfsDir) {
  const stopTimesPath = path.join(gtfsDir, 'stop_times.txt');
  const stopsPath = path.join(gtfsDir, 'stops.txt');

  // Read stop times and filter by trip ID
  const stopTimes = await readCSV(stopTimesPath);
  const tripStopTimes = stopTimes
    .filter((stopTime) => stopTime.trip_id === tripId)
    .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));

  // Read all stops
  const stops = await readCSV(stopsPath);

  // Map stop times to stop details
  const tripStops = tripStopTimes.map((stopTime) => {
    const stop = stops.find((s) => s.stop_id === stopTime.stop_id);
    return {
      id: stop.stop_id,
      name: stop.stop_name,
      lat: parseFloat(stop.stop_lat),
      lon: parseFloat(stop.stop_lon),
      sequence: parseInt(stopTime.stop_sequence),
    };
  });

  return tripStops;
}

// Function to get shape points for a trip
async function getShapeForTrip(tripId, gtfsDir) {
  const tripsPath = path.join(gtfsDir, 'trips.txt');
  const shapesPath = path.join(gtfsDir, 'shapes.txt');

  // Get the shape ID for the trip
  const trips = await readCSV(tripsPath);
  const trip = trips.find((t) => t.trip_id === tripId);
  if (!trip) return [];

  const shapeId = trip.shape_id;

  // Get all shape points for this shape ID
  const shapes = await readCSV(shapesPath);
  const shapePoints = shapes
    .filter((shape) => shape.shape_id === shapeId)
    .sort(
      (a, b) => parseInt(a.shape_pt_sequence) - parseInt(b.shape_pt_sequence)
    )
    .map((shape) => ({
      lat: parseFloat(shape.shape_pt_lat),
      lon: parseFloat(shape.shape_pt_lon),
      sequence: parseInt(shape.shape_pt_sequence),
    }));

  return shapePoints;
}

// Function to find the best representative trip for a route
async function findBestTripForRoute(routeName) {
  const trips = await getTripsForRoute(routeName);
  if (trips.length === 0) return null;

  // For simplicity, we'll use the first trip
  // In a more sophisticated version, we could select a trip based on time of day, etc.
  return trips[0].trip_id;
}

// Function to process a route and generate a GeoJSON feature collection
async function processRoute(routeName) {
  try {
    console.log(`Processing route ${routeName}...`);

    const gtfsDir = getGTFSDir(routeName);
    const tripId = await findBestTripForRoute(routeName);

    if (!tripId) {
      console.error(`No trips found for route ${routeName}`);
      return null;
    }

    // Get stops and shape for this trip
    const stops = await getStopsForTrip(tripId, gtfsDir);
    const shapePoints = await getShapeForTrip(tripId, gtfsDir);

    // Create GeoJSON features for stops
    const features = stops.map((stop) => ({
      type: 'Feature',
      properties: {
        id: stop.id,
        name: `${stop.name} (${routeName})`,
        routes: routeName,
      },
      geometry: {
        type: 'Point',
        coordinates: [stop.lon, stop.lat],
      },
    }));

    // Order the stops based on the route endpoints
    const orderedFeatures = orderStopsForRoute(features, routeName);

    // Create a GeoJSON feature collection
    const featureCollection = {
      type: 'FeatureCollection',
      features: orderedFeatures,
    };

    // Create a shape line from the shape points
    const shapeLine = shapePoints.map((point) => [point.lon, point.lat]);

    return { featureCollection, shapeLine };
  } catch (error) {
    console.error(`Error processing route ${routeName}:`, error);
    return null;
  }
}

// Function to order stops for a route based on endpoints
function orderStopsForRoute(features, routeName) {
  // If we have defined endpoints for this route
  if (routeEndpoints[routeName]) {
    const { start, end } = routeEndpoints[routeName];

    // Find start and end features
    let startFeature = features.find((f) => f.properties.name.includes(start));
    let endFeature = features.find((f) => f.properties.name.includes(end));

    // If we couldn't find exact matches, try partial matches
    if (!startFeature) {
      startFeature = features.find((f) =>
        start
          .split(' ')
          .some((word) => word.length > 3 && f.properties.name.includes(word))
      );
    }

    if (!endFeature) {
      endFeature = features.find((f) =>
        end
          .split(' ')
          .some((word) => word.length > 3 && f.properties.name.includes(word))
      );
    }

    // If we still couldn't find matches, use the first and last features
    if (!startFeature) startFeature = features[0];
    if (!endFeature) endFeature = features[features.length - 1];

    // Order the stops between start and end
    const orderedFeatures = [startFeature];
    const remainingFeatures = features.filter(
      (f) => f !== startFeature && f !== endFeature
    );

    // Use a greedy algorithm to order the remaining stops
    let currentFeature = startFeature;

    while (remainingFeatures.length > 0) {
      const [currentLon, currentLat] = currentFeature.geometry.coordinates;

      // Find the nearest feature
      let nearestIndex = 0;
      let minDistance = Infinity;

      for (let i = 0; i < remainingFeatures.length; i++) {
        const [lon, lat] = remainingFeatures[i].geometry.coordinates;
        const distance = calculateDistance(currentLat, currentLon, lat, lon);

        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
        }
      }

      // Add the nearest feature to the ordered list
      currentFeature = remainingFeatures[nearestIndex];
      orderedFeatures.push(currentFeature);

      // Remove the nearest feature from the remaining list
      remainingFeatures.splice(nearestIndex, 1);
    }

    // Add the end feature if it's not already included
    if (!orderedFeatures.includes(endFeature)) {
      orderedFeatures.push(endFeature);
    }

    return orderedFeatures;
  }

  // If no endpoints defined, return the original features
  return features;
}

// Function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Function to smooth a route line by adding intermediate points
function smoothRouteLine(coordinates) {
  if (coordinates.length <= 1) return coordinates;

  const smoothedCoordinates = [];

  // Add the first point
  smoothedCoordinates.push(coordinates[0]);

  // For each pair of consecutive points
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];

    // Calculate distance between points
    const distance = calculateDistance(lat1, lon1, lat2, lon2);

    // If distance is greater than 1km, add intermediate points
    if (distance > 1) {
      const numPoints = Math.ceil(distance);

      for (let j = 1; j < numPoints; j++) {
        const fraction = j / numPoints;
        const intermediateLon = lon1 + (lon2 - lon1) * fraction;
        const intermediateLat = lat1 + (lat2 - lat1) * fraction;
        smoothedCoordinates.push([intermediateLon, intermediateLat]);
      }
    }

    // Add the second point
    smoothedCoordinates.push([lon2, lat2]);
  }

  return smoothedCoordinates;
}

// Function to convert GeoJSON to KML
function convertToKML(routeName, featureCollection, shapeLine) {
  const features = featureCollection.features;

  // Smooth the shape line
  const smoothedShapeLine = smoothRouteLine(shapeLine);

  // Start KML document
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${routeName} Route</name>
    <description>Stops for ${routeName} route</description>
    
    <!-- Style for the route -->
    <Style id="routeStyle">
      <LineStyle>
        <color>${routeColors[routeName]}</color>
        <width>4</width>
      </LineStyle>
    </Style>
    
    <!-- Style for the stops -->
    <Style id="stopStyle">
      <IconStyle>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/${pinColors[routeName]}-blank.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>
    
    <!-- Folder for stops -->
    <Folder>
      <name>${routeName} Stops</name>`;

  // Add placemarks for each stop in order
  features.forEach((feature, index) => {
    const { id, name } = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;

    kml += `
      <Placemark>
        <name>${index + 1}. ${name}</name>
        <description>Stop ID: ${id}</description>
        <styleUrl>#stopStyle</styleUrl>
        <Point>
          <coordinates>${longitude},${latitude},0</coordinates>
        </Point>
      </Placemark>`;
  });

  // Create a LineString for the route using the shape line
  kml += `
    </Folder>
    
    <!-- Route line -->
    <Placemark>
      <name>${routeName} Route Line</name>
      <styleUrl>#routeStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>`;

  // Add coordinates for the shape line
  smoothedShapeLine.forEach((coords) => {
    const [longitude, latitude] = coords;
    kml += `${longitude},${latitude},0 `;
  });

  // Close the KML document
  kml += `</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  return kml;
}

// Function to create a combined KML with all routes
function createCombinedKML(routeData) {
  // Start KML document
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>All Dublin Transport Routes</name>
    <description>All Dublin bus and rail routes with stops</description>`;

  // Add styles for each route
  Object.entries(routeColors).forEach(([route, color]) => {
    kml += `
    <Style id="${route}RouteStyle">
      <LineStyle>
        <color>${color}</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Style id="${route}StopStyle">
      <IconStyle>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/${pinColors[route]}-blank.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>`;
  });

  // Process each route
  for (const [routeName, data] of Object.entries(routeData)) {
    if (!data) continue;

    const { featureCollection, shapeLine } = data;
    const features = featureCollection.features;
    const smoothedShapeLine = smoothRouteLine(shapeLine);

    // Add folder for this route
    kml += `
    <Folder>
      <name>${routeName} Route</name>`;

    // Add placemarks for each stop in order
    features.forEach((feature, index) => {
      const { id, name } = feature.properties;
      const [longitude, latitude] = feature.geometry.coordinates;

      kml += `
      <Placemark>
        <name>${index + 1}. ${name}</name>
        <description>Stop ID: ${id}</description>
        <styleUrl>#${routeName}StopStyle</styleUrl>
        <Point>
          <coordinates>${longitude},${latitude},0</coordinates>
        </Point>
      </Placemark>`;
    });

    // Create a LineString for the route
    kml += `
      <Placemark>
        <name>${routeName} Route Line</name>
        <styleUrl>#${routeName}RouteStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>`;

    // Add coordinates for the shape line
    smoothedShapeLine.forEach((coords) => {
      const [longitude, latitude] = coords;
      kml += `${longitude},${latitude},0 `;
    });

    // Close the route
    kml += `</coordinates>
        </LineString>
      </Placemark>
    </Folder>`;
  }

  // Close the KML document
  kml += `
  </Document>
</kml>`;

  return kml;
}

// Function to create a combined KML with grouped layers
function createGroupedLayersKML(routeGroups, routeData) {
  // Start KML document
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Dublin Transport Routes (Grouped)</name>
    <description>All Dublin bus and rail routes organized in groups</description>`;

  // Add styles for each route
  Object.entries(routeColors).forEach(([route, color]) => {
    kml += `
    <Style id="${route}RouteStyle">
      <LineStyle>
        <color>${color}</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Style id="${route}StopStyle">
      <IconStyle>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/${pinColors[route]}-blank.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>`;
  });

  // Process each group
  for (const [groupName, routes] of Object.entries(routeGroups)) {
    // Add folder for this group
    kml += `
    <Folder>
      <name>${groupName.replace('_', ' ')}</name>
      <description>Routes in the ${groupName.replace('_', ' ')} group</description>`;

    // Handle nested groups (like Core_Spine_Routes)
    if (typeof routes === 'object' && !Array.isArray(routes)) {
      // For nested groups, create a subfolder for each spine
      for (const [subGroupName, subRoutes] of Object.entries(routes)) {
        kml += `
        <Folder>
          <name>${subGroupName.replace('_', ' ')}</name>
          <description>Routes in the ${subGroupName.replace('_', ' ')} group</description>`;

        // Process each route in the subgroup
        for (const routeName of subRoutes) {
          if (!routeData[routeName]) continue;

          const { featureCollection, shapeLine } = routeData[routeName];
          const features = featureCollection.features;
          const smoothedShapeLine = smoothRouteLine(shapeLine);

          // Create a LineString for the route
          kml += `
          <Placemark>
            <name>${routeName} Route Line</name>
            <styleUrl>#${routeName}RouteStyle</styleUrl>
            <LineString>
              <tessellate>1</tessellate>
              <coordinates>`;

          // Add coordinates for the shape line
          smoothedShapeLine.forEach((coords) => {
            const [longitude, latitude] = coords;
            kml += `${longitude},${latitude},0 `;
          });

          // Close the route line
          kml += `</coordinates>
            </LineString>
          </Placemark>`;

          // Add a single folder for all stops in this route
          kml += `
          <Folder>
            <name>${routeName} Stops</name>`;

          // Add placemarks for each stop in order
          features.forEach((feature, index) => {
            const { id, name } = feature.properties;
            const [longitude, latitude] = feature.geometry.coordinates;

            kml += `
            <Placemark>
              <name>${index + 1}. ${name}</name>
              <description>Stop ID: ${id}</description>
              <styleUrl>#${routeName}StopStyle</styleUrl>
              <Point>
                <coordinates>${longitude},${latitude},0</coordinates>
              </Point>
            </Placemark>`;
          });

          // Close the stops folder
          kml += `
          </Folder>`;
        }

        // Close the subgroup folder
        kml += `
        </Folder>`;
      }
    } else {
      // For flat groups, process as before
      for (const routeName of routes) {
        if (!routeData[routeName]) continue;

        const { featureCollection, shapeLine } = routeData[routeName];
        const features = featureCollection.features;
        const smoothedShapeLine = smoothRouteLine(shapeLine);

        // Create a LineString for the route
        kml += `
        <Placemark>
          <name>${routeName} Route Line</name>
          <styleUrl>#${routeName}RouteStyle</styleUrl>
          <LineString>
            <tessellate>1</tessellate>
            <coordinates>`;

        // Add coordinates for the shape line
        smoothedShapeLine.forEach((coords) => {
          const [longitude, latitude] = coords;
          kml += `${longitude},${latitude},0 `;
        });

        // Close the route line
        kml += `</coordinates>
          </LineString>
        </Placemark>`;

        // Add a single folder for all stops in this route
        kml += `
        <Folder>
          <name>${routeName} Stops</name>`;

        // Add placemarks for each stop in order
        features.forEach((feature, index) => {
          const { id, name } = feature.properties;
          const [longitude, latitude] = feature.geometry.coordinates;

          kml += `
          <Placemark>
            <name>${index + 1}. ${name}</name>
            <description>Stop ID: ${id}</description>
            <styleUrl>#${routeName}StopStyle</styleUrl>
            <Point>
              <coordinates>${longitude},${latitude},0</coordinates>
            </Point>
          </Placemark>`;
        });

        // Close the stops folder
        kml += `
        </Folder>`;
      }
    }

    // Close the group folder
    kml += `
    </Folder>`;
  }

  // Close the KML document
  kml += `
  </Document>
</kml>`;

  return kml;
}

// Function to create a maximally consolidated KML with minimal layers
function createConsolidatedKML(routeGroups, routeData) {
  // Start KML document
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Dublin Transport Routes</name>
    <description>All Dublin bus and rail routes</description>`;

  // Add styles for each route
  Object.entries(routeColors).forEach(([route, color]) => {
    kml += `
    <Style id="${route}RouteStyle">
      <LineStyle>
        <color>${color}</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Style id="${route}StopStyle">
      <IconStyle>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/${pinColors[route]}-blank.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>`;
  });

  // Create just 3 main folders: Bus Routes, Rail Routes, All Stops

  // 1. Bus Routes folder
  kml += `
    <Folder>
      <name>Bus Routes</name>
      <description>All bus route lines</description>`;

  // Add all bus route lines
  for (const [groupName, routes] of Object.entries(routeGroups)) {
    if (groupName === 'Rail_Routes') continue; // Skip rail routes for now

    // Handle nested groups (like Core_Spine_Routes)
    if (typeof routes === 'object' && !Array.isArray(routes)) {
      // For nested groups, add all sub-routes
      for (const [subGroupName, subRoutes] of Object.entries(routes)) {
        for (const routeName of subRoutes) {
          if (!routeData[routeName]) continue;

          const { shapeLine } = routeData[routeName];
          const smoothedShapeLine = smoothRouteLine(shapeLine);

          // Create a LineString for the route
          kml += `
          <Placemark>
            <name>${routeName} Route Line</name>
            <styleUrl>#${routeName}RouteStyle</styleUrl>
            <LineString>
              <tessellate>1</tessellate>
              <coordinates>`;

          // Add coordinates for the shape line
          smoothedShapeLine.forEach((coords) => {
            const [longitude, latitude] = coords;
            kml += `${longitude},${latitude},0 `;
          });

          // Close the route line
          kml += `</coordinates>
            </LineString>
          </Placemark>`;
        }
      }
    } else {
      // For flat groups, process as before
      for (const routeName of routes) {
        if (!routeData[routeName]) continue;

        const { shapeLine } = routeData[routeName];
        const smoothedShapeLine = smoothRouteLine(shapeLine);

        // Create a LineString for the route
        kml += `
        <Placemark>
          <name>${routeName} Route Line</name>
          <styleUrl>#${routeName}RouteStyle</styleUrl>
          <LineString>
            <tessellate>1</tessellate>
            <coordinates>`;

        // Add coordinates for the shape line
        smoothedShapeLine.forEach((coords) => {
          const [longitude, latitude] = coords;
          kml += `${longitude},${latitude},0 `;
        });

        // Close the route line
        kml += `</coordinates>
          </LineString>
        </Placemark>`;
      }
    }
  }

  // Close Bus Routes folder
  kml += `
    </Folder>`;

  // 2. Rail Routes folder
  kml += `
    <Folder>
      <name>Rail Routes</name>
      <description>All rail route lines</description>`;

  // Add all rail route lines
  const railRoutes = routeGroups['Rail_Routes'] || [];
  for (const routeName of railRoutes) {
    if (!routeData[routeName]) continue;

    const { shapeLine } = routeData[routeName];
    const smoothedShapeLine = smoothRouteLine(shapeLine);

    // Create a LineString for the route
    kml += `
    <Placemark>
      <name>${routeName} Route Line</name>
      <styleUrl>#${routeName}RouteStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>`;

    // Add coordinates for the shape line
    smoothedShapeLine.forEach((coords) => {
      const [longitude, latitude] = coords;
      kml += `${longitude},${latitude},0 `;
    });

    // Close the route line
    kml += `</coordinates>
      </LineString>
    </Placemark>`;
  }

  // Close Rail Routes folder
  kml += `
    </Folder>`;

  // 3. All Stops folder
  kml += `
    <Folder>
      <name>All Stops</name>
      <description>All bus and rail stops</description>`;

  // Function to add stops for a group of routes
  const addStopsForRoutes = (routes, folderName, description) => {
    kml += `
    <Folder>
      <name>${folderName}</name>
      <description>${description}</description>`;

    // Handle nested groups
    if (typeof routes === 'object' && !Array.isArray(routes)) {
      for (const [subGroupName, subRoutes] of Object.entries(routes)) {
        for (const routeName of subRoutes) {
          if (!routeData[routeName]) continue;

          const { featureCollection } = routeData[routeName];
          const features = featureCollection.features;

          // Add placemarks for each stop in order
          features.forEach((feature, index) => {
            const { id, name } = feature.properties;
            const [longitude, latitude] = feature.geometry.coordinates;

            kml += `
            <Placemark>
              <name>${routeName}: ${index + 1}. ${name}</name>
              <description>Route: ${routeName}, Stop ID: ${id}</description>
              <styleUrl>#${routeName}StopStyle</styleUrl>
              <Point>
                <coordinates>${longitude},${latitude},0</coordinates>
              </Point>
            </Placemark>`;
          });
        }
      }
    } else {
      for (const routeName of routes) {
        if (!routeData[routeName]) continue;

        const { featureCollection } = routeData[routeName];
        const features = featureCollection.features;

        // Add placemarks for each stop in order
        features.forEach((feature, index) => {
          const { id, name } = feature.properties;
          const [longitude, latitude] = feature.geometry.coordinates;

          kml += `
          <Placemark>
            <name>${routeName}: ${index + 1}. ${name}</name>
            <description>Route: ${routeName}, Stop ID: ${id}</description>
            <styleUrl>#${routeName}StopStyle</styleUrl>
            <Point>
              <coordinates>${longitude},${latitude},0</coordinates>
            </Point>
          </Placemark>`;
        });
      }
    }

    // Close the folder
    kml += `
    </Folder>`;
  };

  // Add stops for each group
  addStopsForRoutes(
    routeGroups['North_Routes'],
    'North Routes Stops',
    'Stops for N2, N4, N6 routes'
  );
  addStopsForRoutes(
    routeGroups['South_Routes'],
    'South Routes Stops',
    'Stops for S2, S4, S6, S8 routes'
  );
  addStopsForRoutes(
    routeGroups['West_Routes'],
    'West Routes Stops',
    'Stops for W2 route'
  );
  addStopsForRoutes(
    routeGroups['Core_Spine_Routes'],
    'Core Spine Routes Stops',
    'Stops for G, H, C, E spine routes'
  );
  addStopsForRoutes(
    routeGroups['High_Frequency_Routes'],
    'High Frequency Routes Stops',
    'Stops for routes 1, 39, 15, 16'
  );
  addStopsForRoutes(
    routeGroups['Rail_Routes'],
    'Rail Stops',
    'Stops for DART, Luas Green Line, Luas Red Line'
  );

  // Close All Stops folder
  kml += `
    </Folder>`;

  // Close the KML document
  kml += `
  </Document>
</kml>`;

  return kml;
}

// Main function to process all routes
async function processRoutes() {
  // List of routes to process
  const busRoutes = [
    // Orbital Routes
    'N2',
    'N4',
    'N6',
    'S2',
    'S4',
    'S6',
    'S8',
    'W2',
    // Core Spine Routes
    'G1',
    'G2',
    'H1',
    'H2',
    'H3',
    'C1',
    'C2',
    'C3',
    'C4',
    'E1',
    'E2',
    // Additional High-Frequency Routes
    '1',
    '39',
    '15',
    '16',
  ];
  const railRoutes = ['DART', 'LuasGreen', 'LuasRed'];
  const allRoutes = [...busRoutes, ...railRoutes];

  // Define route groups to combine similar routes
  const routeGroups = {
    North_Routes: ['N2', 'N4', 'N6'],
    South_Routes: ['S2', 'S4', 'S6', 'S8'],
    West_Routes: ['W2'],
    Core_Spine_Routes: {
      G_Spine: ['G1', 'G2'],
      H_Spine: ['H1', 'H2', 'H3'],
      C_Spine: ['C1', 'C2', 'C3', 'C4'],
      E_Spine: ['E1', 'E2'],
    },
    High_Frequency_Routes: ['1', '39', '15', '16'],
    Rail_Routes: ['DART', 'LuasGreen', 'LuasRed'],
  };

  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, 'kml_gtfs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Process each route
  const routeData = {};

  for (const routeName of allRoutes) {
    try {
      // Process the route
      const data = await processRoute(routeName);

      if (data) {
        routeData[routeName] = data;

        // Convert to KML
        const kml = convertToKML(
          routeName,
          data.featureCollection,
          data.shapeLine
        );

        // Write KML file
        const outputPath = path.join(outputDir, `${routeName}_Route.kml`);
        fs.writeFileSync(outputPath, kml);

        console.log(`Converted ${routeName} to KML: ${outputPath}`);
      }
    } catch (error) {
      console.error(`Error processing route ${routeName}:`, error);
    }
  }

  // Create combined KML files for each group
  for (const [groupName, routes] of Object.entries(routeGroups)) {
    const groupData = {};

    // Handle nested groups (like Core_Spine_Routes)
    if (typeof routes === 'object' && !Array.isArray(routes)) {
      // For nested groups, combine all sub-routes
      for (const [subGroupName, subRoutes] of Object.entries(routes)) {
        for (const routeName of subRoutes) {
          if (routeData[routeName]) {
            groupData[routeName] = routeData[routeName];
          }
        }
      }
    } else {
      // For flat groups, process as before
      for (const routeName of routes) {
        if (routeData[routeName]) {
          groupData[routeName] = routeData[routeName];
        }
      }
    }

    // Create combined KML for this group
    const groupKml = createCombinedKML(groupData);
    const groupOutputPath = path.join(outputDir, `${groupName}.kml`);
    fs.writeFileSync(groupOutputPath, groupKml);

    console.log(
      `Created combined KML file for ${groupName}: ${groupOutputPath}`
    );
  }

  // Create a single KML file with all grouped layers
  const groupedLayersKml = createGroupedLayersKML(routeGroups, routeData);
  const groupedLayersOutputPath = path.join(
    outputDir,
    'Dublin_Transport_Grouped.kml'
  );
  fs.writeFileSync(groupedLayersOutputPath, groupedLayersKml);

  console.log(
    `Created KML file with all grouped layers: ${groupedLayersOutputPath}`
  );

  // Create a maximally consolidated KML file with minimal layers
  const consolidatedKml = createConsolidatedKML(routeGroups, routeData);
  const consolidatedOutputPath = path.join(
    outputDir,
    'Dublin_Transport_Consolidated.kml'
  );
  fs.writeFileSync(consolidatedOutputPath, consolidatedKml);

  console.log(
    `Created consolidated KML file with minimal layers: ${consolidatedOutputPath}`
  );

  // Create a combined KML file with all routes
  const combinedKml = createCombinedKML(routeData);
  const combinedOutputPath = path.join(
    outputDir,
    'All_Dublin_Transport_Routes.kml'
  );
  fs.writeFileSync(combinedOutputPath, combinedKml);

  console.log(`Created combined KML file: ${combinedOutputPath}`);

  // Create a README file
  createReadme(outputDir);
}

// Function to create a README file
function createReadme(outputDir) {
  const readmeContent = `# Dublin Transport Routes KML Files from GTFS Data

This directory contains KML files for Dublin's bus and rail routes generated directly from GTFS data, ready to be imported into Google MyMaps.

## Files Included

### Single Import File (RECOMMENDED)
- \`Dublin_Transport_Consolidated.kml\` - All routes organized in just 3 main folders:
  - **This is the recommended file to import** as it stays well under the 10-layer limit in Google MyMaps
  - Contains only 7 layers total:
    1. Bus Routes (all bus route lines)
    2. Rail Routes (all rail route lines)
    3. All Stops (containing 4 subfolders):
       - North Routes Stops (N2, N4, N6)
       - South Routes Stops (S2, S4, S6, S8)
       - West Routes Stops (W2)
       - Rail Stops (DART, Luas Green, Luas Red)

- \`Dublin_Transport_Grouped.kml\` - All routes organized in groups (North, South, West, Rail)
  - This file may exceed the 10-layer limit in Google MyMaps

### Individual Route Files
- Bus route files:
  - \`N2_Route.kml\` - N2 Bus Route (Orange-yellow) - Clontarf Road Station to Heuston Station
  - \`N4_Route.kml\` - N4 Bus Route (Light orange) - Point Village to Blanchardstown Shopping Centre
  - \`N6_Route.kml\` - N6 Bus Route (Blue) - Finglas Village to Blackrock Station
  - \`S2_Route.kml\` - S2 Bus Route (Yellow) - Sean Moore Road to Heuston Station
  - \`S4_Route.kml\` - S4 Bus Route (Pink/Magenta) - Liffey Valley Shopping Centre to Monkstown Avenue
  - \`S6_Route.kml\` - S6 Bus Route (Light Blue/Cyan) - Tallaght to Blackrock
  - \`S8_Route.kml\` - S8 Bus Route (Purple) - Kingswood Avenue to Dun Laoghaire Station
  - \`W2_Route.kml\` - W2 Bus Route (Orange) - Liffey Valley Shopping Centre to UCD Belfield

- Rail route files:
  - \`DART_Route.kml\` - DART (Light Blue) - Howth to Greystones
  - \`LuasGreen_Route.kml\` - Luas Green Line (Light Green) - Broombridge to Brides Glen
  - \`LuasRed_Route.kml\` - Luas Red Line (Red) - The Point to Tallaght/Saggart

### Grouped Route Files
- \`North_Routes.kml\` - All northern bus routes (N2, N4, N6) in a single file
- \`South_Routes.kml\` - All southern bus routes (S2, S4, S6, S8) in a single file
- \`West_Routes.kml\` - West bus route (W2) in a single file
- \`Rail_Routes.kml\` - All rail routes (DART, Luas Green Line, Luas Red Line) in a single file

### Complete Combined File
- \`All_Dublin_Transport_Routes.kml\` - All routes in a single file (flat structure, no grouping)

## How to Import into Google MyMaps

### RECOMMENDED: Import the Consolidated File

This option gives you the best balance between organization and staying within MyMaps layer limits:

1. Go to [Google MyMaps](https://www.google.com/maps/d/)
2. Click "Create a New Map"
3. Click "Import" in the left panel
4. Upload the \`Dublin_Transport_Consolidated.kml\` file
5. The routes will be imported with just 3 main folders:
   - Bus Routes: All bus route lines
   - Rail Routes: All rail route lines
   - All Stops: Contains 4 subfolders for stops by region

### Alternative Options

- **Import Grouped Routes Separately**: Upload the grouped KML files (e.g., \`North_Routes.kml\`, \`South_Routes.kml\`, etc.)
- **Import Individual Routes**: Upload individual route files (e.g., \`N2_Route.kml\`) for maximum control but may hit layer limits

## Features of These KML Files

- Generated directly from GTFS data for maximum accuracy
- Stops are numbered in sequence along the route (1, 2, 3, etc.)
- Each route has its own color for both pins and route line:
  - Bus routes: N2 (Orange-yellow), N4 (Light orange), N6 (Blue), S2 (Yellow), S4 (Pink), S6 (Light Blue), S8 (Purple), W2 (Orange)
  - Rail routes: DART (Light Blue), Luas Green Line (Light Green), Luas Red Line (Red)
- Routes follow the actual shape data from GTFS
- Routes are ordered with correct starting and ending points

## Regenerating KML Files

If you need to regenerate these KML files, run:

\`\`\`bash
cd src/data
node gtfsToKML.js
\`\`\`

This will process the GTFS data and create updated KML files in this directory.`;

  const readmePath = path.join(outputDir, 'README.md');
  fs.writeFileSync(readmePath, readmeContent);
  console.log(`Created README file: ${readmePath}`);
}

// Run the script
processRoutes().catch(console.error);
