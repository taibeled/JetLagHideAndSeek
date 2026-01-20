import { z } from "zod";

import { defaultUnit } from "@/lib/context";

import { ICON_COLORS } from "./api/constants";

export const NO_GROUP = "NO_GROUP";

export const determineUnionizedStrings = (
    obj: z.ZodUnion<any> | z.ZodLiteral<any> | z.ZodDefault<any>,
): z.ZodLiteral<any>[] => {
    if (obj instanceof z.ZodUnion) {
        return obj.options.flatMap((option: any) =>
            determineUnionizedStrings(option),
        );
    } else if (obj instanceof z.ZodLiteral) {
        return [obj];
    } else if (obj instanceof z.ZodDefault) {
        return determineUnionizedStrings(obj._def.innerType);
    }
    return [];
};

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

type IconColor = z.infer<typeof iconColorSchema>;

const randomColor = () =>
    (Object.keys(ICON_COLORS) as IconColor[])[
        Math.floor(Math.random() * Object.keys(ICON_COLORS).length)
    ];

const randomColorExcluding = (excluded: IconColor[] = []) => {
    const options = (Object.keys(ICON_COLORS) as IconColor[]).filter(
        (color) => !excluded.includes(color),
    );

    return options[Math.floor(Math.random() * options.length)];
};

const thermometerQuestionSchema = z
    .object({
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
        colorA: iconColorSchema.default(() => randomColorExcluding(["green"])),
        colorB: iconColorSchema.default(() => randomColorExcluding(["green"])),
        /** Note that drag is now synonymous with unlocked */
        drag: z.boolean().default(true),
        collapsed: z.boolean().default(false),
    })
    .transform((question) => {
        if (question.colorA === question.colorB) {
            question.colorB = "green";
        }

        return question;
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
    collapsed: z.boolean().default(false),
});

const getDefaultUnit = () => {
    try {
        return defaultUnit.get();
    } catch {
        return "miles";
    }
};

const radiusQuestionSchema = ordinaryBaseQuestionSchema.extend({
    radius: z.number().min(0, "You cannot have a negative radius").default(50),
    unit: unitsSchema.default(getDefaultUnit),
    within: z.boolean().default(true),
});

const tentacleLocationsFifteen = z.union([
    z.literal("theme_park").describe("Theme Parks"),
    z.literal("zoo").describe("Zoos"),
    z.literal("aquarium").describe("Aquariums"),
]);

const tentacleLocationsOne = z.union([
    z.literal("museum").describe("Museums"),
    z.literal("hospital").describe("Hospitals"),
    z.literal("cinema").describe("Movie Theaters"),
    z.literal("library").describe("Libraries"),
]);

const apiLocationSchema = z.union([
    z.literal("golf_course"),
    z.literal("consulate"),
    z.literal("park"),
    tentacleLocationsFifteen,
    tentacleLocationsOne,
]);

const baseTentacleQuestionSchema = ordinaryBaseQuestionSchema.extend({
    radius: z.number().min(0, "You cannot have a negative radius").default(15),
    unit: unitsSchema.default(getDefaultUnit),
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
const tentacleQuestionSpecificSchemaFifteen = baseTentacleQuestionSchema.extend(
    {
        locationType: tentacleLocationsFifteen.default("theme_park"),
        places: z.array(z.any()).optional(),
    },
);

const tentacleQuestionSpecificSchemaOne = baseTentacleQuestionSchema.extend({
    locationType: tentacleLocationsOne,
    places: z.array(z.any()).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const encompassingTentacleQuestionSchema = baseTentacleQuestionSchema.extend({
    locationType: apiLocationSchema,
    places: z.array(z.any()).optional(),
});

const customTentacleQuestionSchema = baseTentacleQuestionSchema.extend({
    locationType: z.literal("custom").describe("Custom Locations"),
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

export const tentacleQuestionSchema = z.union([
    customTentacleQuestionSchema.describe(NO_GROUP),
    tentacleQuestionSpecificSchemaFifteen.describe("15 Miles (Typically)"),
    tentacleQuestionSpecificSchemaOne.describe("1 Mile (Typically)"),
]);

const baseMatchingQuestionSchema = ordinaryBaseQuestionSchema.extend({
    same: z.boolean().default(true),
    lengthComparison: z.enum(["shorter", "longer", "same"]).optional(),
});

const ordinaryMatchingQuestionSchema = baseMatchingQuestionSchema.extend({
    type: z
        .union([
            z
                .literal("airport")
                .describe("Commercial Airport In Zone Question"),
            z
                .literal("major-city")
                .describe("Major City (1,000,000+ people) In Zone Question"),
            z
                .literal("aquarium-full")
                .describe("Aquarium Question (Small+Medium Games)"),
            z.literal("zoo-full").describe("Zoo Question (Small+Medium Games)"),
            z
                .literal("theme_park-full")
                .describe("Theme Park Question (Small+Medium Games)"),
            z
                .literal("museum-full")
                .describe("Museum Question (Small+Medium Games)"),
            z
                .literal("hospital-full")
                .describe("Hospital Question (Small+Medium Games)"),
            z
                .literal("cinema-full")
                .describe("Cinema Question (Small+Medium Games)"),
            z
                .literal("library-full")
                .describe("Library Question (Small+Medium Games)"),
            z
                .literal("golf_course-full")
                .describe("Golf Course Question (Small+Medium Games)"),
            z
                .literal("consulate-full")
                .describe("Foreign Consulate Question (Small+Medium Games)"),
            z
                .literal("park-full")
                .describe("Park Question (Small+Medium Games)"),
        ])
        .default("airport"),
});

const zoneMatchingQuestionsSchema = baseMatchingQuestionSchema.extend({
    type: z.union([
        z.literal("zone").describe("Zone Question"),
        z
            .literal("letter-zone")
            .describe("Zone Starts With Same Letter Question"),
    ]),
    cat: z
        .object({
            adminLevel: z.union([
                z.literal(2),
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
        z.literal("aquarium").describe("Aquarium Question"),
        z.literal("zoo").describe("Zoo Question"),
        z.literal("theme_park").describe("Theme Park Question"),
        z.literal("museum").describe("Museum Question"),
        z.literal("hospital").describe("Hospital Question"),
        z.literal("cinema").describe("Cinema Question"),
        z.literal("library").describe("Library Question"),
        z.literal("golf_course").describe("Golf Course Question"),
        z.literal("consulate").describe("Foreign Consulate Question"),
        z.literal("park").describe("Park Question"),
    ]),
});

const hidingZoneMatchingQuestionsSchema = baseMatchingQuestionSchema.extend({
    type: z.union([
        z
            .literal("same-first-letter-station")
            .describe("Station Starts With Same Letter Question"),
        z
            .literal("same-length-station")
            .describe("Station Has Same Length Question"),
        z
            .literal("same-train-line")
            .describe("Station On Same Train Line Question"),
    ]),
});

const customMatchingQuestionSchema = baseMatchingQuestionSchema.extend({
    type: z.union([
        z.literal("custom-zone").describe("Custom Zone Question"),
        z.literal("custom-points").describe("Custom Points Question"),
    ]),
    geo: z.any(),
});

export const matchingQuestionSchema = z.union([
    zoneMatchingQuestionsSchema.describe(NO_GROUP),
    ordinaryMatchingQuestionSchema.describe(NO_GROUP),
    customMatchingQuestionSchema.describe(NO_GROUP),
    hidingZoneMatchingQuestionsSchema.describe("Hiding Zone Mode"),
    homeGameMatchingQuestionsSchema.describe("Hiding Zone Mode"),
]);

const baseMeasuringQuestionSchema = ordinaryBaseQuestionSchema.extend({
    hiderCloser: z.boolean().default(true),
});

const ordinaryMeasuringQuestionSchema = baseMeasuringQuestionSchema.extend({
    type: z
        .union([
            z.literal("coastline").describe("Coastline Question"),
            z
                .literal("airport")
                .describe("Commercial Airport In Zone Question"),
            z
                .literal("city")
                .describe("Major City (1,000,000+ people) Question"),
            z
                .literal("highspeed-measure-shinkansen")
                .describe("High-Speed Rail Question"),
            z
                .literal("aquarium-full")
                .describe("Aquarium Question (Small+Medium Games)"),
            z.literal("zoo-full").describe("Zoo Question (Small+Medium Games)"),
            z
                .literal("theme_park-full")
                .describe("Theme Park Question (Small+Medium Games)"),
            z
                .literal("museum-full")
                .describe("Museum Question (Small+Medium Games)"),
            z
                .literal("hospital-full")
                .describe("Hospital Question (Small+Medium Games)"),
            z
                .literal("cinema-full")
                .describe("Cinema Question (Small+Medium Games)"),
            z
                .literal("library-full")
                .describe("Library Question (Small+Medium Games)"),
            z
                .literal("golf_course-full")
                .describe("Golf Course Question (Small+Medium Games)"),
            z
                .literal("consulate-full")
                .describe("Foreign Consulate Question (Small+Medium Games)"),
            z
                .literal("park-full")
                .describe("Park Question (Small+Medium Games)"),
        ])
        .default("coastline"),
});

const hidingZoneMeasuringQuestionsSchema = baseMeasuringQuestionSchema.extend({
    type: z.union([
        z.literal("mcdonalds").describe("McDonald's Question"),
        z.literal("seven11").describe("7-Eleven Question"),
        z.literal("rail-measure").describe("Train Station Question"),
    ]),
});

const homeGameMeasuringQuestionsSchema = baseMeasuringQuestionSchema.extend({
    type: z.union([
        z.literal("aquarium").describe("Aquarium Question"),
        z.literal("zoo").describe("Zoo Question"),
        z.literal("theme_park").describe("Theme Park Question"),
        z.literal("museum").describe("Museum Question"),
        z.literal("hospital").describe("Hospital Question"),
        z.literal("cinema").describe("Cinema Question"),
        z.literal("library").describe("Library Question"),
        z.literal("golf_course").describe("Golf Course Question"),
        z.literal("consulate").describe("Foreign Consulate Question"),
        z.literal("park").describe("Park Question"),
    ]),
});

const customMeasuringQuestionSchema = baseMeasuringQuestionSchema.extend({
    type: z.literal("custom-measure").describe("Custom Measuring Question"),
    geo: z.any(),
});

export const measuringQuestionSchema = z.union([
    ordinaryMeasuringQuestionSchema.describe(NO_GROUP),
    customMeasuringQuestionSchema.describe(NO_GROUP),
    hidingZoneMeasuringQuestionsSchema.describe("Hiding Zone Mode"),
    homeGameMeasuringQuestionsSchema.describe("Hiding Zone Mode"),
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
export type APILocations = z.infer<typeof apiLocationSchema>;
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
export type TraditionalTentacleQuestion =
    | z.infer<typeof tentacleQuestionSpecificSchemaFifteen>
    | z.infer<typeof tentacleQuestionSpecificSchemaOne>;
export type EncompassingTentacleQuestionSchema = z.infer<
    typeof encompassingTentacleQuestionSchema
>;
export type CustomTentacleQuestion = z.infer<
    typeof customTentacleQuestionSchema
>;
