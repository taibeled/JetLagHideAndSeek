import { useStore } from "@nanostores/react";
import type { FeatureCollection } from "geojson";
import * as turf from "@turf/turf";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, FeatureGroup, Pane, Tooltip } from "react-leaflet";

import { hiderMode, questions, triggerLocalRefresh } from "@/lib/context";
import {
    findHomeGamePoiPointsInPlayZone,
    findTentacleLocations,
    ICON_COLORS,
} from "@/maps/api";
import type {
    APILocations,
    MatchingQuestion,
    MeasuringQuestion,
    TentacleQuestion,
    TraditionalTentacleQuestion,
    Units,
} from "@/maps/schema";

/** Above Leaflet overlayPane (400), below markerPane (600). Keeps taps reaching POI CircleMarkers instead of hiding-zone GeoJSON drawn imperatively on overlayPane. */
const POI_CANDIDATES_PANE_Z = 550;

const HOME_GAME_POI_TYPES = new Set<string>([
    "aquarium",
    "zoo",
    "theme_park",
    "peak",
    "museum",
    "hospital",
    "cinema",
    "library",
    "golf_course",
    "consulate",
    "park",
]);

function isHomeGameMeasuringPoiType(
    type: MeasuringQuestion["type"],
): type is APILocations {
    return HOME_GAME_POI_TYPES.has(type);
}

function matchingTypeToPoiOverlayLocation(
    type: MatchingQuestion["type"],
): APILocations | null {
    if (HOME_GAME_POI_TYPES.has(type)) {
        return type as APILocations;
    }
    if (typeof type === "string" && type.endsWith("-full")) {
        const base = type.slice(0, -"-full".length);
        if (HOME_GAME_POI_TYPES.has(base)) {
            return base as APILocations;
        }
    }
    return null;
}

function filterPointsWithinRadius(
    points: FeatureCollection,
    centerLng: number,
    centerLat: number,
    radius: number,
    unit: Units,
): FeatureCollection {
    if (
        centerLng === null ||
        centerLat === null ||
        radius === undefined ||
        radius === null
    ) {
        return points;
    }
    const center = turf.point([centerLng, centerLat]);

    return turf.featureCollection(
        points.features.filter((feature: any) => {
            const coords =
                feature?.geometry?.coordinates ??
                (feature?.properties?.lon && feature?.properties?.lat
                    ? [feature.properties.lon, feature.properties.lat]
                    : null);

            if (!coords) return false;

            const pt = turf.point(coords);
            const dist = turf.distance(center, pt, { units: unit });
            return dist <= radius;
        }),
    );
}

function candidateMarkerColor(questionColor: keyof typeof ICON_COLORS) {
    return ICON_COLORS[questionColor] ?? ICON_COLORS.blue;
}

function TentacleTraditionalCandidates({
    questionKey,
    snapshot,
}: {
    questionKey: number;
    snapshot: TraditionalTentacleQuestion;
}) {
    const [features, setFeatures] = useState<FeatureCollection | null>(null);

    useEffect(() => {
        let cancelled = false;
        void findTentacleLocations(snapshot).then((raw) => {
            if (cancelled) return;
            const filtered = filterPointsWithinRadius(
                raw,
                snapshot.lng,
                snapshot.lat,
                snapshot.radius,
                snapshot.unit,
            );
            setFeatures(filtered);
        });
        return () => {
            cancelled = true;
        };
    }, [
        questionKey,
        snapshot.lat,
        snapshot.lng,
        snapshot.radius,
        snapshot.unit,
        snapshot.locationType,
    ]);

    const loc = snapshot.location;
    const selectedName =
        loc && typeof loc === "object" && "properties" in loc
            ? loc.properties?.name
            : null;

    const stroke = candidateMarkerColor(snapshot.color);

    if (!features || features.features.length === 0) return null;

    return (
        <>
            {features.features.map((feature: any, i: number) => {
                const coords = feature?.geometry?.coordinates;
                if (
                    !coords ||
                    typeof coords[0] !== "number" ||
                    typeof coords[1] !== "number"
                )
                    return null;
                const name = feature.properties?.name ?? "POI";
                const isSelected =
                    selectedName !== null && feature.properties?.name === selectedName;
                const [lng, lat] = coords;
                return (
                    <CircleMarker
                        key={`t-${questionKey}-${name}-${i}`}
                        center={[lat, lng]}
                        radius={isSelected ? 9 : 6}
                        pathOptions={{
                            color: isSelected ? "#ffffff" : stroke,
                            fillColor: stroke,
                            fillOpacity: isSelected ? 1 : 0.75,
                            weight: isSelected ? 3 : 1.5,
                        }}
                        interactive
                    >
                        <Tooltip
                            direction="top"
                            offset={[0, -4]}
                            opacity={0.9}
                            sticky
                        >
                            {name}
                        </Tooltip>
                    </CircleMarker>
                );
            })}
        </>
    );
}

function PlayZonePoiCandidates({
    questionKey,
    locationType,
    color,
    markerKeyPrefix,
    loadingText,
}: {
    questionKey: number;
    locationType: APILocations;
    color: keyof typeof ICON_COLORS;
    markerKeyPrefix: string;
    loadingText: string;
}) {
    const [features, setFeatures] = useState<FeatureCollection | null>(null);
    const $refresh = useStore(triggerLocalRefresh);

    useEffect(() => {
        let cancelled = false;
        void findHomeGamePoiPointsInPlayZone(locationType, loadingText).then(
            (fc) => {
                if (cancelled) return;
                setFeatures(fc);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [questionKey, locationType, loadingText, $refresh]);

    const stroke = candidateMarkerColor(color);

    if (!features || features.features.length === 0) return null;

    return (
        <>
            {features.features.map((feature: any, i: number) => {
                const coords = feature?.geometry?.coordinates;
                if (
                    !coords ||
                    typeof coords[0] !== "number" ||
                    typeof coords[1] !== "number"
                )
                    return null;
                const name = feature.properties?.name ?? "POI";
                const [lng, lat] = coords;
                return (
                    <CircleMarker
                        key={`${markerKeyPrefix}${questionKey}-${name}-${i}`}
                        center={[lat, lng]}
                        radius={6}
                        pathOptions={{
                            color: stroke,
                            fillColor: stroke,
                            fillOpacity: 0.72,
                            weight: 1.5,
                        }}
                        interactive
                    >
                        <Tooltip
                            direction="top"
                            offset={[0, -4]}
                            opacity={0.9}
                            sticky
                        >
                            {name}
                        </Tooltip>
                    </CircleMarker>
                );
            })}
        </>
    );
}

/**
 * Map overlay for POI-backed tentacle (traditional), home-game measuring, and eligible matching questions when unlocked.
 * Custom tentacle markers remain in PolygonDraw.
 */
export function PoiCandidatesLayer() {
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);

    const layers = useMemo(() => {
        return $questions.flatMap((q) => {
            if (!q.data?.drag) return [];

            if (q.id === "tentacles") {
                const data = q.data as TentacleQuestion;
                if (data.locationType === "custom") return [];
                const snap = data as TraditionalTentacleQuestion;
                return [
                    <TentacleTraditionalCandidates
                        key={q.key}
                        questionKey={q.key}
                        snapshot={snap}
                    />,
                ];
            }

            if (q.id === "measuring" && isHomeGameMeasuringPoiType(q.data.type)) {
                return [
                    <PlayZonePoiCandidates
                        key={q.key}
                        questionKey={q.key}
                        locationType={q.data.type}
                        color={q.data.color}
                        markerKeyPrefix="m-"
                        loadingText="Loading measuring POIs..."
                    />,
                ];
            }

            if (q.id === "matching") {
                const loc = matchingTypeToPoiOverlayLocation(q.data.type);
                if (!loc) return [];
                return [
                    <PlayZonePoiCandidates
                        key={q.key}
                        questionKey={q.key}
                        locationType={loc}
                        color={q.data.color}
                        markerKeyPrefix="match-"
                        loadingText="Loading matching POIs..."
                    />,
                ];
            }

            return [];
        });
    }, [$questions]);

    if ($hiderMode !== false) return null;

    if (layers.length === 0) return null;

    return (
        <Pane
            name="poiCandidatesPane"
            style={{ zIndex: POI_CANDIDATES_PANE_Z }}
        >
            <FeatureGroup>{layers}</FeatureGroup>
        </Pane>
    );
}
