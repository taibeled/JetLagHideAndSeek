import * as React from "react";
import Card from "./Card";
import type { HidersCard } from "@/lib/cardSchema";

import { Play, Ban, CheckCircle } from "lucide-react";
import { Button } from "../ui/button";

import { cn } from "@/lib/utils";

//@ts-ignore
import domtoimage from "dom-to-image";

interface CardListProps {
    cards: HidersCard[];
    discardCards: (cards: HidersCard[]) => void;
    playCard: (card: HidersCard, file?: File) => void;
}

const isAPlayAbleCardSelected = (cards: HidersCard[]) => {
    let playAbleCard = 0;
    cards.forEach((card) => {
        if (card.type === "action" || card.type === "curse") {
            playAbleCard++;
        }
    });
    return playAbleCard != 0;
};

const CardList = (props: CardListProps) => {
    const [selectedCards, setSelectedCards] = React.useState<HidersCard[]>([]);

    const selectCard = (card: HidersCard) => {
        if (selectedCards.includes(card)) {
            return setSelectedCards(selectedCards.filter((c) => c !== card));
        } else {
            return setSelectedCards([...selectedCards, card]);
        }
    };

    const playCard = () => {
        if (selectedCards.length === 0) {
            return;
        }
        if (!isAPlayAbleCardSelected(selectedCards)) {
            alert("You do not have any playable cards selected");
        }
        if (selectedCards.length > 1) {
            alert("You can only play one card at a time.");
            return;
        }
        let node = document.getElementById(`card-${selectedCards[0].id}`);
        let file: File;
        domtoimage
            .toBlob(node)
            .then(function (blob: Blob) {
                // var img = new Image();
                // img.src = dataUrl;
                // document.body.appendChild(img);
                file = new File(
                    [blob],
                    `${selectedCards[0].title}-image.png`,
                    { type: blob.type },
                );
                
            })
            .catch(function (error: any) {
                console.error(
                    "oops, something went wrong went generating a card image!",
                    error,
                );
            })
            .finally(() => {
                props.playCard(selectedCards[0], file);
                return;
            })
    };

    const discardCards = () => {
        if (selectedCards.length === 0) {
            return;
        }
        if (
            confirm(
                `Are you sure you want to discard ${selectedCards.length} card(s)?`,
            )
        ) {
            props.discardCards(selectedCards);
            setSelectedCards([]);
        }
    };

    return (
        <div className="flex flex-col justify-center items-center p-4">
            {/* don't know why height is not working */}
            <div
                className="w-full overflow-y-auto"
                style={{ height: "calc(100vh - 200px)" }}
            >
                {props.cards.map((card, index) => (
                    <div
                        key={index}
                        className={cn(
                            "mb-2 bg-gray-100 rounded-lg drop-shadow-md z-30 flex p-4",
                            selectedCards.includes(card) &&
                                "border-blue-500 border-2",
                            "relative",
                        )}
                        onClick={() => selectCard(card)}
                        id={`card-${card.id}`}
                    >
                        {selectedCards.includes(card) && (
                            <CheckCircle className="absolute top-2 right-2 fill-blue-500" />
                        )}
                        <Card card={card} />
                    </div>
                ))}
            </div>
            {
                <div className="flex flex-row justify-center items-center mt-4">
                    <Button
                        className={`w-40 shadow-md flex justify-center align-center mr-4 ${isAPlayAbleCardSelected(selectedCards) && "active"} [&.active]:bg-green-400`}
                        onClick={playCard}
                    >
                        <Play /> Play the card
                    </Button>
                    <Button
                        className={`w-50 shadow-md flex justify-center align-center mr-4 ${selectedCards.length > 0 && "active"} [&.active]:bg-red-400`}
                        onClick={discardCards}
                    >
                        <Ban /> Discard selected card(s)
                    </Button>
                </div>
            }
        </div>
    );
};

export default CardList;
