import { Shuffle } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    NYC_MAJOR_SUBWAY_STATIONS,
    type SubwayStation,
} from "@/data/nyc-subway-major-stations";

/** Official MTA bullet colors. N/Q/R/W use dark text on yellow. */
const LINE_COLORS: Record<string, { bg: string; fg: string }> = {
    "1": { bg: "#EE352E", fg: "#fff" },
    "2": { bg: "#EE352E", fg: "#fff" },
    "3": { bg: "#EE352E", fg: "#fff" },
    "4": { bg: "#00933C", fg: "#fff" },
    "5": { bg: "#00933C", fg: "#fff" },
    "6": { bg: "#00933C", fg: "#fff" },
    "7": { bg: "#B933AD", fg: "#fff" },
    A: { bg: "#2850AD", fg: "#fff" },
    C: { bg: "#2850AD", fg: "#fff" },
    E: { bg: "#2850AD", fg: "#fff" },
    B: { bg: "#FF6319", fg: "#fff" },
    D: { bg: "#FF6319", fg: "#fff" },
    F: { bg: "#FF6319", fg: "#fff" },
    M: { bg: "#FF6319", fg: "#fff" },
    G: { bg: "#6CBE45", fg: "#fff" },
    J: { bg: "#996633", fg: "#fff" },
    Z: { bg: "#996633", fg: "#fff" },
    L: { bg: "#A7A9AC", fg: "#fff" },
    N: { bg: "#FCCC0A", fg: "#000" },
    Q: { bg: "#FCCC0A", fg: "#000" },
    R: { bg: "#FCCC0A", fg: "#000" },
    W: { bg: "#FCCC0A", fg: "#000" },
    S: { bg: "#808183", fg: "#fff" },
    SIR: { bg: "#2850AD", fg: "#fff" },
};

function pick(): SubwayStation {
    return NYC_MAJOR_SUBWAY_STATIONS[
        Math.floor(Math.random() * NYC_MAJOR_SUBWAY_STATIONS.length)
    ]!;
}

interface Props {
    children: React.ReactNode;
}

export function SubwayStartDialog({ children }: Props) {
    const [open, setOpen] = useState(false);
    const [station, setStation] = useState<SubwayStation>(pick);

    const reroll = useCallback(() => setStation(pick()), []);

    const handleOpenChange = useCallback((next: boolean) => {
        if (next) setStation(pick());
        setOpen(next);
    }, []);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="max-w-xs">
                <DialogHeader>
                    <DialogTitle className="text-base">
                        Random Starting Station
                    </DialogTitle>
                </DialogHeader>

                {/* Station card */}
                <div className="flex flex-col items-center gap-4 py-2">
                    <div className="text-center">
                        <p className="text-xl font-bold leading-tight">
                            {station.name}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-sm">
                            {station.borough}
                        </p>
                    </div>

                    {/* Line bullets */}
                    <div className="flex flex-wrap justify-center gap-1.5">
                        {station.lines.map((line) => {
                            const c = LINE_COLORS[line] ?? {
                                bg: "#808183",
                                fg: "#fff",
                            };
                            return (
                                <span
                                    key={line}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                                    style={{
                                        backgroundColor: c.bg,
                                        color: c.fg,
                                    }}
                                >
                                    {line}
                                </span>
                            );
                        })}
                    </div>

                    {/* Criteria badges */}
                    <div className="flex flex-wrap justify-center gap-1.5">
                        {station.accessible && (
                            <span className="bg-muted rounded px-2 py-0.5 text-xs">
                                ♿ Accessible
                            </span>
                        )}
                        {station.junction && (
                            <span className="bg-muted rounded px-2 py-0.5 text-xs">
                                ⬡ Junction
                            </span>
                        )}
                        {station.express && (
                            <span className="bg-muted rounded px-2 py-0.5 text-xs">
                                ⚡ Express
                            </span>
                        )}
                    </div>
                </div>

                <Button
                    onClick={reroll}
                    variant="outline"
                    className="mx-auto flex w-fit gap-2"
                >
                    <Shuffle className="h-4 w-4" />
                    Reroll
                </Button>
            </DialogContent>
        </Dialog>
    );
}
