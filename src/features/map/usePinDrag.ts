import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import type { QuestionState } from "@/features/questions/questionTypes";

import type { Position } from "./geojsonTypes";

const PIN_HIT_RADIUS_PX = 50;

export type PinDragHandlers = {
    handleDragEnd: () => void;
    handleDragFinalize: () => void;
    handleDragStart: (absoluteX: number, absoluteY: number) => Promise<void>;
    handleDragUpdate: (absoluteX: number, absoluteY: number) => void;
};

export type PinDragState = {
    draftCoordinate: Position | null;
    dragHandlers: PinDragHandlers;
    gesture: ReturnType<typeof Gesture.Pan>;
    isDragging: boolean;
    revision: number;
};

type UsePinDragOptions = {
    activeQuestion: QuestionState | null;
    canMove: boolean;
    mapRef: RefObject<{
        getCoordinateFromView: (point: [number, number]) => Promise<Position>;
        getPointInView: (coordinate: Position) => Promise<[number, number]>;
    } | null>;
    onCommit: (questionId: string, center: Position) => void;
};

export function usePinDrag({
    activeQuestion,
    canMove,
    mapRef,
    onCommit,
}: UsePinDragOptions): PinDragState {
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = useRef(false);
    const draftPinCoordinateRef = useRef<Position | null>(null);
    const rafRef = useRef<number | null>(null);
    const [tick, setTick] = useState(0);
    const draftCoordinate = isDragging ? draftPinCoordinateRef.current : null;

    const cleanupDrag = useCallback(() => {
        isDraggingRef.current = false;
        setIsDragging(false);
        draftPinCoordinateRef.current = null;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!canMove) {
            cleanupDrag();
        }
    }, [canMove, cleanupDrag]);

    useEffect(() => {
        return () => {
            cleanupDrag();
        };
    }, [cleanupDrag]);

    const updateDraftCoordinate = useCallback(
        (screenX: number, screenY: number) => {
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(async () => {
                rafRef.current = null;
                try {
                    const coordinate =
                        await mapRef.current?.getCoordinateFromView([
                            screenX,
                            screenY,
                        ]);
                    if (isDraggingRef.current && coordinate) {
                        draftPinCoordinateRef.current = coordinate;
                        setTick((t) => t + 1);
                    }
                } catch {
                    // ignore projection errors during drag
                }
            });
        },
        [mapRef],
    );

    const handleDragStart = useCallback(
        async (absoluteX: number, absoluteY: number) => {
            const pinCoord = activeQuestion
                ? getQuestionCenter(activeQuestion)
                : null;
            if (!pinCoord || !mapRef.current) {
                isDraggingRef.current = false;
                return;
            }
            try {
                const screenPoint =
                    await mapRef.current.getPointInView(pinCoord);
                const dx = absoluteX - screenPoint[0];
                const dy = absoluteY - screenPoint[1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= PIN_HIT_RADIUS_PX) {
                    isDraggingRef.current = true;
                    setIsDragging(true);
                } else {
                    isDraggingRef.current = false;
                }
            } catch {
                isDraggingRef.current = false;
            }
        },
        [activeQuestion, mapRef],
    );

    const handleDragUpdate = useCallback(
        (absoluteX: number, absoluteY: number) => {
            if (!isDraggingRef.current) return;
            updateDraftCoordinate(absoluteX, absoluteY);
        },
        [updateDraftCoordinate],
    );

    const handleDragEnd = useCallback(() => {
        if (
            isDraggingRef.current &&
            draftPinCoordinateRef.current &&
            activeQuestion &&
            getQuestionCenter(activeQuestion)
        ) {
            onCommit(activeQuestion.id, draftPinCoordinateRef.current);
        }
        cleanupDrag();
    }, [activeQuestion, cleanupDrag, onCommit]);

    const handleDragFinalize = useCallback(() => {
        cleanupDrag();
    }, [cleanupDrag]);

    const gesture = useMemo(() => {
        return Gesture.Pan()
            .activateAfterLongPress(300)
            .enabled(canMove)
            .onStart((event: { absoluteX: number; absoluteY: number }) => {
                runOnJS(handleDragStart)(event.absoluteX, event.absoluteY);
            })
            .onUpdate((event: { absoluteX: number; absoluteY: number }) => {
                runOnJS(handleDragUpdate)(event.absoluteX, event.absoluteY);
            })
            .onEnd(() => {
                runOnJS(handleDragEnd)();
            })
            .onFinalize(() => {
                runOnJS(handleDragFinalize)();
            });
    }, [
        canMove,
        handleDragStart,
        handleDragUpdate,
        handleDragEnd,
        handleDragFinalize,
    ]);

    return {
        draftCoordinate,
        dragHandlers: {
            handleDragEnd,
            handleDragFinalize,
            handleDragStart,
            handleDragUpdate,
        },
        gesture,
        isDragging,
        revision: tick,
    };
}

function getQuestionCenter(question: QuestionState): Position | null {
    return "center" in question ? question.center : null;
}
