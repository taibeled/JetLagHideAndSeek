import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

import {
    isBundledPlayAreaId,
    loadPlayAreaByRelationId,
    parseRelationId,
} from "@/features/map/playAreaBoundary";
import {
    defaultPlayArea,
    knownPlayAreaPresets,
    type PlayArea,
    type PlayAreaCacheSource,
} from "@/features/map/playArea";

export type PlayAreaImportState = PlayArea;

type PlayAreaState = {
    applyRelationId: (value: string) => Promise<boolean>;
    applyPreset: (playArea: PlayArea) => void;
    cacheSource: PlayAreaCacheSource;
    error: string | null;
    isLoading: boolean;
    importPlayArea: (playArea: PlayAreaImportState) => void;
    playArea: PlayArea;
    presets: PlayArea[];
};

const PlayAreaContext = createContext<PlayAreaState | null>(null);

export function PlayAreaProvider({ children }: { children: ReactNode }) {
    const [playArea, setPlayArea] = useState<PlayArea>(defaultPlayArea);
    const [cacheSource, setCacheSource] =
        useState<PlayAreaCacheSource>("bundled");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const applyPreset = useCallback((nextPlayArea: PlayArea) => {
        setPlayArea(nextPlayArea);
        setCacheSource(
            isBundledPlayAreaId(nextPlayArea.osmId) ? "bundled" : "memory",
        );
        setError(null);
    }, []);

    const importPlayArea = useCallback((nextPlayArea: PlayAreaImportState) => {
        setPlayArea(nextPlayArea);
        setCacheSource(
            isBundledPlayAreaId(nextPlayArea.osmId) ? "bundled" : "memory",
        );
        setError(null);
    }, []);

    const applyRelationId = useCallback(async (value: string) => {
        const relationId = parseRelationId(value);
        if (relationId === null) {
            setError("Enter a positive OSM relation ID.");
            return false;
        }

        setIsLoading(true);
        setError(null);
        try {
            const result = await loadPlayAreaByRelationId(relationId);
            setPlayArea(result.playArea);
            setCacheSource(result.cacheSource);
            return true;
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not load that play area.",
            );
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const value = useMemo<PlayAreaState>(
        () => ({
            applyPreset,
            applyRelationId,
            cacheSource,
            error,
            importPlayArea,
            isLoading,
            playArea,
            presets: knownPlayAreaPresets,
        }),
        [
            applyPreset,
            applyRelationId,
            cacheSource,
            error,
            importPlayArea,
            isLoading,
            playArea,
        ],
    );

    return (
        <PlayAreaContext.Provider value={value}>
            {children}
        </PlayAreaContext.Provider>
    );
}

export function usePlayArea() {
    const context = useContext(PlayAreaContext);
    if (!context) {
        throw new Error("usePlayArea must be used within PlayAreaProvider.");
    }
    return context;
}
