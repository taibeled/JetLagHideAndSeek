// This script fixes KML files by replacing n tags with name tags
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to fix KML tags in a file
function fixKMLTags(filePath) {
  try {
    // Read the file
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace all n tags with name tags
    content = content.replace(/<n>/g, '<name>');
    content = content.replace(/<\/n>/g, '</name>');

    // Write the fixed content back to the file
    fs.writeFileSync(filePath, content);

    console.log(`Fixed KML tags in: ${filePath}`);
  } catch (error) {
    console.error(`Error fixing KML tags in ${filePath}:`, error);
  }
}

// Function to process all KML files in a directory
function processDirectory(dirPath) {
  // Get all files in the directory
  const files = fs.readdirSync(dirPath);

  // Process each KML file
  for (const file of files) {
    if (file.endsWith('.kml')) {
      const filePath = path.join(dirPath, file);
      fixKMLTags(filePath);
    }
  }
}

// Process both KML directories
const directories = [
  path.join(__dirname, 'kml'),
  path.join(__dirname, 'kml_ordered'),
];

for (const dir of directories) {
  if (fs.existsSync(dir)) {
    console.log(`Processing directory: ${dir}`);
    processDirectory(dir);
  } else {
    console.log(`Directory does not exist: ${dir}`);
  }
}

console.log('KML tag fixing complete!');
