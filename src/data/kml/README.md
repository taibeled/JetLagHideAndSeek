# Bus Routes KML Files for Google MyMaps

This directory contains KML files for Dublin's radial bus routes, ready to be imported into Google MyMaps.

## Files Included

- Individual route files:

  - `N2_BusRoute.kml` - N2 Bus Route
  - `N4_BusRoute.kml` - N4 Bus Route
  - `N6_BusRoute.kml` - N6 Bus Route
  - `S2_BusRoute.kml` - S2 Bus Route
  - `S4_BusRoute.kml` - S4 Bus Route
  - `S6_BusRoute.kml` - S6 Bus Route
  - `S8_BusRoute.kml` - S8 Bus Route
  - `W2_BusRoute.kml` - W2 Bus Route

- Combined file:
  - `All_Radial_Bus_Routes.kml` - All routes in a single file

## How to Import into Google MyMaps

### Option 1: Import Individual Routes (Recommended)

This option gives you the most control over styling and organization:

1. Go to [Google MyMaps](https://www.google.com/maps/d/)
2. Click "Create a New Map"
3. Click "Import" in the left panel
4. Upload one of the individual KML files (e.g., `N2_BusRoute.kml`)
5. The route will be imported as a layer with its own color
6. Repeat steps 3-5 for each route you want to add
7. You can rename layers and adjust styles as needed

### Option 2: Import All Routes at Once

This option is quicker but gives you less control over initial styling:

1. Go to [Google MyMaps](https://www.google.com/maps/d/)
2. Click "Create a New Map"
3. Click "Import" in the left panel
4. Upload the `All_Radial_Bus_Routes.kml` file
5. All routes will be imported as separate layers

## Customizing Your Map

After importing, you can:

- Rename layers
- Change the color of pins and routes
- Add additional information to stops
- Toggle visibility of individual routes
- Add your own custom points or routes

## Regenerating KML Files

If you need to regenerate these KML files, run:

```bash
cd src/data
node convertToKML.js
```

This will process the GeoJSON bus route files and create updated KML files in this directory.
