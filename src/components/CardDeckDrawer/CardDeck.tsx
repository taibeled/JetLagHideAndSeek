import * as React from "react";
import Card from "./Card";
import type { HidersCard } from "@/lib/cardSchema";

import { cn } from "@/lib/utils";

import {
    Navigation,
    Pagination,
    Scrollbar,
    A11y,
    FreeMode,
} from "swiper/modules";

import { Swiper, SwiperSlide } from "swiper/react";

// Import Swiper styles
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/scrollbar";

import { Select } from "../ui/select";
import { Check, CheckCircle, CheckSquare } from "lucide-react";
import { Button } from "../ui/button";

interface CardDeckProps {
    drawPileDeck: HidersCard[];
    storeInHandsDeck: (cards: HidersCard[]) => void;
}

interface PickUpOptionType {
    label: string;
    confirm_description: string;
    draw: number;
    pickup: number;
}

const PickUpOptionsType: Partial<Record<string, PickUpOptionType>> = {
    radius: {
        label: "Radius",
        confirm_description:
            "Are you sure you want to pick up Radius card (Draw 2, Pickup 1)?",
        draw: 2,
        pickup: 1,
    },
    matching: {
        label: "Matching",
        confirm_description:
            "Are you sure you want to pick up Matching card (Draw 3, Pickup 1)?",
        draw: 3,
        pickup: 1,
    },
    tentacle: {
        label: "Tentacle",
        confirm_description:
            "Are you sure you want to pick up Tentacle card (Draw 4, Pickup 2)?",
        draw: 4,
        pickup: 2,
    },
    measuring: {
        label: "Measuring",
        confirm_description:
            "Are you sure you want to pick up Measuring card (Draw 3, Pickup 1)?",
        draw: 3,
        pickup: 1,
    },
    theromometer: {
        label: "Thermometer",
        confirm_description:
            "Are you sure you want to pick up Thermometer card (Draw 2, Pickup 1)?",
        draw: 2,
        pickup: 1,
    },
    photo: {
        label: "Photos",
        confirm_description:
            "Are you sure you want to pick up Photo card (Draw 1, Pickup 1)?",
        draw: 1,
        pickup: 1,
    },
};

const PickUpDropdown = ({
    onChange,
    value,
}: {
    onChange: any;
    value: keyof typeof PickUpOptionsType;
}) => {
    const options: Record<string, string> = Object.keys(
        PickUpOptionsType,
    ).reduce(
        (acc, key) => {
            acc[key] = PickUpOptionsType[key]?.label || "";
            return acc;
        },
        {} as Record<string, string>,
    );
    return (
        <Select
            trigger={{
                placeholder: "Pick Up",
                className: "w-80",
            }}
            options={options}
            onValueChange={(value) => {
                if (confirm(PickUpOptionsType[value]?.confirm_description)) {
                    onChange(value);
                }
            }}
            value={value}
        />
    );
};

function pickRandomItems<T>(arr: T[], n: number): T[] {
    if (n > arr.length)
        throw new Error("n cannot be larger than the array length");

    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, n);
}

const drawCards = (drawPileDeck: HidersCard[], draw: number) => {
    const tempDrawPileDeck = [...drawPileDeck];
    var shuffled = pickRandomItems(tempDrawPileDeck, draw);
    var drawnCards = shuffled.slice(0, draw);
    return drawnCards;
};

const keepSelectedCards = (
    selectedCards: HidersCard[],
    pickupNumber: number,
) => {
    if (selectedCards.length > pickupNumber) {
        alert(
            `You can only keep ${pickupNumber} cards. You have selected ${selectedCards.length} cards.`,
        );
        return false;
    }
    if (selectedCards.length < pickupNumber) {
        alert(
            `You must select ${pickupNumber} cards. You have selected ${selectedCards.length} cards.`,
        );
        return false;
    }

    return true;
};

const CardDeck = ({
    drawPileDeck,
    storeInHandsDeck,
}: CardDeckProps): React.ReactElement => {
    const [pickupDrawCards, setPickupDrawCards] = React.useState<
        HidersCard[] | null
    >(null);
    const [pickupOption, setPickupOption] = React.useState<string>("");

    const [selectedCards, setSelectedCards] = React.useState<HidersCard[]>([]);

    const selectCard = (card: HidersCard) => {
        if (selectedCards.includes(card)) {
            return setSelectedCards(selectedCards.filter((c) => c !== card));
        } else {
            return setSelectedCards([...selectedCards, card]);
        }
    };

    console.log(
        "selectedCards",
        selectedCards,
        PickUpOptionsType[pickupOption]?.pickup,
    );
    return (
        <>
            <PickUpDropdown
                value={pickupOption}
                onChange={(value: string) => {
                    if (PickUpOptionsType[value]?.draw) {
                        setPickupDrawCards(
                            drawCards(
                                drawPileDeck,
                                PickUpOptionsType[value]?.draw,
                            ),
                        );
                        setPickupOption(value);
                    }
                }}
            />
            {pickupOption && PickUpOptionsType[pickupOption] && (
                <div className="flex mt-2 flex-col justify-center items-center">
                    <div>
                        Currently Picking Up:{" "}
                        {PickUpOptionsType[pickupOption].label}
                    </div>
                    <div>
                        Draw: {PickUpOptionsType[pickupOption].draw}, Pickup:{" "}
                        {PickUpOptionsType[pickupOption].pickup}
                    </div>
                </div>
            )}

            {pickupDrawCards && pickupDrawCards.length > 0 && (
                <Swiper
                    spaceBetween={50}
                    slidesPerView={1}
                    freeMode={true}
                    onSlideChange={(e) => console.log("slide change", e)}
                    onSwiper={(swiper) => console.log(swiper)}
                    pagination={{
                        clickable: true,
                    }}
                    modules={[Navigation, Pagination, Scrollbar, A11y]}
                    style={{ height: "60vh", width: "100%", marginTop: "1rem" }}
                >
                    {pickupDrawCards.map((card, index) => {
                        return (
                            <SwiperSlide key={index}>
                                <div
                                    onClick={() => selectCard(card)}
                                    className={cn(
                                        "p-4 rounded-md bg-white h-full",
                                        selectedCards.includes(card) &&
                                            "border-blue-500 border-2",
                                        "relative",
                                    )}
                                >
                                    {selectedCards.includes(card) && (
                                        <CheckCircle className="absolute top-2 right-2 fill-blue-500" />
                                    )}
                                    <Card
                                        card={card}
                                        onSelect={(card) => selectCard(card)}
                                        isSelected={true}
                                        // isSelected={selectedCards.includes(card)}
                                    />
                                </div>
                            </SwiperSlide>
                        );
                    })}
                </Swiper>
            )}
            {pickupOption &&
                PickUpOptionsType[pickupOption] &&
                pickupDrawCards &&
                pickupDrawCards.length > 0 && (
                    <div>
                        <Button
                            className={`w-30 shadow-md flex justify-center mt-4 align-center ${selectedCards.length === PickUpOptionsType[pickupOption].pickup && "active"} [&.active]:bg-green-400 ${selectedCards.length > PickUpOptionsType[pickupOption].pickup && "toomany"} [&.toomany]:bg-red-400`}
                            onClick={() => {
                                if (PickUpOptionsType[pickupOption]) {
                                    if(keepSelectedCards(
                                        selectedCards,
                                        PickUpOptionsType[pickupOption].pickup,
                                    )) {
                                        storeInHandsDeck(selectedCards);
                                        setPickupDrawCards(null);
                                        setPickupOption("");
                                        setSelectedCards([]);
                                    }
                                  
                                } else {
                                    alert(
                                        "Something went wrong, please contact the idiot who made this",
                                    );
                                }
                            }}
                        >
                            <CheckSquare /> Keep Cards
                        </Button>
                    </div>
                )}
        </>
    );
};

export default CardDeck;
