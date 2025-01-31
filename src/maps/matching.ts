import { questions } from "@/utils/context";
import { findAdminBoundary, iconColors } from "./api";
import * as turf from "@turf/turf";
import type { LatLng } from "leaflet";

export interface MatchingZoneQuestion {
    adminLevel: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
}

export interface BaseMatchingQuestion {
    lat: number;
    lng: number;
    same: boolean;
    color?: keyof typeof iconColors;
    drag?: boolean;
}

export interface ZoneMatchingQuestion extends BaseMatchingQuestion {
    type: "zone";
    cat: MatchingZoneQuestion;
}

export type MatchingQuestion = ZoneMatchingQuestion;

export const adjustPerMatching = async (
    question: MatchingQuestion,
    mapData: any,
    masked: boolean,
) => {
    if (mapData === null) return;

    switch (question.type) {
        case "zone": {
            const boundary = await findAdminBoundary(
                question.lat,
                question.lng,
                question.cat.adminLevel,
            );

            if (question.same) {
                if (masked) {
                    throw new Error("Cannot be masked");
                }
                return turf.intersect(
                    turf.featureCollection(
                        mapData.features.length > 1
                            ? [turf.union(mapData)!, boundary]
                            : [...mapData.features, boundary],
                    ),
                );
            } else {
                if (!masked) {
                    throw new Error("Must be masked");
                }
                return turf.union(
                    turf.featureCollection([...mapData.features, boundary]),
                );
            }
        }
    }
};

export const addDefaultMatching = (center: LatLng) => {
    questions.set([
        ...questions.get(),
        {
            id: "matching",
            key: Math.random() * 1e9,
            data: {
                color: Object.keys(iconColors)[
                    Math.floor(Math.random() * Object.keys(iconColors).length)
                ] as keyof typeof iconColors,
                lat: center.lat,
                lng: center.lng,
                drag: true,
                same: true,
                type: "zone",
                cat: {
                    adminLevel: 3,
                },
            },
        },
    ]);
};
