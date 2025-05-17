import type { HidersCard } from "@/lib/cardSchema";
import * as React from "react";

import { CheckCircle } from "lucide-react";

import { cn } from "../../lib/utils";
interface CardProp {
    card: HidersCard;
    onSelect?: (card: HidersCard) => void;
    isSelected?: boolean;
}

const Card = ({ card, isSelected, onSelect }: CardProp) => {
    if (!card) {
        return null;
    }
    const { title, description, castingCost } = card;
    return (
        <div
            onClick={() => onSelect && onSelect(card)}
            className={cn(
                "p-4 rounded-md bg-white h-full",
                isSelected && "border-blue-500 border-2",
                "relative",
            )}
        >
            <CheckCircle
                className={cn(
                    "absolute top-2 right-2",
                    !isSelected && "fill-gray-300",
                    isSelected && "fill-blue-500",
                )}
            />
            <div className={cn("block w-full text-center")}>
                <h5 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
                    {title}
                </h5>
                <p className="mb-3 font-normal text-gray-500 dark:text-gray-700">
                    {description}
                </p>
                {castingCost ? (
                    <p className="text-gray-700">
                        <span className="font-bold">Casting Cost: </span>
                        <span>{castingCost}</span>
                    </p>
                ) : null}

            </div>
        </div>
    );
};

export default Card;
