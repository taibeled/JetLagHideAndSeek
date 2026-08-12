import "leaflet-draw/dist/leaflet.draw.css";

import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type {
    FeatureCollection,
    MultiPolygon,
    Polygon as GeoJSONPolygon,
} from "geojson";
import L from "leaflet";
import uniqBy from "lodash/uniqBy";
import { useEffect, useRef, useState } from "react";
import { FeatureGroup, Marker, Polygon, Polyline } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";

import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import {
    autoSave,
    drawingQuestionKey,
    mapGeoJSON,
    polyGeoJSON,
    questionModified,
    questions,
    save,
} from "@/lib/context";
import { CacheType, clearCache } from "@/maps/api";
import { lngLatToText } from "@/maps/geo-utils";
import type {
    CustomMatchingQuestion,
    CustomMeasuringQuestion,
    CustomTentacleQuestion,
    Question,
} from "@/maps/schema";

/** The drawn layers, or null when the feature group is not mounted yet. */
const drawnLayers = (featureGroup: any): any[] | null =>
    featureGroup?._layers ? Object.values(featureGroup._layers) : null;

/** Drops the layers that are re-rendered from question data instead. */
const removeLayersExcept = (
    featureGroup: any,
    keep: (options: any) => boolean,
) => {
    if (!featureGroup) return;

    Object.values(featureGroup._layers).forEach((layer: any) => {
        if (!keep(layer.options)) {
            featureGroup.removeLayer(layer);
        }
    });
};

/** Leaflet sometimes hands back the same point twice. */
const uniqueByCoordinates = (features: any[]) =>
    uniqBy(
        features as CustomTentacleQuestion["places"],
        (x) => x.geometry.coordinates.join(","),
    );

const swapCoordinates = (geojson: any) => {
    return JSON.parse(JSON.stringify(geojson), (_key, value) => {
        if (
            Array.isArray(value) &&
            value.length >= 2 &&
            typeof value[0] === "number" &&
            typeof value[1] === "number"
        ) {
            return [value[1], value[0], ...value.slice(2)];
        }
        return value;
    });
};

/**
 * Red outline for the shapes mirroring a question's saved geometry. `isSpecial`
 * is forwarded into the Leaflet layer options so onChange can tell these
 * re-rendered layers apart from freshly drawn ones.
 */
const outlinedShape = (feature: any) => ({
    positions: swapCoordinates(feature.geometry.coordinates),
    isSpecial: true,
    stroke: true,
    pathOptions: { color: "red" },
    fill: false,
});

/**
 * Marker whose dialog edits the point's coordinates in place. Tentacle points
 * also carry an editable name; matching and measuring points do not.
 */
const EditablePointMarker = ({
    point,
    editableName = false,
}: {
    point:
        | CustomTentacleQuestion["places"][number]
        | CustomMatchingQuestion["geo"][number]
        | CustomMeasuringQuestion["geo"]["features"][number];
    editableName?: boolean;
}) => {
    const $autoSave = useStore(autoSave);
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Marker
                position={[
                    point.geometry.coordinates[1],
                    point.geometry.coordinates[0],
                ]}
                // @ts-expect-error These are passed to options, so they are not typed
                properties={editableName ? point.properties : undefined}
                isDialog={editableName ? undefined : true}
                eventHandlers={{
                    click: () => {
                        setOpen(true);
                    },
                }}
            />
            <DialogContent>
                <div className="flex flex-col gap-2">
                    {editableName && (
                        <Input
                            className="text-center text-2xl! font-bold font-poppins mt-3"
                            value={point.properties?.name}
                            onChange={(e) => {
                                point.properties.name = e.target.value;
                                questionModified();
                            }}
                        />
                    )}
                    <SidebarMenu>
                        <LatitudeLongitude
                            latitude={point.geometry.coordinates[1]}
                            longitude={point.geometry.coordinates[0]}
                            inlineEdit
                            onChange={(lat, lng) => {
                                if (lat) {
                                    point.geometry.coordinates[1] = lat;
                                }
                                if (lng) {
                                    point.geometry.coordinates[0] = lng;
                                }

                                questionModified();
                            }}
                        />
                        {!$autoSave && (
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500 mt-2"
                                    onClick={save}
                                >
                                    Save
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                    </SidebarMenu>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export const PolygonDraw = () => {
    const $drawingQuestionKey = useStore(drawingQuestionKey);
    const $questions = useStore(questions);

    const featureRef = useRef<any | null>(null);

    let question: Question | undefined;

    if ($drawingQuestionKey === -1) {
        L.drawLocal.draw.toolbar.buttons.polygon = "Draw the hiding zone!";
    } else {
        question = $questions.find((q) => q.key === $drawingQuestionKey);

        if (question?.data.drag === false) {
            drawingQuestionKey.set(-1);
        }
        if (question?.id === "matching") {
            L.drawLocal.draw.toolbar.buttons.polygon =
                "Draw the matching zone(s)!";
        }
        if (question?.id === "measuring") {
            L.drawLocal.draw.toolbar.buttons.polygon =
                "Draw the measuring zone(s)!";
        }
    }

    const onChange = () => {
        const layers = drawnLayers(featureRef.current);
        if (!layers) return;

        const drawnFeatures = () => layers.map((layer: any) => layer.toGeoJSON());

        if (drawingQuestionKey.get() === -1) {
            const geoJSON = turf.featureCollection(
                drawnFeatures(),
            ) as FeatureCollection<GeoJSONPolygon | MultiPolygon>;

            mapGeoJSON.set(geoJSON);
            polyGeoJSON.set(geoJSON);
            questions.set([]);
            clearCache(CacheType.ZONE_CACHE);
        } else if (
            question?.id === "tentacles" &&
            question.data.locationType === "custom"
        ) {
            const geoJSONs = layers.map((layer: any) => {
                const geoJSON = layer.toGeoJSON();
                geoJSON.properties = layer.options.properties;

                if (!geoJSON.properties) {
                    geoJSON.properties = {
                        name: lngLatToText(geoJSON.geometry.coordinates),
                    };
                }

                return geoJSON;
            });

            question.data.places = uniqueByCoordinates(geoJSONs);
            removeLayersExcept(featureRef.current, (o) => !!o.properties);
            questionModified();
        } else if (
            question?.id === "matching" &&
            question.data.type === "custom-zone"
        ) {
            question.data.geo = turf.combine(
                turf.featureCollection(drawnFeatures()),
            ).features[0];
            removeLayersExcept(featureRef.current, (o) => !!o.isSpecial);
            questionModified();
        } else if (
            question?.id === "matching" &&
            question.data.type === "custom-points"
        ) {
            question.data.geo = uniqueByCoordinates(drawnFeatures());
            removeLayersExcept(featureRef.current, (o) => !!o.isDialog);
            questionModified();
        } else if (
            question?.id === "measuring" &&
            question.data.type === "custom-measure"
        ) {
            question.data.geo = turf.featureCollection(
                uniqueByCoordinates(drawnFeatures()),
            );
            removeLayersExcept(
                featureRef.current,
                (o) => !!o.isSpecial || !!o.isDialog,
            );
            questionModified();
        }
    };

    useEffect(() => {
        if (featureRef.current && $drawingQuestionKey === -1) {
            featureRef.current.clearLayers();
        }
    }, [$drawingQuestionKey]);

    return (
        <FeatureGroup ref={featureRef}>
            {question &&
                question.id === "tentacles" &&
                question.data.locationType === "custom" &&
                question.data.places.map((x) => (
                    <EditablePointMarker
                        key={x.geometry.coordinates.join(",")}
                        point={x}
                        editableName
                    />
                ))}
            {question &&
                question.id === "matching" &&
                question.data.type === "custom-points" &&
                question.data.geo.map((x: any) => (
                    <EditablePointMarker
                        key={x.geometry.coordinates.join(",")}
                        point={x}
                    />
                ))}
            {question &&
                question.id === "measuring" &&
                question.data.type === "custom-measure" &&
                turf.flatten(question.data.geo).features.map((x: any) => {
                    const key = x.geometry.coordinates.join(",");

                    switch (turf.getType(x)) {
                        case "Point":
                            return <EditablePointMarker key={key} point={x} />;
                        case "Polygon":
                            return (
                                <Polygon key={key} {...outlinedShape(x)} />
                            );
                        case "LineString":
                            return (
                                <Polyline key={key} {...outlinedShape(x)} />
                            );
                        default:
                            return null;
                    }
                })}
            {question &&
                question.id === "matching" &&
                question.data.type === "custom-zone" &&
                question.data.geo &&
                (question.data.geo.type === "FeatureCollection"
                    ? turf.flatten(question.data.geo)
                    : turf.flatten(turf.featureCollection([question.data.geo]))
                ).features.map((x: any) => (
                    <Polygon key={JSON.stringify(x)} {...outlinedShape(x)} />
                ))}
            <EditControl
                position="bottomleft"
                draw={{
                    rectangle: false,
                    circle: false,
                    circlemarker: false,
                    marker:
                        question?.id === "tentacles" ||
                        (question?.id === "matching" &&
                            question.data.type === "custom-points") ||
                        question?.id === "measuring"
                            ? true
                            : false,
                    polyline: question?.id === "measuring",
                    polygon:
                        question?.id === "tentacles" ||
                        (question?.id === "matching" &&
                            question.data.type === "custom-points")
                            ? false
                            : {
                                  shapeOptions: { fillOpacity: 0 },
                              },
                }}
                onCreated={onChange}
                onEdited={onChange}
                onDeleted={onChange}
            />
        </FeatureGroup>
    );
};
