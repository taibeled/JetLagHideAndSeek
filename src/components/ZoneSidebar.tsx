import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar-r';
import {
  animateMapMovements,
  disabledStations,
  displayHidingZones,
  displayHidingZonesOptions,
  hidingRadius,
  leafletMapContext,
  questionFinishedMapData,
  questions,
  trainStations,
} from '../lib/context';
import { useStore } from '@nanostores/react';
import { MENU_ITEM_CLASSNAME } from './ui/sidebar-l';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { useEffect, useRef, useState, useMemo } from 'react';
import * as L from 'leaflet';
import {
  findPlacesInZone,
  findPlacesSpecificInZone,
  findTentacleLocations,
  nearestToQuestion,
  QuestionSpecificLocation,
  trainLineNodeFinder,
} from '@/maps/api';
import * as turf from '@turf/turf';
import osmtogeojson from 'osmtogeojson';
import { holedMask, lngLatToText, unionize } from '@/maps/geo-utils';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { toast } from 'react-toastify';
import _ from 'lodash';
import { MultiSelect } from './ui/multi-select';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { geoSpatialVoronoi } from '@/maps/voronoi';
import { renderToString } from 'react-dom/server';
import { FaTrain, FaBus, FaSubway } from 'react-icons/fa';
import { ScrollToTop } from './ui/scroll-to-top';
import customBusRoutesData from '../data/customBusRoutes.json';
import corridorBusRoutesData from '../data/corridorBusRoutes.json';
import n2BusRoutesData from '../data/n2BusRoutes.json';
import n4BusRoutesData from '../data/n4BusRoutes.json';
import n6BusRoutesData from '../data/n6BusRoutes.json';
import s2BusRoutesData from '../data/s2BusRoutes.json';
import s4BusRoutesData from '../data/s4BusRoutes.json';
import s6BusRoutesData from '../data/s6BusRoutes.json';
import s8BusRoutesData from '../data/s8BusRoutes.json';
import w2BusRoutesData from '../data/w2BusRoutes.json';
import dartStopsData from '../data/dartStops.json';
import luasGreenLineStopsData from '../data/luasGreenLineStops.json';
import luasRedLineStopsData from '../data/luasRedLineStops.json';

let determiningHidingZones = false;
let buttonJustClicked = false;

// Function to filter out duplicate stations that are within a certain distance
const filterDuplicateStations = (
  stations: any[],
  distanceThresholdMeters = 25
) => {
  if (!stations || stations.length === 0)
    return {
      filtered: [],
      duplicateIds: new Set(),
      duplicateInfo: [],
      duplicateDistances: new Map(),
    };

  console.log(`Starting duplicate filtering with ${stations.length} stations`);

  const result: any[] = [];
  const processed = new Set<string>();
  const duplicateIds = new Set<string>();
  const duplicateInfo: {
    id1: string;
    id2: string;
    distance: number;
    name1: string;
    name2: string;
  }[] = [];
  const duplicateDistances = new Map<string, number>();

  // First pass: identify stations with identical names (likely duplicates)
  const stationsByName = new Map<string, any[]>();

  stations.forEach((station) => {
    const name = (
      station.properties.properties['name:en'] ||
      station.properties.properties.name ||
      ''
    )
      .toLowerCase()
      .trim();

    if (name) {
      if (!stationsByName.has(name)) {
        stationsByName.set(name, []);
      }
      stationsByName.get(name)!.push(station);
    }
  });

  // Process stations in groups by name first, then handle remaining stations
  for (const [name, stationsWithSameName] of stationsByName.entries()) {
    if (stationsWithSameName.length > 1) {
      console.log(
        `Found ${stationsWithSameName.length} stations with name "${name}"`
      );

      // Sort by ID to ensure consistent selection
      stationsWithSameName.sort((a, b) =>
        a.properties.properties.id.localeCompare(b.properties.properties.id)
      );

      // Keep the first station in each name group
      const firstStation = stationsWithSameName[0];
      result.push(firstStation);
      processed.add(firstStation.properties.properties.id);

      // Check distances between all stations with the same name
      const point1 = firstStation.properties.geometry.coordinates;

      for (let j = 1; j < stationsWithSameName.length; j++) {
        const station2 = stationsWithSameName[j];
        const id2 = station2.properties.properties.id;

        // Skip if already processed
        if (processed.has(id2)) continue;

        const point2 = station2.properties.geometry.coordinates;

        // Calculate distance
        const from = turf.point(point1);
        const to = turf.point(point2);
        const distance = turf.distance(from, to, { units: 'meters' });

        if (distance < distanceThresholdMeters) {
          // This is a duplicate
          processed.add(id2);
          duplicateIds.add(id2);
          duplicateDistances.set(id2, distance);
          duplicateInfo.push({
            id1: firstStation.properties.properties.id,
            id2,
            distance,
            name1: name,
            name2: name,
          });
        } else {
          // Not a duplicate by distance, keep it
          result.push(station2);
          processed.add(id2);
        }
      }
    } else {
      // Only one station with this name, keep it
      const station = stationsWithSameName[0];
      if (!processed.has(station.properties.properties.id)) {
        result.push(station);
        processed.add(station.properties.properties.id);
      }
    }
  }

  // Second pass: process remaining stations (those without names)
  // and check for proximity duplicates across all stations
  for (let i = 0; i < stations.length; i++) {
    const station1 = stations[i];
    const id1 = station1.properties.properties.id;

    // Skip if already processed
    if (processed.has(id1)) continue;

    // Add this station to results
    result.push(station1);
    processed.add(id1);

    const point1 = station1.properties.geometry.coordinates;
    const name1 =
      station1.properties.properties['name:en'] ||
      station1.properties.properties.name ||
      '';

    // Check all remaining stations for proximity duplicates
    for (let j = i + 1; j < stations.length; j++) {
      const station2 = stations[j];
      const id2 = station2.properties.properties.id;

      // Skip if already processed
      if (processed.has(id2)) continue;

      const point2 = station2.properties.geometry.coordinates;
      const name2 =
        station2.properties.properties['name:en'] ||
        station2.properties.properties.name ||
        '';

      // Calculate distance
      const from = turf.point(point1);
      const to = turf.point(point2);
      const distance = turf.distance(from, to, { units: 'meters' });

      if (distance < distanceThresholdMeters) {
        // This is a duplicate
        processed.add(id2);
        duplicateIds.add(id2);
        duplicateDistances.set(id2, distance);
        duplicateInfo.push({
          id1,
          id2,
          distance,
          name1,
          name2,
        });
      }
    }
  }

  console.log(`Filtered out ${stations.length - result.length} duplicates`);
  console.log('Duplicates found:', duplicateInfo);

  return {
    filtered: result,
    duplicateIds,
    duplicateInfo,
    duplicateDistances,
  };
};

export const ZoneSidebar = () => {
  const $displayHidingZones = useStore(displayHidingZones);
  const $questionFinishedMapData = useStore(questionFinishedMapData);
  const $displayHidingZonesOptions = useStore(displayHidingZonesOptions);
  const $hidingRadius = useStore(hidingRadius);
  const map = useStore(leafletMapContext);
  const stations = useStore(trainStations);
  const $disabledStations = useStore(disabledStations);
  const [commandValue, setCommandValue] = useState<string>('');
  const setStations = trainStations.set;
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [duplicateThreshold, setDuplicateThreshold] = useState<number>(25);
  const [duplicatesFound, setDuplicatesFound] = useState<number>(0);
  const [showDuplicates, setShowDuplicates] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Filter out duplicate stations that are within the threshold distance of each other
  const filteredStations = useMemo(() => {
    const filtered = filterDuplicateStations(stations, duplicateThreshold);
    setDuplicatesFound(stations.length - filtered.filtered.length);
    return filtered;
  }, [stations, duplicateThreshold]);

  // Memoize sorted stations for better performance
  const sortedStations = useMemo(() => {
    if (!filteredStations || filteredStations.filtered.length === 0) return [];

    return [...filteredStations.filtered].sort((a, b) => {
      // Get station names, falling back to empty string if not available
      const nameA = (
        a.properties.properties['name:en'] ||
        a.properties.properties.name ||
        lngLatToText(a.properties.geometry.coordinates) ||
        ''
      ).toLowerCase();
      const nameB = (
        b.properties.properties['name:en'] ||
        b.properties.properties.name ||
        lngLatToText(b.properties.geometry.coordinates) ||
        ''
      ).toLowerCase();

      // Use localeCompare for proper alphabetical sorting
      return nameA.localeCompare(nameB);
    });
  }, [filteredStations]);

  // Memoize all stations sorted for display
  const allSortedStations = useMemo(() => {
    if (!stations || stations.length === 0) return [];

    return [...stations].sort((a, b) => {
      // Get station names, falling back to empty string if not available
      const nameA = (
        a.properties.properties['name:en'] ||
        a.properties.properties.name ||
        lngLatToText(a.properties.geometry.coordinates) ||
        ''
      ).toLowerCase();
      const nameB = (
        b.properties.properties['name:en'] ||
        b.properties.properties.name ||
        lngLatToText(b.properties.geometry.coordinates) ||
        ''
      ).toLowerCase();

      // Use localeCompare for proper alphabetical sorting
      return nameA.localeCompare(nameB);
    });
  }, [stations]);

  // Filtered stations for display based on search and duplicate settings
  const displayStations = useMemo(() => {
    // Start with either filtered stations or all stations based on showDuplicates
    const stationsToFilter = showDuplicates
      ? allSortedStations
      : sortedStations;

    // If there's a search term, filter by name
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return stationsToFilter.filter((station) => {
        const name = (
          station.properties.properties['name:en'] ||
          station.properties.properties.name ||
          lngLatToText(station.properties.geometry.coordinates) ||
          ''
        ).toLowerCase();
        return name.includes(term);
      });
    }

    return stationsToFilter;
  }, [sortedStations, allSortedStations, showDuplicates, searchTerm]);

  const removeHidingZones = () => {
    if (!map) return;

    map.eachLayer((layer: any) => {
      if (layer.hidingZones) {
        // Hopefully only geoJSON layers
        map.removeLayer(layer);
      }
    });
  };

  const showGeoJSON = (
    geoJSONData: any,
    nonOverlappingStations: boolean = false,
    additionalOptions: L.GeoJSONOptions = {}
  ) => {
    if (!map) return;

    removeHidingZones();

    const geoJsonLayer = L.geoJSON(geoJSONData, {
      style: {
        color: 'green',
        fillColor: 'green',
        fillOpacity: 0.2,
      },
      onEachFeature: nonOverlappingStations
        ? (feature, layer) => {
            layer.on('click', async () => {
              if (!map) return;

              setCommandValue(feature.properties.properties.id);

              await selectionProcess(
                feature,
                map,
                stations,
                showGeoJSON,
                $questionFinishedMapData,
                $hidingRadius
              ).catch((error) => {
                console.log(error);

                if (
                  document.querySelectorAll('.Toastify__toast').length === 0
                ) {
                  return toast.error('An error occurred');
                }
              });
            });
          }
        : undefined,
      pointToLayer(geoJsonPoint, latlng) {
        // Determine if this is a corridor or orbital route
        const isCorridorRoute =
          geoJsonPoint.properties.routes &&
          geoJsonPoint.properties.routes
            .split(', ')
            .some((route: string) => route.startsWith('C'));

        const isOrbitalRoute =
          geoJsonPoint.properties.routes &&
          geoJsonPoint.properties.routes
            .split(', ')
            .some(
              (route: string) =>
                route.startsWith('N') ||
                route.startsWith('S') ||
                route.startsWith('W')
            );

        const isDart =
          geoJsonPoint.properties.routes &&
          geoJsonPoint.properties.routes.includes('DART');

        const isLuasGreenLine =
          geoJsonPoint.properties.routes &&
          geoJsonPoint.properties.routes.includes('Luas Green Line');

        const isLuasRedLine =
          geoJsonPoint.properties.routes &&
          geoJsonPoint.properties.routes.includes('Luas Red Line');

        const marker = L.marker(latlng, {
          icon: L.divIcon({
            html: renderToString(
              <div className="text-black bg-opacity-0">
                {isDart ? (
                  <FaTrain className="text-blue-800" width={100} height={100} />
                ) : isLuasGreenLine ? (
                  <FaSubway
                    className="text-green-600"
                    width={100}
                    height={100}
                  />
                ) : isLuasRedLine ? (
                  <FaSubway className="text-red-600" width={100} height={100} />
                ) : isCorridorRoute && isOrbitalRoute ? (
                  <FaBus className="text-purple-600" width={100} height={100} />
                ) : isCorridorRoute ? (
                  <FaBus className="text-blue-600" width={100} height={100} />
                ) : isOrbitalRoute ? (
                  <FaBus className="text-green-600" width={100} height={100} />
                ) : (
                  <FaTrain width={100} height={100} />
                )}
              </div>
            ),
            className: '',
          }),
        });

        marker.bindPopup(
          `<b>${
            geoJsonPoint.properties.routes === 'C1, C2, C3, C4'
              ? geoJsonPoint.properties.name
              : geoJsonPoint.properties['name:en'] ||
                geoJsonPoint.properties.name ||
                'No Name Found'
          } (${lngLatToText(
            geoJsonPoint.geometry.coordinates as [number, number]
          )})</b>`
        );

        return marker;
      },
      ...additionalOptions,
    });

    // @ts-expect-error This is intentionally added as a check
    geoJsonLayer.hidingZones = true;

    geoJsonLayer.addTo(map);
  };

  useEffect(() => {
    if (!map || determiningHidingZones) return;

    const initializeHidingZones = async () => {
      determiningHidingZones = true;

      if ($displayHidingZonesOptions.length === 0) {
        toast.error('At least one place type must be selected');
        determiningHidingZones = false;
        return;
      }

      // Check if custom bus routes option is selected
      const customBusRoutesIndex =
        $displayHidingZonesOptions.indexOf('custom_bus_routes');
      const corridorBusRoutesIndex = $displayHidingZonesOptions.indexOf(
        'corridor_bus_routes'
      );
      const n2BusRoutesIndex =
        $displayHidingZonesOptions.indexOf('n2_bus_routes');
      const n4BusRoutesIndex =
        $displayHidingZonesOptions.indexOf('n4_bus_routes');
      const n6BusRoutesIndex =
        $displayHidingZonesOptions.indexOf('n6_bus_routes');
      const s2BusRoutesIndex =
        $displayHidingZonesOptions.indexOf('s2_bus_routes');
      const s4BusRoutesIndex =
        $displayHidingZonesOptions.indexOf('s4_bus_routes');
      const s6BusRoutesIndex =
        $displayHidingZonesOptions.indexOf('s6_bus_routes');
      const s8BusRoutesIndex =
        $displayHidingZonesOptions.indexOf('s8_bus_routes');
      const w2BusRoutesIndex =
        $displayHidingZonesOptions.indexOf('w2_bus_routes');
      const dartStopsIndex = $displayHidingZonesOptions.indexOf('dart_stops');
      const luasGreenLineStopsIndex = $displayHidingZonesOptions.indexOf(
        'luas_green_line_stops'
      );
      const luasRedLineStopsIndex = $displayHidingZonesOptions.indexOf(
        'luas_red_line_stops'
      );

      const hasCustomBusRoutes = customBusRoutesIndex !== -1;
      const hasCorridorBusRoutes = corridorBusRoutesIndex !== -1;
      const hasN2BusRoutes = n2BusRoutesIndex !== -1;
      const hasN4BusRoutes = n4BusRoutesIndex !== -1;
      const hasN6BusRoutes = n6BusRoutesIndex !== -1;
      const hasS2BusRoutes = s2BusRoutesIndex !== -1;
      const hasS4BusRoutes = s4BusRoutesIndex !== -1;
      const hasS6BusRoutes = s6BusRoutesIndex !== -1;
      const hasS8BusRoutes = s8BusRoutesIndex !== -1;
      const hasW2BusRoutes = w2BusRoutesIndex !== -1;
      const hasDartStops = dartStopsIndex !== -1;
      const hasLuasGreenLineStops = luasGreenLineStopsIndex !== -1;
      const hasLuasRedLineStops = luasRedLineStopsIndex !== -1;

      // Remove custom bus routes options from the options for OSM query
      let osmOptions = [...$displayHidingZonesOptions];

      if (hasCustomBusRoutes) {
        osmOptions = [
          ...osmOptions.slice(0, customBusRoutesIndex),
          ...osmOptions.slice(customBusRoutesIndex + 1),
        ];
      }

      if (hasCorridorBusRoutes) {
        const index = osmOptions.indexOf('corridor_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasN2BusRoutes) {
        const index = osmOptions.indexOf('n2_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasN4BusRoutes) {
        const index = osmOptions.indexOf('n4_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasN6BusRoutes) {
        const index = osmOptions.indexOf('n6_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasS2BusRoutes) {
        const index = osmOptions.indexOf('s2_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasS4BusRoutes) {
        const index = osmOptions.indexOf('s4_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasS6BusRoutes) {
        const index = osmOptions.indexOf('s6_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasS8BusRoutes) {
        const index = osmOptions.indexOf('s8_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasW2BusRoutes) {
        const index = osmOptions.indexOf('w2_bus_routes');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasDartStops) {
        const index = osmOptions.indexOf('dart_stops');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasLuasGreenLineStops) {
        const index = osmOptions.indexOf('luas_green_line_stops');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      if (hasLuasRedLineStops) {
        const index = osmOptions.indexOf('luas_red_line_stops');
        if (index !== -1) {
          osmOptions = [
            ...osmOptions.slice(0, index),
            ...osmOptions.slice(index + 1),
          ];
        }
      }

      // Fetch places from OSM if there are any OSM options
      let places: any[] = [];
      if (osmOptions.length > 0) {
        places = osmtogeojson(
          await findPlacesInZone(
            osmOptions[0],
            "Finding stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
            'nwr',
            'center',
            osmOptions.slice(1)
          )
        ).features;
      }

      // Add custom bus routes if selected
      if (hasCustomBusRoutes) {
        try {
          // Add custom bus routes to places directly from the imported JSON
          places = [...places, ...customBusRoutesData.features];
        } catch (error) {
          console.error('Error loading custom bus routes:', error);
          toast.error('Failed to load custom bus routes');
        }
      }

      // Add corridor bus routes if selected
      if (hasCorridorBusRoutes) {
        try {
          // Add corridor bus routes to places directly from the imported JSON
          places = [...places, ...corridorBusRoutesData.features];
        } catch (error) {
          console.error('Error loading corridor bus routes:', error);
          toast.error('Failed to load corridor bus routes');
        }
      }

      // Add N2 bus routes if selected
      if (hasN2BusRoutes) {
        try {
          places = [...places, ...n2BusRoutesData.features];
        } catch (error) {
          console.error('Error loading N2 bus routes:', error);
          toast.error('Failed to load N2 bus routes');
        }
      }

      // Add N4 bus routes if selected
      if (hasN4BusRoutes) {
        try {
          places = [...places, ...n4BusRoutesData.features];
        } catch (error) {
          console.error('Error loading N4 bus routes:', error);
          toast.error('Failed to load N4 bus routes');
        }
      }

      // Add N6 bus routes if selected
      if (hasN6BusRoutes) {
        try {
          places = [...places, ...n6BusRoutesData.features];
        } catch (error) {
          console.error('Error loading N6 bus routes:', error);
          toast.error('Failed to load N6 bus routes');
        }
      }

      // Add S2 bus routes if selected
      if (hasS2BusRoutes) {
        try {
          places = [...places, ...s2BusRoutesData.features];
        } catch (error) {
          console.error('Error loading S2 bus routes:', error);
          toast.error('Failed to load S2 bus routes');
        }
      }

      // Add S4 bus routes if selected
      if (hasS4BusRoutes) {
        try {
          places = [...places, ...s4BusRoutesData.features];
        } catch (error) {
          console.error('Error loading S4 bus routes:', error);
          toast.error('Failed to load S4 bus routes');
        }
      }

      // Add S6 bus routes if selected
      if (hasS6BusRoutes) {
        try {
          places = [...places, ...s6BusRoutesData.features];
        } catch (error) {
          console.error('Error loading S6 bus routes:', error);
          toast.error('Failed to load S6 bus routes');
        }
      }

      // Add S8 bus routes if selected
      if (hasS8BusRoutes) {
        try {
          places = [...places, ...s8BusRoutesData.features];
        } catch (error) {
          console.error('Error loading S8 bus routes:', error);
          toast.error('Failed to load S8 bus routes');
        }
      }

      // Add W2 bus routes if selected
      if (hasW2BusRoutes) {
        try {
          places = [...places, ...w2BusRoutesData.features];
        } catch (error) {
          console.error('Error loading W2 bus routes:', error);
          toast.error('Failed to load W2 bus routes');
        }
      }

      // Add DART stops if selected
      if (hasDartStops) {
        try {
          // Add DART stops to places directly from the imported JSON
          places = [...places, ...dartStopsData.features];
        } catch (error) {
          console.error('Error loading DART stops:', error);
          toast.error('Failed to load DART stops');
        }
      }

      // Add Luas Green Line stops if selected
      if (hasLuasGreenLineStops) {
        try {
          // Add Luas Green Line stops to places directly from the imported JSON
          places = [...places, ...luasGreenLineStopsData.features];
        } catch (error) {
          console.error('Error loading Luas Green Line stops:', error);
          toast.error('Failed to load Luas Green Line stops');
        }
      }

      // Add Luas Red Line stops if selected
      if (hasLuasRedLineStops) {
        try {
          // Add Luas Red Line stops to places directly from the imported JSON
          places = [...places, ...luasRedLineStopsData.features];
        } catch (error) {
          console.error('Error loading Luas Red Line stops:', error);
          toast.error('Failed to load Luas Red Line stops');
        }
      }

      const unionized = unionize(
        turf.simplify($questionFinishedMapData, {
          tolerance: 0.001,
        })
      );

      let circles = places
        .map((place: any) => {
          const radius = $hidingRadius;
          const center = turf.getCoord(place);
          const circle = turf.circle(center, radius, {
            steps: 32,
            units: 'miles', // As per the rules
            properties: place,
          });

          return circle;
        })
        .filter((circle) => {
          return !turf.booleanWithin(circle, unionized!);
        });

      for (const question of questions.get()) {
        if (
          question.id === 'matching' &&
          (question.data.type === 'same-first-letter-station' ||
            question.data.type === 'same-length-station' ||
            question.data.type === 'same-train-line')
        ) {
          const location = turf.point([question.data.lng, question.data.lat]);

          const nearestTrainStation = turf.nearestPoint(
            location,
            turf.featureCollection(circles.map((x) => x.properties)) as any
          );

          if (question.data.type === 'same-train-line') {
            const nodes = await trainLineNodeFinder(
              nearestTrainStation.properties.id
            );

            if (nodes.length === 0) {
              toast.warning(
                `No train line found for ${
                  nearestTrainStation.properties['name:en'] ||
                  nearestTrainStation.properties.name
                }`
              );
              continue;
            } else {
              circles = circles.filter((circle: any) => {
                const id = parseInt(
                  circle.properties.properties.id.split('/')[1]
                );

                return question.data.same
                  ? nodes.includes(id)
                  : !nodes.includes(id);
              });
            }
          }

          const englishName =
            nearestTrainStation.properties['name:en'] ||
            nearestTrainStation.properties.name;

          if (!englishName) return toast.error('No English name found');

          if (question.data.type === 'same-first-letter-station') {
            const letter = englishName[0].toUpperCase();

            circles = circles.filter((circle: any) => {
              const name =
                circle.properties.properties['name:en'] ||
                circle.properties.properties.name;

              if (!name) return false;

              return question.data.same
                ? name[0].toUpperCase() === letter
                : name[0].toUpperCase() !== letter;
            });
          } else if (question.data.type === 'same-length-station') {
            const length = englishName.length;

            circles = circles.filter((circle: any) => {
              const name =
                circle.properties.properties['name:en'] ||
                circle.properties.properties.name;

              if (!name) return false;

              return question.data.same
                ? name.length === length
                : name.length !== length;
            });
          }
        }
        if (
          question.id === 'measuring' &&
          (question.data.type === 'mcdonalds' ||
            question.data.type === 'seven11')
        ) {
          const points = await findPlacesSpecificInZone(
            question.data.type === 'mcdonalds'
              ? QuestionSpecificLocation.McDonalds
              : QuestionSpecificLocation.Seven11
          );

          const nearestPoint = turf.nearestPoint(
            turf.point([question.data.lng, question.data.lat]),
            points as any
          );

          const distance = turf.distance(
            turf.point([question.data.lng, question.data.lat]),
            nearestPoint as any,
            {
              units: 'miles',
            }
          );

          circles = circles.filter((circle: any) => {
            const point = turf.point(turf.getCoord(circle.properties));

            const nearest = turf.nearestPoint(point, points as any);

            return question.data.hiderCloser
              ? turf.distance(point, nearest as any, {
                  units: 'miles',
                }) <
                  distance + $hidingRadius
              : turf.distance(point, nearest as any, {
                  units: 'miles',
                }) >
                  distance - $hidingRadius;
          });
        }
      }

      setCommandValue('');
      showGeoJSON(
        turf.featureCollection(
          circles.filter(
            (x) => !$disabledStations.includes(x.properties.properties.id)
          )
        ),
        true
      );

      setStations(circles);
      determiningHidingZones = false;
    };

    if ($displayHidingZones && $questionFinishedMapData) {
      initializeHidingZones().catch((error) => {
        console.log(error);

        if (document.querySelectorAll('.Toastify__toast').length === 0) {
          determiningHidingZones = false;
          return toast.error('An error occurred');
        }
      });
    }

    if (!$displayHidingZones) {
      map.eachLayer((layer: any) => {
        if (layer.hidingZones) {
          // Hopefully only geoJSON layers
          map.removeLayer(layer);
        }
      });
    }
  }, [
    $questionFinishedMapData,
    $displayHidingZones,
    $displayHidingZonesOptions,
    $hidingRadius,
  ]);

  return (
    <Sidebar side="right">
      <h2 className="ml-4 mt-4 font-poppins text-2xl">Hiding Zone</h2>
      <SidebarContent ref={sidebarRef}>
        <ScrollToTop element={sidebarRef} minHeight={500} />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Label className="font-semibold font-poppins">
                  Display hiding zones?
                </Label>
                <Checkbox
                  defaultChecked={$displayHidingZones}
                  checked={$displayHidingZones}
                  onCheckedChange={displayHidingZones.set}
                />
              </SidebarMenuItem>
              <SidebarMenuItem
                className={cn(MENU_ITEM_CLASSNAME, 'text-orange-500')}
              >
                Warning: This feature can drastically slow down your device.
              </SidebarMenuItem>
              <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <MultiSelect
                  options={[
                    {
                      label: 'Railway Stations',
                      value: '[railway=station]',
                    },
                    {
                      label: 'Railway Halts',
                      value: '[railway=halt]',
                    },
                    {
                      label: 'Railway Stops',
                      value: '[railway=stop]',
                    },
                    {
                      label: 'Tram Stops',
                      value: '[railway=tram_stop]',
                    },
                    {
                      label: 'Bus Stops',
                      value: '[highway=bus_stop]',
                    },
                    {
                      label: 'Corridor Routes (C1-C4, Every 2nd Stop)',
                      value: 'corridor_bus_routes',
                    },
                    {
                      label: 'N2 Route (Every 2nd Stop)',
                      value: 'n2_bus_routes',
                    },
                    {
                      label: 'N4 Route (Every 2nd Stop)',
                      value: 'n4_bus_routes',
                    },
                    {
                      label: 'N6 Route (Every 2nd Stop)',
                      value: 'n6_bus_routes',
                    },
                    {
                      label: 'S2 Route (Every 2nd Stop)',
                      value: 's2_bus_routes',
                    },
                    {
                      label: 'S4 Route (Every 2nd Stop)',
                      value: 's4_bus_routes',
                    },
                    {
                      label: 'S6 Route (Every 2nd Stop)',
                      value: 's6_bus_routes',
                    },
                    {
                      label: 'S8 Route (Every 2nd Stop)',
                      value: 's8_bus_routes',
                    },
                    {
                      label: 'W2 Route (Every 2nd Stop)',
                      value: 'w2_bus_routes',
                    },
                    {
                      label: 'DART',
                      value: 'dart_stops',
                    },
                    {
                      label: 'Luas Green Line',
                      value: 'luas_green_line_stops',
                    },
                    {
                      label: 'Luas Red Line',
                      value: 'luas_red_line_stops',
                    },
                  ]}
                  onValueChange={displayHidingZonesOptions.set}
                  defaultValue={$displayHidingZonesOptions}
                  placeholder="Select allowed places"
                  animation={2}
                  maxCount={3}
                  modalPopover
                  className="!bg-popover bg-opacity-100"
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Label className="font-semibold font-poppins ml-2">
                  Hiding Zone Radius
                </Label>
                <div className={cn(MENU_ITEM_CLASSNAME, 'gap-2 flex flex-row')}>
                  <Input
                    type="number"
                    className="rounded-md p-2 w-16"
                    defaultValue={$hidingRadius}
                    onChange={(e) => {
                      hidingRadius.set(parseFloat(e.target.value));
                    }}
                  />
                  <Select value="miles" disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="miles">Miles</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Label className="font-semibold font-poppins ml-2">
                  Duplicate Station Threshold
                </Label>
                <div
                  className={cn(
                    MENU_ITEM_CLASSNAME,
                    'gap-2 flex flex-row items-center'
                  )}
                >
                  <Input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    className="flex-grow"
                    value={duplicateThreshold}
                    onChange={(e) => {
                      setDuplicateThreshold(parseInt(e.target.value, 10));
                    }}
                  />
                  <Input
                    type="number"
                    className="rounded-md p-2 w-16"
                    value={duplicateThreshold}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (!isNaN(value) && value > 0) {
                        setDuplicateThreshold(value);
                      }
                    }}
                  />
                  <span className="text-sm">meters</span>
                </div>
                {duplicatesFound > 0 && (
                  <div className="text-xs text-muted-foreground ml-2 mt-1">
                    {duplicatesFound} duplicate stations filtered
                  </div>
                )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-duplicates"
                    checked={showDuplicates}
                    onCheckedChange={(checked) => {
                      if (typeof checked === 'boolean') {
                        setShowDuplicates(checked);
                      }
                    }}
                  />
                  <Label
                    htmlFor="show-duplicates"
                    className="font-semibold font-poppins"
                  >
                    Show Duplicates ({duplicatesFound})
                  </Label>
                </div>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Label className="font-semibold font-poppins ml-2">
                  Search
                </Label>
                <Input
                  type="text"
                  className="rounded-md p-2 w-32"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                  }}
                />
              </SidebarMenuItem>
              {$displayHidingZones && filteredStations.filtered.length > 0 && (
                <SidebarMenuItem
                  className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                  onClick={removeHidingZones}
                >
                  No Display
                </SidebarMenuItem>
              )}
              {$displayHidingZones && filteredStations.filtered.length > 0 && (
                <SidebarMenuItem
                  className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                  onClick={() => {
                    setCommandValue('');
                    showGeoJSON(
                      turf.featureCollection(
                        filteredStations.filtered
                          .filter(
                            (x) => x.properties.properties.id !== commandValue
                          )
                          .map((x) => x.properties)
                      ),
                      false
                    );
                  }}
                >
                  All Stations
                </SidebarMenuItem>
              )}
              {$displayHidingZones && filteredStations.filtered.length > 0 && (
                <SidebarMenuItem
                  className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                  onClick={() => {
                    setCommandValue('');
                    showGeoJSON(
                      turf.featureCollection(
                        filteredStations.filtered.filter(
                          (x) =>
                            !$disabledStations.includes(
                              x.properties.properties.id
                            )
                        )
                      ),
                      true
                    );
                  }}
                >
                  All Zones
                </SidebarMenuItem>
              )}
              {$displayHidingZones && filteredStations.filtered.length > 0 && (
                <SidebarMenuItem
                  className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                  onClick={() => {
                    setCommandValue('');
                    showGeoJSON(
                      unionize(
                        turf.featureCollection(
                          filteredStations.filtered.filter(
                            (x) =>
                              !$disabledStations.includes(
                                x.properties.properties.id
                              )
                          )
                        )
                      )
                    );
                  }}
                >
                  No Overlap
                </SidebarMenuItem>
              )}
              {$displayHidingZones && commandValue && (
                <SidebarMenuItem
                  className={cn(
                    MENU_ITEM_CLASSNAME,
                    'bg-popover hover:bg-accent'
                  )}
                >
                  Current:{' '}
                  {filteredStations.filtered.find(
                    (x) => x.properties.properties.id === commandValue
                  )?.properties.properties['name:en'] ||
                    filteredStations.filtered.find(
                      (x) => x.properties.properties.id === commandValue
                    )?.properties.properties.name ||
                    lngLatToText(
                      filteredStations.filtered.find(
                        (x) => x.properties.properties.id === commandValue
                      )?.properties.geometry.coordinates
                    )}
                </SidebarMenuItem>
              )}
              {$displayHidingZones && $disabledStations.length > 0 && (
                <SidebarMenuItem
                  className="bg-popover hover:bg-accent relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
                  onClick={() => {
                    disabledStations.set([]);

                    showGeoJSON(
                      turf.featureCollection(filteredStations.filtered),
                      true
                    );
                  }}
                >
                  Clear Disabled
                </SidebarMenuItem>
              )}
              {$displayHidingZones && (
                <Command>
                  <CommandInput
                    placeholder="Search for a hiding zone..."
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                  />
                  <CommandList className="max-h-full">
                    <CommandEmpty>No hiding zones found.</CommandEmpty>
                    {
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Filtered out{' '}
                        {stations.length - filteredStations.filtered.length}{' '}
                        duplicate stations (within {duplicateThreshold}m).{' '}
                        {filteredStations.filtered.length} stations remaining.
                      </div>
                    }
                    <CommandGroup>
                      {displayStations.map((station) => {
                        const isDuplicate = filteredStations.duplicateIds.has(
                          station.properties.properties.id
                        );
                        const stationName =
                          station.properties.properties['name:en'] ||
                          station.properties.properties.name ||
                          lngLatToText(station.properties.geometry.coordinates);
                        const distance =
                          filteredStations.duplicateDistances.get(
                            station.properties.properties.id
                          );

                        return (
                          <CommandItem
                            key={station.properties.properties.id}
                            data-station-id={station.properties.properties.id}
                            className={cn(
                              $disabledStations.includes(
                                station.properties.properties.id
                              ) && 'line-through',
                              isDuplicate && 'bg-red-50 dark:bg-red-950/20'
                            )}
                            onSelect={async () => {
                              if (!map) return;

                              setTimeout(() => {
                                if (buttonJustClicked) {
                                  buttonJustClicked = false;
                                  return;
                                }

                                if (
                                  $disabledStations.includes(
                                    station.properties.properties.id
                                  )
                                ) {
                                  disabledStations.set([
                                    ...$disabledStations.filter(
                                      (x) =>
                                        x !== station.properties.properties.id
                                    ),
                                  ]);
                                } else {
                                  disabledStations.set([
                                    ...$disabledStations,
                                    station.properties.properties.id,
                                  ]);
                                }

                                setStations([...stations]);

                                showGeoJSON(
                                  turf.featureCollection(
                                    filteredStations.filtered.filter(
                                      (x) =>
                                        !disabledStations
                                          .get()
                                          .includes(x.properties.properties.id)
                                    )
                                  ),
                                  true
                                );
                              }, 100);
                            }}
                          >
                            <div className="flex-1">
                              {stationName}
                              {isDuplicate && (
                                <span className="ml-2 text-xs text-red-500 font-semibold">
                                  (duplicate
                                  {distance ? ` - ${distance.toFixed(1)}m` : ''}
                                  )
                                </span>
                              )}
                            </div>
                            <button
                              onClick={async () => {
                                if (!map) return;

                                buttonJustClicked = true;

                                setCommandValue(
                                  station.properties.properties.id
                                );

                                await selectionProcess(
                                  station,
                                  map,
                                  filteredStations.filtered,
                                  showGeoJSON,
                                  $questionFinishedMapData,
                                  $hidingRadius
                                ).catch((error) => {
                                  console.log(error);

                                  if (
                                    document.querySelectorAll(
                                      '.Toastify__toast'
                                    ).length === 0
                                  ) {
                                    return toast.error('An error occurred');
                                  }
                                });
                              }}
                              className="bg-slate-600 p-0.5 rounded-md"
                            >
                              View
                            </button>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

const BLANK_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -90],
            [180, -90],
            [180, 90],
            [-180, 90],
            [-180, -90],
          ],
        ],
      },
    },
  ],
};

async function selectionProcess(
  station: any,
  map: L.Map,
  stations: any[],
  showGeoJSON: (geoJSONData: any) => void,
  $questionFinishedMapData: any,
  $hidingRadius: number
) {
  const bbox = turf.bbox(station);

  const bounds: [[number, number], [number, number]] = [
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]],
  ];

  let mapData: any = turf.featureCollection([
    unionize(
      turf.featureCollection([
        ...$questionFinishedMapData.features,
        turf.mask(station),
      ])
    )!,
  ]);

  for (const question of questions.get()) {
    if (
      (question.id === 'measuring' || question.id === 'matching') &&
      (question.data.type === 'aquarium' ||
        question.data.type === 'zoo' ||
        question.data.type === 'theme_park' ||
        question.data.type === 'museum' ||
        question.data.type === 'hospital' ||
        question.data.type === 'cinema' ||
        question.data.type === 'library' ||
        question.data.type === 'golf_course' ||
        question.data.type === 'consulate' ||
        question.data.type === 'park')
    ) {
      const nearestQuestion = await nearestToQuestion(question.data);

      let radius = 30;

      let instances: any = { features: [] };

      const nearestPoints = [];

      while (instances.features.length === 0) {
        instances = await findTentacleLocations(
          {
            lat: station.properties.geometry.coordinates[1],
            lng: station.properties.geometry.coordinates[0],
            radius: radius,
            unit: 'miles',
            location: false,
            locationType: question.data.type,
            drag: false,
            color: 'black',
          },
          'Finding matching locations to hiding zone...'
        );

        const distances: any[] = instances.features.map((x: any) => {
          return {
            distance: turf.distance(
              turf.point(turf.getCoord(x)),
              station.properties,
              {
                units: 'miles',
              }
            ),
            point: x,
          };
        });

        if (distances.length === 0) {
          radius += 30;
          continue;
        }

        const minimumPoint = _.minBy(distances, 'distance')!;

        if (minimumPoint.distance + $hidingRadius * 2 > radius) {
          radius = minimumPoint.distance + $hidingRadius * 2;
          continue;
        }

        nearestPoints.push(
          ...distances
            .filter(
              (x) =>
                x.distance < minimumPoint.distance + $hidingRadius * 2 &&
                x.point.properties.name // If it doesn't have a name, it's not a valid location
            )
            .map((x) => x.point)
        );
      }

      if (question.id === 'matching') {
        const voronoi = geoSpatialVoronoi(
          turf.featureCollection(nearestPoints)
        );

        const correctPolygon = voronoi.features.find((feature: any) => {
          return (
            feature.properties.site.properties.name ===
            nearestQuestion.properties.name
          );
        });

        if (!correctPolygon) {
          if (question.data.same) {
            mapData = BLANK_GEOJSON;
          }

          continue;
        }

        if (question.data.same) {
          mapData = unionize(
            turf.featureCollection([
              ...mapData.features,
              turf.mask(correctPolygon),
            ])
          )!;
        } else {
          mapData = unionize(
            turf.featureCollection([...mapData.features, correctPolygon])
          )!;
        }
      } else {
        const circles = nearestPoints.map((x) =>
          turf.circle(
            turf.getCoord(x),
            nearestQuestion.properties.distanceToPoint
          )
        );

        if (question.data.hiderCloser) {
          mapData = unionize(
            turf.featureCollection([
              ...mapData.features,
              holedMask(turf.featureCollection(circles)),
            ])
          )!;
        } else {
          mapData = unionize(
            turf.featureCollection([...mapData.features, ...circles])
          )!;
        }
      }
    }
    if (question.id === 'measuring' && question.data.type === 'rail-measure') {
      const location = turf.point([question.data.lng, question.data.lat]);

      const nearestTrainStation = turf.nearestPoint(
        location,
        turf.featureCollection(stations.map((x) => x.properties.geometry))
      );

      const distance = turf.distance(location, nearestTrainStation);

      const circles = stations
        .filter(
          (x) =>
            turf.distance(station.properties.geometry, x.properties.geometry) <
            distance + 1.61 * $hidingRadius
        )
        .map((x) => turf.circle(x.properties.geometry, distance));

      if (question.data.hiderCloser) {
        mapData = unionize(
          turf.featureCollection([
            ...mapData.features,
            holedMask(turf.featureCollection(circles)),
          ])
        )!;
      } else {
        mapData = unionize(
          turf.featureCollection([...mapData.features, ...circles])
        )!;
      }
    }
    if (
      question.id === 'measuring' &&
      (question.data.type === 'mcdonalds' || question.data.type === 'seven11')
    ) {
      const points = await findPlacesSpecificInZone(
        question.data.type === 'mcdonalds'
          ? QuestionSpecificLocation.McDonalds
          : QuestionSpecificLocation.Seven11
      );

      const seeker = turf.point([question.data.lng, question.data.lat]);
      const nearest = turf.nearestPoint(seeker, points as any);

      const distance = turf.distance(seeker, nearest, {
        units: 'miles',
      });

      const filtered = points.features.filter(
        (x) =>
          turf.distance(x as any, station.properties.geometry, {
            units: 'miles',
          }) <
          distance + $hidingRadius
      );

      const circles = filtered.map((x) =>
        turf.circle(x as any, distance, {
          units: 'miles',
        })
      );

      if (question.data.hiderCloser) {
        mapData = unionize(
          turf.featureCollection([
            ...mapData.features,
            holedMask(turf.featureCollection(circles)),
          ])
        )!;
      } else {
        mapData = unionize(
          turf.featureCollection([...mapData.features, ...circles])
        )!;
      }
    }

    if (mapData.type !== 'FeatureCollection') {
      mapData = {
        type: 'FeatureCollection',
        features: [mapData],
      };
    }
  }

  if (_.isEqual(mapData, BLANK_GEOJSON)) {
    toast.warning(
      "The hider cannot be in this hiding zone. This wasn't eliminated on the sidebar as its absence was caused by multiple criteria."
    );
  }

  showGeoJSON(mapData);

  if (animateMapMovements.get()) {
    map?.flyToBounds(bounds);
  } else {
    map?.fitBounds(bounds);
  }

  const element: HTMLDivElement | null = document.querySelector(
    `[data-station-id="${station.properties.properties.id}"]`
  );

  if (element) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    element.classList.add('selected-card-background-temporary');

    setTimeout(() => {
      element.classList.remove('selected-card-background-temporary');
    }, 5000);
  }
}
