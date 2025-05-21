import { atom, computed } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { type OpenStreetMap } from "../maps/api";
import type { Map } from "leaflet";
import {
    questionSchema,
    questionsSchema,
    type DeepPartial,
    type Question,
    type Questions,
    type Units,
} from "./schema";

import { CardDeck, type HidersCard } from "./cardSchema";
import berlinRingBahnBoundary from "./berlin-ringbahnboundary.json"
export const mapGeoLocation = persistentAtom<OpenStreetMap>(
    "mapGeoLocation",
    {
        geometry: {
            coordinates: [
                13.3796369,
                52.5247168,
            ],
            type: "Point",
        },
        type: "Feature",
        properties: {
            osm_type: "R",
            osm_id: 62422,
            extent:    [52.6755087, 13.088345, 52.3382448, 13.7611609],
            // extent: [45.7112046, 122.7141754, 20.2145811, 154.205541],
            country: "Germany",
            osm_key: "place",
            countrycode: "DE",
            osm_value: "country",
            name: "Berlin",
            type: "country",
        },
    },
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const mapGeoJSON = atom<any>(null);
export const polyGeoJSON = persistentAtom<any>("polyGeoJSON", berlinRingBahnBoundary, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export const questions = persistentAtom<Questions>("questions", [], {
    encode: JSON.stringify,
    decode: (x) => questionsSchema.parse(JSON.parse(x)),
});
export const addQuestion = (question: DeepPartial<Question>) => {
    const safeQSchema = questionSchema.safeParse(question);
    console.log(safeQSchema.error)
    const qschema = questionSchema.parse(question)
    questionModified(questions.get().push(qschema));
}
    
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const questionModified = (..._: any[]) => {
    if (autoSave.get()) {
        questions.set([...questions.get()]);
    } else {
        triggerLocalRefresh.set(Math.random());
    }
};

export const leafletMapContext = atom<Map | null>(null);

export const defaultUnit = persistentAtom<Units>("defaultUnit", "kilometers");
export const highlightTrainLines = persistentAtom<boolean>(
    "highlightTrainLines",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const hiderMode = persistentAtom<
    | false
    | {
        latitude: number;
        longitude: number;
    }
>("isHiderMode", false, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const triggerLocalRefresh = atom<number>(0);
export const displayHidingZones = persistentAtom<boolean>(
    "displayHidingZones",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const displayHidingZonesOptions = persistentAtom<string[]>(
    "displayHidingZonesOptions",
    ["[railway=station]"],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const questionFinishedMapData = atom<any>(null);
export const trainStations = atom<any[]>([]);
export const animateMapMovements = persistentAtom<boolean>(
    "animateMapMovements",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const hidingRadius = persistentAtom<number>("hidingRadius", 0.5, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const disabledStations = persistentAtom<string[]>(
    "disabledStations",
    [],
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);
export const autoSave = persistentAtom<boolean>("autoSave", true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export const save = () => {
    questions.set([...questions.get()]);
    const $hiderMode = hiderMode.get();

    if ($hiderMode !== false) {
        hiderMode.set({ ...$hiderMode });
    }
};

// Exported hiding zone that can be loaded from clipboard or URL
export const hidingZone = computed(
    [questions, polyGeoJSON, mapGeoLocation, disabledStations, hidingRadius],
    (q, geo, loc, disabledStations, radius) => {
        if (geo !== null) {
            return {
                ...geo,
                questions: q,
                disabledStations: disabledStations,
                hidingRadius: radius,
            };
        } else {
            const $loc = structuredClone(loc);
            $loc.properties.isHidingZone = true;
            $loc.properties.questions = q;
            return {
                ...$loc,
                disabledStations: disabledStations,
                hidingRadius: radius,
            };
        }
    },
);

export const drawingQuestionKey = atom<number>(-1);
export const planningModeEnabled = persistentAtom<boolean>(
    "planningModeEnabled",
    false,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    },
);

export const isLoading = atom<boolean>(false)

export const parseDrawerDeck = (deck: HidersCard[]) => {
    const finalCards: HidersCard[] = [];
     deck.forEach((card: any) => {
        if(card.quantity && typeof card.quantity === "number") {
            for (let i = 0; i < card.quantity; i++) {
                finalCards.push({
                    ...card,
                    id: card.id + "_" + (i+1)
                });
            }
        }
        else {
            finalCards.push(card);
        }
        return card;
    });
    return finalCards;
}


export const drawPileDeck = persistentAtom<HidersCard[]>("drawPileDeck", parseDrawerDeck(CardDeck.allCards), {
    encode: (x: any) => JSON.stringify(x),
    decode: (x: any) => JSON.parse(x),
});

export const discardDeck = persistentAtom<HidersCard[]>("discardDeck", [], {
    encode: (x: any) => JSON.stringify(x),
    decode: (x: any) => JSON.parse(x),
});

export const hiderInHandsDeck = persistentAtom<HidersCard[]>("hiderInHandsDeck", [], {
    encode: (x: any) => JSON.stringify(x),
    decode: (x: any) => JSON.parse(x),
});

export const addCardsToHiderDeck = (cards: HidersCard[]) => {
    // add cards to hiderInHandsDeck
    const currentDeck = hiderInHandsDeck.get();
    const newDeck = [...currentDeck, ...cards];
    hiderInHandsDeck.set(newDeck);
    // remove cards from drawPileDeck
    const newDrawPileDeck = drawPileDeck.get().filter((card) => !cards.includes(card));
    drawPileDeck.set(newDrawPileDeck);
    const newDiscardDeck = [...discardDeck.get(), ...cards];
    discardDeck.set(newDiscardDeck);
}

export const removeCardsFromHiderDeck = (cards: HidersCard[]) => {
    // remove cards from hiderInHandsDeck
    const currentDeck = hiderInHandsDeck.get();
    const newDeck = currentDeck.filter((card) => !cards.includes(card));
    hiderInHandsDeck.set(newDeck);
}

export type { HidersCard } from "./cardSchema";
