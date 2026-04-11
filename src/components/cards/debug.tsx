export const QuestionDebugDetails = ({
    debug,
    title = "Detected Information",
    showHider = true,
}: {
    debug?: unknown;
    title?: string;
    showHider?: boolean;
}) => {
    if (!debug || typeof debug !== "object") return null;

    const entries = Object.entries(debug as Record<string, unknown>).filter(
        ([key]) => showHider || !key.toLowerCase().startsWith("hider"),
    );

    if (entries.length === 0) return null;

    const labelOverrides: Record<string, string> = {
        adminLevel: "OSM Admin Level",
        seekerDetectedBoundary: "Your detected boundary",
        hiderDetectedBoundary: "Hider detected boundary",
        seekerNearest: "Your nearest location",
        hiderNearest: "Hider nearest location",
        seekerNearestAirport: "Your nearest airport",
        hiderNearestAirport: "Hider nearest airport",
        seekerNearestStation: "Your nearest station",
        hiderNearestStation: "Hider nearest station",
        seekerDistanceMiles: "Your distance",
        hiderDistanceMiles: "Hider distance",
        seekerToHiderDistance: "Distance to hider",
        detectedResult: "Detected result",
        candidateCount: "Candidate locations found",
        detectedLocation: "Detected location",
        hiderWithinRadius: "Hider within radius",
        radius: "Radius",
        unit: "Unit",
        source: "Trace source",
        tracePointCount: "Trace points",
        traceLengthKm: "Trace length (km)",
        note: "Note",
    };

    const humanizeLabel = (key: string) => {
        if (labelOverrides[key]) return labelOverrides[key];
        return key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (s) => s.toUpperCase());
    };

    const renderValue = (value: unknown) => {
        if (typeof value === "boolean") {
            return value ? "Yes" : "No";
        }
        if (Array.isArray(value)) {
            return value.length > 0 ? value.join(", ") : "None";
        }
        if (typeof value === "number") {
            return Number.isFinite(value) ? value.toString() : "Unknown";
        }
        if (value === null || value === undefined || value === "") {
            return "Unknown";
        }
        if (typeof value === "object") {
            return JSON.stringify(value);
        }
        return String(value);
    };

    return (
        <div className="mx-2 my-1 rounded-md border border-border/60 bg-muted/30 px-2 py-2 text-xs text-muted-foreground">
            <div className="font-semibold mb-1 text-foreground/80">{title}</div>
            {entries.map(([key, value]) => {
                return (
                    <div key={key} className="leading-5">
                        <span className="font-medium text-foreground/80">
                            {humanizeLabel(key)}:
                        </span>{" "}
                        <span>{renderValue(value)}</span>
                    </div>
                );
            })}
        </div>
    );
};
