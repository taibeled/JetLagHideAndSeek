import type { Action } from "@radix-ui/react-alert-dialog";

export interface HidersCard<T extends "curse" | "action" | "time_bonuses" = "curse" | "action" | "time_bonuses"> {
    title: string;
    description: string;
    castingCost?: string;
    imageUrl?: string;
    id: string;
    type: T;
    quantity?: number;
}



const CurseCards: HidersCard<"curse">[] = [
    {
        id: "curse_1",
        title: "Curse of the unguided tourist",
        description: "Send the seekers and unzoomed Googled Street View Images from a street within 150 meters of where they are now. The shot has to be parallel to the horizon and include at least one human build structure other than a road. Without using the internet for research, they must find what you sent them in real life before they can use transportation or ask another question. They must send a picture to the hiders for verification.",
        castingCost: "Seekers must be outside.",
        type: "curse"
    },
    {
        id: "curse_2",
        title: "Curse of the drained Brain",
        description: "Choose three questions in different categories. The seekers cannot ask those questions for the rest of your turn.",
        castingCost: "Discard Your hand.",
        type: "curse"
    },
    {
        id: "curse_3",
        title: "Curse of the Jammed Door",
        description: "For the next 20 minutes, whenever the seekers want to pass through a doorway into a building, business, train or other vehicle, they must first roll 2 dice. If they do not roll a 7 or higher, they cannot enter that space (including through other doorways). Any given doorway can be re-attempted after 5 minutes.",
        castingCost: "Discard Two cards",
        type: "curse"
    },
    {
        id: "curse_4",
        title: "Curse of the Right Turn",
        description: "For the next 20 minutes, the seeker can only run right at any street intersection. If, at any point, they find themselves in a dead end where they cannot continue forwards or turn right for another 300 meters, they may do a full 180. A right turn is defined as a road at any angle that veers to the right of the seekers.",
        castingCost: "Discard a card.",
        type: "curse"
    },
    {
        id: "curse_5",
        title: "Curse of the Bird Guide",
        description: "You have one chance to film a bird as long as possible, up to 5 minutes straight. If, at any point, the bird leaves the frame, your timer is stopped. The seekers must then film a bird for the same amount of time or longer before asking another question.",
        castingCost: "Film a bird.",
        type: "curse"
    },
    {
        id: "curse_6",
        title: "Curse of the Mediocre Travel Agent",
        description: "Choose any publicly-accessible place within a half kilometer of the seekers' current location. They cannot currently be on transit. They must go there and spend at least 5 minutes before asking another question. They must procure an object to bring you as a souvenir. If this souvenir is lost before they can give it to you, you are awarded an extra 30 minutes.",
        castingCost: "Their vacation destination must be further from you than their current location.",
        type: "curse"
    },
    {
        id: "curse_7",
        title: "Curse of the Zoologist",
        description: "Take a photo of a wild fish, bird, mammal, reptile, amphibian, or bug. The seekers must take a picture of a wild animal in the same category before asking another question.",
        castingCost: "A photo of an animal.",
        type: "curse"
    },
    {
        id: "curse_8",
        title: "Curse of the travelling Parisian",
        description: "The seekers must visit the top landmark (according to Tripadvisor) of the district they are currently in. Once there, they must take a photo at the landmark like any tourist pretending it is the Eiffel Tower.",
        castingCost: "Discard one card.",
        type: "curse"
    },
    {
        id: "curse_9",
        title: "Curse of the egg partner",
        description: "The seekers must acquire an egg before asking another question. The egg is now treated as an official team member. If any team member is abandoned or killed (defined as any crack, in the egg’s case) before the end of your run, you are awarded an extra 30 minutes. This curse cannot be played during the endgame.",
        castingCost: "Discard two cards.",
        type: "curse"
    },
    // {
    //     id: "curse_10",
    //     title: "Curse of the Ransom note",
    //     description: "The next question that the seekers ask must be composed of words and letters cut out of any printed material. The question must be coherent and include at least 5 words.",
    //     castingCost: "Spell out 'curse of the ransom note' as a ransom note.",
    //     type: "curse"
    // },
    {
        id: "curse_11",
        title: "Curse of the Lemon Phylactery",
        description: "Before asking another question, the seekers must each find a lemon and affix it to the outermost layer of their clothes or skin. If, at any point, one of these lemons is no longer touching a seeker, you are awarded an extra 20 minutes.",
        castingCost: "Discard 1 card.",
        type: "curse"
    },
    {
        id: "curse_12",
        title: "Curse of the Distant Cuisine",
        description: "Find a restaurant within your zone that explicitly serves food from a specific foreign country. The seekers must visit a restaurant serving food from a country that is an equal or greater distance away before asking another question.",
        castingCost: "You must be at the restaurant.",
        type: "curse"
    },
    {
        id: "curse_13",
        title: "Curse of the Cairn",
        description: "You have one attempt to stack as many rocks on top of each other as you can in a freestanding tower. Each rock may only touch one other rock. Once you have added a rock to the tower, it may not be removed. Before adding another rock, the tower must stand for at least five seconds. If, at any point, any rock other than the base rock touches the ground, your tower has fallen. The seekers must then construct a rock tower of the same number of rocks, under the same parameters, before asking another question. If their tower falls, they must restart. The rock must be found in nature and both teams must disperse the rocks after building.",
        castingCost: "Build a rock tower.",
        type: "curse"
    },
    {
        id: "curse_14",
        title: "Curse of the Gambler’s Feet",
        description: "For the next 20 minutes, the seeker must roll a die before they take any steps in any direction. They may take that many steps before rolling again.",
        castingCost: "Roll a die. If it’s an even number, this curse has no effect.",
        type: "curse"
    },
    {
        id: "curse_15",
        title: "Curse of the hidden Hangman",
        description: "Before asking another question or boarding another form of transportation, seekers must beat the hider in a game of hangman. To play, the hider chooses a 5 letter word, and the game ends after either a correct word guess or 7 wrong letter guesses (head, body, two arms, two legs and a hat). The hider must respond to all queries within 30 seconds. The seekers cannot challenge the hider for 10 minutes after a loss. After 3 losses, the seekers are released.",
        castingCost: "Discard 2 cards.",
        type: "curse"
    },
    {
        id: "curse_16",
        title: "Curse of the Endless Tumble",
        description: "Seekers must roll a die at least 30 meters and have it land on a 5 or 6 before they can ask another question. The die must roll the full distance, unaided, using only the momentum from the initial throw and gravity to travel the 30 meters. If the seekers accidentally hit someone with a die, you are awarded a 10 minute bonus.",
        castingCost: "Roll a die. If it's a 5 or 6, this card has no effect.",
        type: "curse"
    },
    {
        id: "curse_17",
        title: "Curse of the Frozen Dot",
        description: "Place a point on the map at least 500 meters from where the seekers are currently standing. If, in exactly 10 minutes, they are within 150 meters of that point, they are frozen in place for the next 15 minutes.",
        castingCost: "Seekers must be at least 2 km away.",
        type: "curse"
    },
    {
        id: "curse_18",
        title: "Curse of the Smelly Spatti",
        description: "The seekers must ask their next question from a Spatti.",
        castingCost: "Seekers must be at least 2 KM from you.",
        type: "curse"
    },
    {
        id: "curse_19",
        title: "Curse of the Black Hole",
        description: "Draw a 5 KM radius around the seekers. They cannot ask any questions while in that zone for the rest of the round.",
        castingCost: "Seekers cannot be within 7 KM of your hiding zone.",
        type: "curse"
    },
    {
        id: "curse_20",
        title: "Curse of the Berlin Wall",
        description: "Seekers must first find their way to the other side of the former wall before asking another question.",
        castingCost: "Discard 1 card.",
        type: "curse"
    },
    {
        id: "curse_21",
        title: "Curse of the Berlin Buergeramt",
        description: "Seekers must go to their Buergeramt and take a selfie with it.",
        castingCost: "You must go to your nearest Buergeramt.",
        type: "curse"
    },
    {
        id: "curse_22",
        title: "Curse of the Lemon Phylactery",
        description: "Before asking another question, the seekers must each find a lemon and affix it to the outermost layer of their clothes or skin. If, at any point, one of these lemons is no longer touching a seeker, you are awarded an extra 30 minutes.  The curse can not be played during the endgame.",
        castingCost: "Discard a card",
        type: "curse"
    }
];



const ActionCards: HidersCard<"action">[] = [{
    id: "action_1",
    title: "Draw 1",
    description: "Draw 1 card from the deck.",
    type: "action",
}, {
    id: "action_2",
    title: "Draw 1",
    description: "Draw 1 card from the deck.",
    type: "action",
}, {
    id: "action_3",
    title: "Veto",
    description: "Veto a question.",
    type: "action",
},
{
    id: "action_4",
    title: "Veto",
    description: "Veto a question.",
    type: "action",
}, {
    id: "action_5",
    title: "Duplicate",
    description: "Duplicate a card.",
    type: "action",
},
{
    id: "action_6",
    title: "Duplicate",
    description: "Duplicate a card.",
    type: "action",
}, {
    id: "action_7",
    title: "Discard 1, Draw 2",
    description: "Discard 1 card and draw 2 cards from the deck.",
    type: "action",
}, {
    id: "action_8",
    title: "Discard 1, Draw 2",
    description: "Discard 1 card and draw 2 cards from the deck.",
    type: "action",
}, {
    id: "action_9",
    title: "Discard 2, Draw 3",
    description: "Discard 2 cards and draw 3 cards from the deck.",
    type: "action",
},
{
    id: "action_10",
    title: "Discard 2, Draw 3",
    description: "Discard 2 cards and draw 3 cards from the deck.",
    type: "action",
}, {
    id: "action_11",
    title: "Randomise Question",
    description: "Randomise the next question.",
    type: "action",
}, {
    id: "action_12",
    title: "Randomise Question",
    description: "Randomise the next question.",
    type: "action",
}
];

const TimeBonusesCards: HidersCard<"time_bonuses">[] = [{
    id: "time_bonuses_2_minutes",
    title: "2 minutes",
    description: "Add 2 minutes to your time.",
    type: "time_bonuses",
    quantity: 7,
}, {
    id: "time_bonuses_4_minutes",
    title: "4 minutes",
    description: "Add 4 minutes to your time.",
    type: "time_bonuses",
    quantity: 7,
}, {
    id: "time_bonuses_8_minutes",
    title: "8 minutes",
    description: "Add 8 minutes to your time.",
    type: "time_bonuses",
    quantity: 6,
}, {
    id: "time_bonuses_12_minutes",
    title: "12 minutes",
    description: "Add 12 minutes to your time.",
    type: "time_bonuses",
    quantity: 4,
}, {
    id: "time_bonuses_18_minutes",
    title: "18 minutes",
    description: "Add 18 minutes to your time.",
    type: "time_bonuses",
    quantity: 2
}
];

export const CardDeck = {
    curseCards: CurseCards,
    actionCards: ActionCards,
    timeBonusesCards: TimeBonusesCards,
    allCards: [...CurseCards, ...ActionCards, ...TimeBonusesCards],
}