// This script converts the GeoJSON bus route data to KML format for Google MyMaps
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define route colors (you can customize these)
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

// Function to convert GeoJSON to KML
function convertToKML(routeName, geojsonData) {
  const features = geojsonData.features;

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
        <color>${routeColors[routeName]}</color>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>
    
    <!-- Folder for stops -->
    <Folder>
      <name>${routeName} Stops</name>`;

  // Add placemarks for each stop
  features.forEach((feature) => {
    const { id, name } = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;

    kml += `
      <Placemark>
        <name>${name}</name>
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

  // Add coordinates for the route line (in order of stops)
  features.forEach((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
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
  const outputDir = path.join(__dirname, 'kml');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Process each route file
  for (const route of routeFiles) {
    try {
      // Read the GeoJSON file
      const filePath = path.join(__dirname, route.file);
      const geojsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Convert to KML
      const kml = convertToKML(route.name, geojsonData);

      // Write KML file
      const outputPath = path.join(outputDir, `${route.name}_BusRoute.kml`);
      fs.writeFileSync(outputPath, kml);

      console.log(`Converted ${route.name} to KML: ${outputPath}`);
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
        <color>${color}</color>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href>
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
      const features = geojsonData.features;

      // Add folder for this route
      kml += `
    <Folder>
      <name>${route.name} Bus Route</name>`;

      // Add placemarks for each stop
      features.forEach((feature) => {
        const { id, name } = feature.properties;
        const [longitude, latitude] = feature.geometry.coordinates;

        kml += `
      <Placemark>
        <name>${name}</name>
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

      // Add coordinates for the route line
      features.forEach((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates;
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
  console.log(`Created combined KML file: ${outputPath}`);
}

// Run the script
processRoutes().catch(console.error);
