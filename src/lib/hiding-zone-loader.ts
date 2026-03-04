import { toast } from "react-toastify";

import {
    additionalMapGeoLocations,
    customPresets,
    customStations,
    disabledStations,
    displayHidingZonesOptions,
    hidingRadius,
    includeDefaultStations,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questions,
    useCustomStations,
} from "@/lib/context";
import { questionsSchema } from "@/maps/schema";
import { locale, t } from "@/i18n";

export function loadHidingZone(hidingZone: string): void {
    try {
        const geojson = JSON.parse(hidingZone);

        if (
            geojson.properties &&
            geojson.properties.isHidingZone === true
        ) {
            questions.set(
                questionsSchema.parse(geojson.properties.questions ?? []),
            );
            mapGeoLocation.set(geojson);
            mapGeoJSON.set(null);
            polyGeoJSON.set(null);

            if (geojson.alternateLocations) {
                additionalMapGeoLocations.set(geojson.alternateLocations);
            } else {
                additionalMapGeoLocations.set([]);
            }
        } else {
            if (geojson.questions) {
                questions.set(questionsSchema.parse(geojson.questions));
                delete geojson.questions;

                mapGeoJSON.set(geojson);
                polyGeoJSON.set(geojson);
            } else {
                questions.set([]);
                mapGeoJSON.set(geojson);
                polyGeoJSON.set(geojson);
            }
        }

        const incomingPresets =
            geojson.presets ?? geojson.properties?.presets;
        if (incomingPresets && Array.isArray(incomingPresets)) {
            try {
                const normalized = (incomingPresets as any[])
                    .filter((p) => p && p.data)
                    .map((p) => {
                        return {
                            id:
                                p.id ??
                                (typeof crypto !== "undefined" &&
                                typeof (crypto as any).randomUUID ===
                                    "function"
                                    ? (crypto as any).randomUUID()
                                    : String(Date.now()) + Math.random()),
                            name: p.name ?? "Imported preset",
                            type: p.type ?? "custom",
                            data: p.data,
                            createdAt:
                                p.createdAt ?? new Date().toISOString(),
                        };
                    });
                if (normalized.length > 0) {
                    customPresets.set(normalized);
                    toast.info(t("toast.options.importedPresets", locale.get()));
                }
            } catch (err) {
                console.warn("Failed to import presets", err);
            }
        }

        if (
            geojson.disabledStations !== null &&
            geojson.disabledStations.constructor === Array
        ) {
            disabledStations.set(geojson.disabledStations);
        }

        if (geojson.hidingRadius !== null) {
            hidingRadius.set(geojson.hidingRadius);
        }

        if (geojson.zoneOptions) {
            displayHidingZonesOptions.set(geojson.zoneOptions ?? []);
        }

        if (typeof geojson.useCustomStations === "boolean") {
            useCustomStations.set(geojson.useCustomStations);
        }

        if (
            geojson.customStations &&
            geojson.customStations.constructor === Array
        ) {
            customStations.set(geojson.customStations);
        }

        if (typeof geojson.includeDefaultStations === "boolean") {
            includeDefaultStations.set(geojson.includeDefaultStations);
        }

        toast.success(t("toast.options.hidingZoneLoaded", locale.get()), {
            autoClose: 2000,
        });
    } catch (e) {
        toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
    }
}
