import { iconColors } from "@/maps/api";
import { z } from "zod";

const unitsSchema = z.union([
    z.literal("miles"),
    z.literal("kilometers"),
    z.literal("meters"),
]);

const iconColorSchema = z.union([
    z.literal("green"),
    z.literal("black"),
    z.literal("blue"),
    z.literal("gold"),
    z.literal("grey"),
    z.literal("orange"),
    z.literal("red"),
    z.literal("violet"),
]);

const randomColor = () =>
    Object.keys(iconColors)[
        Math.floor(Math.random() * Object.keys(iconColors).length)
    ] as z.infer<typeof iconColorSchema>;

const thermometerQuestionSchema = z.object({
    latA: z
        .number()
        .min(-90, "Latitude must not overlap with the poles")
        .max(90, "Latitude must not overlap with the poles"),
    lngA: z
        .number()
        .min(-180, "Longitude must not overlap with the antemeridian")
        .max(180, "Longitude must not overlap with the antemeridian"),
    latB: z
        .number()
        .min(-90, "Latitude must not overlap with the poles")
        .max(90, "Latitude must not overlap with the poles"),
    lngB: z
        .number()
        .min(-180, "Longitude must not overlap with the antemeridian")
        .max(180, "Longitude must not overlap with the antemeridian"),
    warmer: z.boolean().default(true),
    colorA: iconColorSchema.default(randomColor),
    colorB: iconColorSchema.default(randomColor),
    /** Note that drag is now synonymous with unlocked */
    drag: z.boolean().default(true),
});

const ordinaryBaseQuestionSchema = z.object({
    lat: z
        .number()
        .min(-90, "Latitude must not overlap with the poles")
        .max(90, "Latitude must not overlap with the poles"),
    lng: z
        .number()
        .min(-180, "Longitude must not overlap with the antemeridian")
        .max(180, "Longitude must not overlap with the antemeridian"),
    /** Note that drag is now synonymous with unlocked */
    drag: z.boolean().default(true),
    color: iconColorSchema.default(randomColor),
});

const radiusQuestionSchema = ordinaryBaseQuestionSchema.extend({
    radius: z.number().min(0, "You cannot have a negative radius").default(50),
    unit: unitsSchema.default("miles"),
    within: z.boolean().default(true),
});

const tentacleLocationsSchema = z.union([
    z.literal("aquarium"),
    z.literal("zoo"),
    z.literal("theme_park"),
    z.literal("museum"),
    z.literal("hospital"),
    z.literal("cinema"),
    z.literal("library"),
    z.literal("golf_course"),
    z.literal("consulate"),
    z.literal("park"),
]);

const baseTentacleQuestionSchema = ordinaryBaseQuestionSchema.extend({
    radius: z.number().min(0, "You cannot have a negative radius").default(15),
    unit: unitsSchema.default("miles"),
    location: z
        .union([
            z.object({
                type: z.literal("Feature"),
                geometry: z.object({
                    type: z.literal("Point"),
                    coordinates: z.array(z.number()),
                }),
                id: z.union([z.string(), z.number(), z.undefined()]).optional(),
                properties: z.object({
                    name: z.any(),
                }),
            }),
            z.literal(false),
        ])
        .default(false),
});
const tentacleQuestionSpecificSchema = baseTentacleQuestionSchema.extend({
    locationType: tentacleLocationsSchema.default("theme_park"),
    places: z.array(z.any()).optional(),
});

const customTentacleQuestionSchema = baseTentacleQuestionSchema.extend({
    locationType: z.literal("custom"),
    places: z.array(
        z.object({
            type: z.literal("Feature"),
            geometry: z.object({
                type: z.literal("Point"),
                coordinates: z.array(z.number()),
            }),
            id: z.union([z.string(), z.number(), z.undefined()]).optional(),
            properties: z.object({
                name: z.any(),
            }),
        }),
    ),
});

const tentacleQuestionSchema = z.union([
    tentacleQuestionSpecificSchema,
    customTentacleQuestionSchema,
]);

const baseMatchingQuestionSchema = ordinaryBaseQuestionSchema.extend({
    same: z.boolean().default(true),
});

const ordinaryMatchingQuestionSchema = baseMatchingQuestionSchema.extend({
    type: z.union([
        z.literal("airport"),
        z.literal("major-city"),
        z.literal("same-first-letter-station"),
        z.literal("same-length-station"),
        z.literal("same-train-line"),
        z.literal("aquarium-full"),
        z.literal("zoo-full"),
        z.literal("theme_park-full"),
        z.literal("museum-full"),
        z.literal("hospital-full"),
        z.literal("cinema-full"),
        z.literal("library-full"),
        z.literal("golf_course-full"),
        z.literal("consulate-full"),
        z.literal("park-full"),
    ]),
});

const zoneMatchingQuestionsSchema = baseMatchingQuestionSchema.extend({
    type: z
        .union([z.literal("zone"), z.literal("letter-zone")])
        .default("zone"),
    cat: z
        .object({
            adminLevel: z.union([
                z.literal(3),
                z.literal(4),
                z.literal(5),
                z.literal(6),
                z.literal(7),
                z.literal(8),
                z.literal(9),
                z.literal(10),
            ]),
        })
        .default(() => ({ adminLevel: 3 }) as { adminLevel: 3 }),
});

const homeGameMatchingQuestionsSchema = baseMatchingQuestionSchema.extend({
    type: z.union([
        z.literal("aquarium"),
        z.literal("zoo"),
        z.literal("theme_park"),
        z.literal("museum"),
        z.literal("hospital"),
        z.literal("cinema"),
        z.literal("library"),
        z.literal("golf_course"),
        z.literal("consulate"),
        z.literal("park"),
    ]),
});

const customMatchingQuestionSchema = baseMatchingQuestionSchema.extend({
    type: z.union([z.literal("custom-zone"), z.literal("custom-points")]),
    geo: z.any(),
});

const matchingQuestionSchema = z.union([
    zoneMatchingQuestionsSchema,
    ordinaryMatchingQuestionSchema,
    homeGameMatchingQuestionsSchema,
    customMatchingQuestionSchema,
]);

const baseMeasuringQuestionSchema = ordinaryBaseQuestionSchema.extend({
    hiderCloser: z.boolean().default(true),
});

const ordinaryMeasuringQuestionSchema = baseMeasuringQuestionSchema.extend({
    type: z
        .union([
            z.literal("coastline"),
            z.literal("airport"),
            z.literal("city"),
            z.literal("mcdonalds"),
            z.literal("seven11"),
            z.literal("rail-measure"),
            z.literal("highspeed-measure-shinkansen"),
            z.literal("aquarium-full"),
            z.literal("zoo-full"),
            z.literal("theme_park-full"),
            z.literal("museum-full"),
            z.literal("hospital-full"),
            z.literal("cinema-full"),
            z.literal("library-full"),
            z.literal("golf_course-full"),
            z.literal("consulate-full"),
            z.literal("park-full"),
        ])
        .default("coastline"),
});

const homeGameMeasuringQuestionsSchema = baseMeasuringQuestionSchema.extend({
    type: z.union([
        z.literal("aquarium"),
        z.literal("zoo"),
        z.literal("theme_park"),
        z.literal("museum"),
        z.literal("hospital"),
        z.literal("cinema"),
        z.literal("library"),
        z.literal("golf_course"),
        z.literal("consulate"),
        z.literal("park"),
    ]),
});

const customMeasuringQuestionSchema = baseMeasuringQuestionSchema.extend({
    type: z.literal("custom-measure"),
    geo: z.any(),
});

const measuringQuestionSchema = z.union([
    ordinaryMeasuringQuestionSchema,
    homeGameMeasuringQuestionsSchema,
    customMeasuringQuestionSchema,
]);

export const questionSchema = z.union([
    z.object({
        id: z.literal("radius"),
        key: z.number().default(Math.random),
        data: radiusQuestionSchema,
    }),
    z.object({
        id: z.literal("thermometer"),
        key: z.number().default(Math.random),
        data: thermometerQuestionSchema,
    }),
    z.object({
        id: z.literal("tentacles"),
        key: z.number().default(Math.random),
        data: tentacleQuestionSchema,
    }),
    z.object({
        id: z.literal("measuring"),
        key: z.number().default(Math.random),
        data: measuringQuestionSchema,
    }),
    z.object({
        id: z.literal("matching"),
        key: z.number().default(Math.random),
        data: matchingQuestionSchema,
    }),
]);

export const questionsSchema = z.array(questionSchema);

export type Units = z.infer<typeof unitsSchema>;
export type RadiusQuestion = z.infer<typeof radiusQuestionSchema>;
export type ThermometerQuestion = z.infer<typeof thermometerQuestionSchema>;
export type TentacleQuestion = z.infer<typeof tentacleQuestionSchema>;
export type TentacleLocations = z.infer<typeof tentacleLocationsSchema>;
export type MatchingQuestion = z.infer<typeof matchingQuestionSchema>;
export type HomeGameMatchingQuestions = z.infer<
    typeof homeGameMatchingQuestionsSchema
>;
export type ZoneMatchingQuestions = z.infer<typeof zoneMatchingQuestionsSchema>;
export type CustomMatchingQuestion = z.infer<
    typeof customMatchingQuestionSchema
>;
export type CustomMeasuringQuestion = z.infer<
    typeof customMeasuringQuestionSchema
>;
export type MeasuringQuestion = z.infer<typeof measuringQuestionSchema>;
export type HomeGameMeasuringQuestions = z.infer<
    typeof homeGameMeasuringQuestionsSchema
>;
export type Question = z.infer<typeof questionSchema>;
export type Questions = z.infer<typeof questionsSchema>;
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
export type TraditionalTentacleQuestion = z.infer<
    typeof tentacleQuestionSpecificSchema
>;
export type CustomTentacleQuestion = z.infer<
    typeof customTentacleQuestionSchema
>;
