import * as React from "react";

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";

import { Button } from "../ui/button";
import Card from "./Card";
import CardDeck from "./CardDeck.tsx";
import { useStore } from "@nanostores/react";

import {
    hiderInHandsDeck as $hiderInHandsDeck,
    drawPileDeck as $drawPileDeck,
    discardDeck as $discardDeck,
    parseDrawerDeck,
    type HidersCard,
    addCardsToHiderDeck,
    removeCardsFromHiderDeck,
} from "@/lib/context";
import CardList from "./CardList.tsx";

import { toast } from "react-toastify";


// import RawCardDeck from './'

const MAX_IN_HAND_CARDS = 6;


const CardDeckDrawer: React.FC<{}> = () => {
    const [isCardDeckOpen, setCardDeckOpen] = React.useState(false);

    const hiderInHandsDeck = useStore($hiderInHandsDeck);
    const drawPileDeck = useStore($drawPileDeck);
    const discardDeck = useStore($discardDeck);

    const [mode, setMode] = React.useState<"pickup" | "holding">(hiderInHandsDeck.length > 0 ? "holding" : "pickup");

    const storeInHandsDeck = (cards: HidersCard[], ) => {
        if (hiderInHandsDeck.length + cards.length > MAX_IN_HAND_CARDS) {
            alert(
                `You can only have ${MAX_IN_HAND_CARDS} cards in your hand. Please discard some cards before picking up new ones.`
            );
            return;
        }
        addCardsToHiderDeck(cards);
        setMode("holding");
    }

    const discardCards = (cards: HidersCard[]) => {
        if (cards.length === 0) {
            return;
        }
        removeCardsFromHiderDeck(cards);
    }

    const playCard = async (card: HidersCard, file?: File) => {
        //tell plater to play the card
        if (navigator.share) {

            const data  = {
                title: card.type === "curse" ? "Here is a fuck you Curse Card" : (card.type === "action" ? "Just a card" : ""),
                files: file ? [file] : undefined
            }
            await navigator
                .share(data)
                // .then(() => toast.success("Successfully shared"))
                .catch((error) => console.log("Error sharing", error));
        } else {
            console.log(
                "Share not supported on this browser, do it the old way.",
            );
        }
        removeCardsFromHiderDeck([card]);
    }



    console.log("hiderInHandsDeck", hiderInHandsDeck);
    console.log("drawPileDeck", drawPileDeck);
    console.log("discardDeck", discardDeck);

    return (
        <Drawer
            open={isCardDeckOpen}
            onOpenChange={() => setCardDeckOpen(!isCardDeckOpen)}
        >
            <DrawerTrigger className="w-24" asChild>
                <Button className="w-24 shadow-md">Card Deck</Button>
            </DrawerTrigger>
            <DrawerContent className="min-h-full">
                {/* <DrawerHeader className="pb-0"> */}
                    <div className="flex gap-2 justify-center items-center mt-2">
                        <Button
                            className={`w-24 shadow-md ${mode === "pickup" && "active"} [&.active]:bg-blue-400`}
                            onClick={() => setMode("pickup")}
                        >
                            Pickup Cards
                        </Button>
                        <Button
                            className={`w-24 shadow-md ${mode === "holding" && "active"} [&.active]:bg-blue-400 `}
                            onClick={() => setMode("holding")}
                        >
                            In Hand Deck
                        </Button>
                    </div>
                {/* </DrawerHeader> */}
                <div className="flex flex-col mt-2 pl-4 pr-4">
                    {mode === "holding" && (
                        <div className="flex flex-col justify-center items-center">
                            <h3 className="text-lg font-bold">In Hand Deck</h3>
                            {/* <div className="flex flex-wrap justify-center items-center"> */}
                                {hiderInHandsDeck.length > 0 ? (
                                    <CardList cards={hiderInHandsDeck} discardCards={discardCards} playCard={playCard}/>
                                ) : (
                                    "You have no cards in your hand."
                                )}
                            {/* </div> */}
                        </div>
                    )}
                    {mode === "pickup" && (
                        <div className="flex flex-col justify-center items-center">
                            <h3 className="text-lg font-bold">Pickup Deck</h3>
                            <CardDeck drawPileDeck={drawPileDeck} storeInHandsDeck={storeInHandsDeck}/>
                        </div>
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default CardDeckDrawer;
