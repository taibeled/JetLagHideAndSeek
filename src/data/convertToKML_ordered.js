// This script converts the GeoJSON bus route data to KML format for Google MyMaps
// with stops ordered correctly along the route
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define route colors and pin colors
const routeColors = {
  N2: 'ff0000ff', // Red
  N4: 'ff00ff00', // Green
  N6: 'ffff0000', // Blue
  S2: 'ff00ffff', // Yellow
  S4: 'ffff00ff', // Magenta
  S6: 'ffffff00', // Cyan
  S8: 'ff7f00ff', // Purple
  W2: 'ffff7f00', // Orange
};

// Map route names to pin colors for Google MyMaps
const pinColors = {
  N2: 'red', // Red
  N4: 'green', // Green
  N6: 'blue', // Blue
  S2: 'ylw', // Yellow
  S4: 'pink', // Pink/Magenta
  S6: 'ltblu', // Light Blue/Cyan
  S8: 'purple', // Purple
  W2: 'orange', // Orange
};

// Define known starting and ending points for each route
const routeEndpoints = {
  N2: {
    start: 'Clontarf Road Station', // Corrected
    end: 'Heuston Station', // Corrected
  },
  N4: {
    start: 'Point Village', // Corrected
    end: 'Blanchardstown Shopping Centre', // Corrected
  },
  N6: {
    start: 'Finglas Village',
    end: 'Blackrock Station',
  },
  S2: {
    start: 'Sean Moore Road',
    end: 'Heuston Station', // Corrected
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
    start: 'Kingswood Avenue', // Corrected
    end: 'Dun Laoghaire Station', // Corrected
  },
  W2: {
    start: 'Liffey Valley Shopping Centre',
    end: 'UCD Belfield',
  },
};

// Manual ordering for S2 route
const manualOrderingS2 = [
  'Sean Moore Road',
  'Dromard Terrace',
  'Gilford Road',
  'Sandymount Station',
  'Merrion Road',
  'American Embassy',
  'Northumberland Road',
  'Baggot Street',
  'Waterloo Road',
  'Rathmines',
  'Kenilworth Road',
  'Terenure Road',
  'Templeogue Road',
  'Cypress Grove Road',
  'Knocklyon Road',
  'Scholarstown Road',
  'Orlagh Grove',
  'Heuston Station', // Updated to correct end point
];

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

// Function to find the starting point for a route based on known endpoints
function findRouteStartingPoint(features, routeName) {
  // If we have defined endpoints for this route
  if (routeEndpoints[routeName] && routeEndpoints[routeName].start) {
    const startName = routeEndpoints[routeName].start;

    // Try to find a stop with this name
    for (const feature of features) {
      const name = feature.properties.name;
      if (name.includes(startName)) {
        return feature;
      }
    }
  }

  // Fallback: Find the stop furthest from Dublin city center
  // Dublin city center coordinates (approximate)
  const dublinCenterLat = 53.3498;
  const dublinCenterLon = -6.2603;

  let furthestStop = features[0];
  let maxDistance = 0;

  features.forEach((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const distance = calculateDistance(
      dublinCenterLat,
      dublinCenterLon,
      lat,
      lon
    );

    if (distance > maxDistance) {
      maxDistance = distance;
      furthestStop = feature;
    }
  });

  return furthestStop;
}

// Function to find the ending point for a route based on known endpoints
function findRouteEndingPoint(features, routeName, startFeature) {
  // If we have defined endpoints for this route
  if (routeEndpoints[routeName] && routeEndpoints[routeName].end) {
    const endName = routeEndpoints[routeName].end;

    // Try to find a stop with this name
    for (const feature of features) {
      const name = feature.properties.name;
      if (name.includes(endName) && feature !== startFeature) {
        return feature;
      }
    }
  }

  // Fallback: Find the stop furthest from the starting point
  let furthestStop = null;
  let maxDistance = 0;

  const [startLon, startLat] = startFeature.geometry.coordinates;

  features.forEach((feature) => {
    if (feature !== startFeature) {
      const [lon, lat] = feature.geometry.coordinates;
      const distance = calculateDistance(startLat, startLon, lat, lon);

      if (distance > maxDistance) {
        maxDistance = distance;
        furthestStop = feature;
      }
    }
  });

  return furthestStop;
}

// Function to order stops along a route using a more sophisticated approach
function orderStopsAlongRoute(features, routeName) {
  // If there are no features, return empty array
  if (features.length === 0) return [];
  if (features.length === 1) return features;

  // Find the starting and ending points
  const startFeature = findRouteStartingPoint(features, routeName);
  const endFeature = findRouteEndingPoint(features, routeName, startFeature);

  // Create a copy of features without start and end
  const middleFeatures = features.filter(
    (f) => f !== startFeature && f !== endFeature
  );

  // Start with the starting feature
  const orderedFeatures = [startFeature];

  // If we have middle features, order them
  if (middleFeatures.length > 0) {
    let currentFeature = startFeature;
    const remainingFeatures = [...middleFeatures];

    // While there are remaining features
    while (remainingFeatures.length > 0) {
      // Get the current feature
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
  }

  // Add the ending feature if it's not already included
  if (!orderedFeatures.includes(endFeature)) {
    orderedFeatures.push(endFeature);
  }

  return orderedFeatures;
}

// Function to order stops based on manual ordering (for specific routes)
function orderStopsManually(features, routeName) {
  if (routeName === 'S2') {
    // Create a map of stop names to features
    const stopMap = {};
    features.forEach((feature) => {
      // Extract the base name without the route suffix
      const fullName = feature.properties.name;
      const baseName = fullName.replace(/ \(S2\)$/, '');
      stopMap[baseName] = feature;
    });

    // Start with the manually ordered stops
    const orderedFeatures = [];

    // Add the manually ordered stops first
    manualOrderingS2.forEach((stopName) => {
      // Find the feature with this name (with or without route suffix)
      const feature =
        stopMap[stopName] ||
        features.find((f) => f.properties.name.includes(stopName));

      if (feature && !orderedFeatures.includes(feature)) {
        orderedFeatures.push(feature);
      }
    });

    // Add any remaining stops using the nearest neighbor algorithm
    const remainingFeatures = features.filter(
      (f) => !orderedFeatures.includes(f)
    );
    if (remainingFeatures.length > 0) {
      // If we have ordered features, start from the last one
      if (orderedFeatures.length > 0) {
        const lastFeature = orderedFeatures[orderedFeatures.length - 1];
        const remainingOrdered = orderStopsAlongRoute(
          [lastFeature, ...remainingFeatures],
          routeName
        ).slice(1);
        orderedFeatures.push(...remainingOrdered);
      } else {
        // If no ordered features yet, just order the remaining ones
        orderedFeatures.push(
          ...orderStopsAlongRoute(remainingFeatures, routeName)
        );
      }
    }

    return orderedFeatures;
  }

  // For other routes, use the improved route ordering algorithm
  return orderStopsAlongRoute(features, routeName);
}

// Function to smooth a route line by adding intermediate points
function smoothRouteLine(orderedFeatures) {
  if (orderedFeatures.length <= 1) return orderedFeatures;

  const smoothedCoordinates = [];

  // Add the first point
  smoothedCoordinates.push(orderedFeatures[0].geometry.coordinates);

  // For each pair of consecutive points
  for (let i = 0; i < orderedFeatures.length - 1; i++) {
    const [lon1, lat1] = orderedFeatures[i].geometry.coordinates;
    const [lon2, lat2] = orderedFeatures[i + 1].geometry.coordinates;

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

// Function to convert GeoJSON to KML with ordered stops
function convertToKML(routeName, geojsonData) {
  const features = geojsonData.features;

  // Order the stops along the route
  const orderedFeatures = orderStopsManually(features, routeName);

  // Generate smoothed route line coordinates
  const smoothedCoordinates = smoothRouteLine(orderedFeatures);

  // Start KML document
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${routeName} Bus Route</name>
    <description>Bus stops for ${routeName} route</description>
    
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
  orderedFeatures.forEach((feature, index) => {
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

  // Create a LineString for the route
  kml += `
    </Folder>
    
    <!-- Route line -->
    <Placemark>
      <name>${routeName} Route Line</name>
      <styleUrl>#routeStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>`;

  // Add coordinates for the smoothed route line
  smoothedCoordinates.forEach((coords) => {
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

// Main function to process all route files
async function processRoutes() {
  // List of route files to process
  const routeFiles = [
    { name: 'N2', file: 'n2BusRoutes.json' },
    { name: 'N4', file: 'n4BusRoutes.json' },
    { name: 'N6', file: 'n6BusRoutes.json' },
    { name: 'S2', file: 's2BusRoutes.json' },
    { name: 'S4', file: 's4BusRoutes.json' },
    { name: 'S6', file: 's6BusRoutes.json' },
    { name: 'S8', file: 's8BusRoutes.json' },
    { name: 'W2', file: 'w2BusRoutes.json' },
  ];

  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, 'kml_ordered');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Process each route file
  for (const route of routeFiles) {
    try {
      // Read the GeoJSON file
      const filePath = path.join(__dirname, route.file);
      const geojsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Convert to KML with ordered stops
      const kml = convertToKML(route.name, geojsonData);

      // Write KML file
      const outputPath = path.join(outputDir, `${route.name}_BusRoute.kml`);
      fs.writeFileSync(outputPath, kml);

      console.log(
        `Converted ${route.name} to KML with ordered stops: ${outputPath}`
      );
    } catch (error) {
      console.error(`Error processing ${route.file}:`, error);
    }
  }

  // Create a combined KML file with all routes
  createCombinedKML(routeFiles, outputDir);
}

// Function to create a combined KML with all routes
function createCombinedKML(routeFiles, outputDir) {
  // Start KML document
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>All Radial Bus Routes</name>
    <description>All radial bus routes with stops</description>`;

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
  for (const route of routeFiles) {
    try {
      // Read the GeoJSON file
      const filePath = path.join(__dirname, route.file);
      const geojsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Order the stops along the route
      const orderedFeatures = orderStopsManually(
        geojsonData.features,
        route.name
      );

      // Generate smoothed route line coordinates
      const smoothedCoordinates = smoothRouteLine(orderedFeatures);

      // Add folder for this route
      kml += `
    <Folder>
      <name>${route.name} Bus Route</name>`;

      // Add placemarks for each stop in order
      orderedFeatures.forEach((feature, index) => {
        const { id, name } = feature.properties;
        const [longitude, latitude] = feature.geometry.coordinates;

        kml += `
      <Placemark>
        <name>${index + 1}. ${name}</name>
        <description>Stop ID: ${id}</description>
        <styleUrl>#${route.name}StopStyle</styleUrl>
        <Point>
          <coordinates>${longitude},${latitude},0</coordinates>
        </Point>
      </Placemark>`;
      });

      // Create a LineString for the route
      kml += `
      <Placemark>
        <name>${route.name} Route Line</name>
        <styleUrl>#${route.name}RouteStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>`;

      // Add coordinates for the smoothed route line
      smoothedCoordinates.forEach((coords) => {
        const [longitude, latitude] = coords;
        kml += `${longitude},${latitude},0 `;
      });

      // Close the route
      kml += `</coordinates>
        </LineString>
      </Placemark>
    </Folder>`;
    } catch (error) {
      console.error(`Error processing ${route.file} for combined KML:`, error);
    }
  }

  // Close the KML document
  kml += `
  </Document>
</kml>`;

  // Write the combined KML file
  const outputPath = path.join(outputDir, 'All_Radial_Bus_Routes.kml');
  fs.writeFileSync(outputPath, kml);
  console.log(`Created combined KML file with ordered stops: ${outputPath}`);
}

// Run the script
processRoutes().catch(console.error);
