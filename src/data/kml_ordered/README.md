# Ordered Bus Routes KML Files for Google MyMaps

This directory contains KML files for Dublin's radial bus routes with stops ordered correctly along each route, ready to be imported into Google MyMaps.

## Files Included

- Individual route files:

  - `N2_BusRoute.kml` - N2 Bus Route (Red) - Clontarf Road Station to Heuston Station
  - `N4_BusRoute.kml` - N4 Bus Route (Green) - Point Village to Blanchardstown Shopping Centre
  - `N6_BusRoute.kml` - N6 Bus Route (Blue) - Finglas Village to Blackrock Station
  - `S2_BusRoute.kml` - S2 Bus Route (Yellow) - Sean Moore Road to Heuston Station
  - `S4_BusRoute.kml` - S4 Bus Route (Pink/Magenta) - Liffey Valley Shopping Centre to Monkstown Avenue
  - `S6_BusRoute.kml` - S6 Bus Route (Light Blue/Cyan) - Tallaght to Blackrock
  - `S8_BusRoute.kml` - S8 Bus Route (Purple) - Kingswood Avenue to Dun Laoghaire Station
  - `W2_BusRoute.kml` - W2 Bus Route (Orange) - Liffey Valley Shopping Centre to UCD Belfield

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

## Features of These KML Files

- Stops are numbered in sequence along the route (1, 2, 3, etc.)
- Each route has its own color for both pins and route line:
  - N2: Red pins and line
  - N4: Green pins and line
  - N6: Blue pins and line
  - S2: Yellow pins and line
  - S4: Pink/Magenta pins and line
  - S6: Light Blue/Cyan pins and line
  - S8: Purple pins and line
  - W2: Orange pins and line
- Routes are accurately generated with correct starting and ending points:
  - Each route starts and ends at the correct terminus
  - Intermediate stops are ordered logically between the termini
  - The S2 route specifically follows a complete manually defined sequence
  - Route lines are smoothed with intermediate points for better visualization
  - Large gaps between stops are filled with intermediate points

## Regenerating KML Files

If you need to regenerate these KML files, run:

```bash
cd src/data
node convertToKML_ordered.js
```

This will process the GeoJSON bus route files and create updated KML files in this directory.
