import * as React from "react";
import Card from "./Card";
import type { HidersCard } from "@/lib/cardSchema";

import { Play, Ban } from "lucide-react";
import { Button } from "../ui/button";

import { cn } from "@/lib/utils";
import { Navigation, Pagination, Scrollbar, A11y } from "swiper/modules";

import { Swiper, SwiperSlide } from "swiper/react";

// Import Swiper styles
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/scrollbar";

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

    const playCard = async () => {
        if (selectedCards.length === 0) {
            return;
        }
        if (!isAPlayAbleCardSelected(selectedCards)) {
            alert("You do not have any playable cards selected");
            return;
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
                file = new File([blob], `${selectedCards[0].title}-image.png`, {
                    type: blob.type,
                });
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
            });
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
        <>
            <Swiper
                spaceBetween={50}
                slidesPerView={1}
                freeMode={true}
                pagination={{
                    clickable: true,
                }}
                modules={[Navigation, Pagination, Scrollbar, A11y]}
                style={{ height: "60vh", width: "100%", marginTop: "1rem" }}
            >
                {props.cards.map((card, index) => {
                    return (
                        <SwiperSlide key={index}>
                            <Card
                                card={card}
                                onSelect={(card) => selectCard(card)}
                                isSelected={selectedCards.includes(card)}
                            />
                        </SwiperSlide>
                    );
                })}
            </Swiper>

            {
                <div className="flex flex-row justify-center items-center mt-4 flex-wrap gap-2">
                    <Button
                        className={`shadow-md flex justify-center align-center mr-4 ${isAPlayAbleCardSelected(selectedCards) && "active"} [&.active]:bg-green-400`}
                        onClick={playCard}
                    >
                        <Play /> Play the card
                    </Button>
                    <Button
                        className={`shadow-md flex justify-center align-center mr-4 ${selectedCards.length > 0 && "active"} [&.active]:bg-red-400`}
                        onClick={discardCards}
                    >
                        <Ban /> Discard selected card(s)
                    </Button>
                </div>
            }
        </>
    );
};

export default CardList;
