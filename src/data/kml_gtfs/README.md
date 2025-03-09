# Dublin Transport Routes KML Files from GTFS Data

This directory contains KML files for Dublin's bus and rail routes generated directly from GTFS data, ready to be imported into Google MyMaps.

## Files Included

### Single Import File (RECOMMENDED)
- `Dublin_Transport_Consolidated.kml` - All routes organized in just 3 main folders:
  - **This is the recommended file to import** as it stays well under the 10-layer limit in Google MyMaps
  - Contains only 7 layers total:
    1. Bus Routes (all bus route lines)
    2. Rail Routes (all rail route lines)
    3. All Stops (containing 4 subfolders):
       - North Routes Stops (N2, N4, N6)
       - South Routes Stops (S2, S4, S6, S8)
       - West Routes Stops (W2)
       - Rail Stops (DART, Luas Green, Luas Red)

- `Dublin_Transport_Grouped.kml` - All routes organized in groups (North, South, West, Rail)
  - This file may exceed the 10-layer limit in Google MyMaps

### Individual Route Files
- Bus route files:
  - `N2_Route.kml` - N2 Bus Route (Orange-yellow) - Clontarf Road Station to Heuston Station
  - `N4_Route.kml` - N4 Bus Route (Light orange) - Point Village to Blanchardstown Shopping Centre
  - `N6_Route.kml` - N6 Bus Route (Blue) - Finglas Village to Blackrock Station
  - `S2_Route.kml` - S2 Bus Route (Yellow) - Sean Moore Road to Heuston Station
  - `S4_Route.kml` - S4 Bus Route (Pink/Magenta) - Liffey Valley Shopping Centre to Monkstown Avenue
  - `S6_Route.kml` - S6 Bus Route (Light Blue/Cyan) - Tallaght to Blackrock
  - `S8_Route.kml` - S8 Bus Route (Purple) - Kingswood Avenue to Dun Laoghaire Station
  - `W2_Route.kml` - W2 Bus Route (Orange) - Liffey Valley Shopping Centre to UCD Belfield

- Rail route files:
  - `DART_Route.kml` - DART (Light Blue) - Howth to Greystones
  - `LuasGreen_Route.kml` - Luas Green Line (Light Green) - Broombridge to Brides Glen
  - `LuasRed_Route.kml` - Luas Red Line (Red) - The Point to Tallaght/Saggart

### Grouped Route Files
- `North_Routes.kml` - All northern bus routes (N2, N4, N6) in a single file
- `South_Routes.kml` - All southern bus routes (S2, S4, S6, S8) in a single file
- `West_Routes.kml` - West bus route (W2) in a single file
- `Rail_Routes.kml` - All rail routes (DART, Luas Green Line, Luas Red Line) in a single file

### Complete Combined File
- `All_Dublin_Transport_Routes.kml` - All routes in a single file (flat structure, no grouping)

## How to Import into Google MyMaps

### RECOMMENDED: Import the Consolidated File

This option gives you the best balance between organization and staying within MyMaps layer limits:

1. Go to [Google MyMaps](https://www.google.com/maps/d/)
2. Click "Create a New Map"
3. Click "Import" in the left panel
4. Upload the `Dublin_Transport_Consolidated.kml` file
5. The routes will be imported with just 3 main folders:
   - Bus Routes: All bus route lines
   - Rail Routes: All rail route lines
   - All Stops: Contains 4 subfolders for stops by region

### Alternative Options

- **Import Grouped Routes Separately**: Upload the grouped KML files (e.g., `North_Routes.kml`, `South_Routes.kml`, etc.)
- **Import Individual Routes**: Upload individual route files (e.g., `N2_Route.kml`) for maximum control but may hit layer limits

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

```bash
cd src/data
node gtfsToKML.js
```

This will process the GTFS data and create updated KML files in this directory.