import { act, renderHook } from "@testing-library/react-native";

import type { RadarQuestion } from "@/features/questions/radar/radarTypes";

import { usePinDrag } from "../usePinDrag";

function makeRadarQuestion(
    center: [number, number] = [139.65, 35.67],
): RadarQuestion {
    return {
        answer: "unanswered",
        center,
        createdAt: "2026-05-18T00:00:00.000Z",
        distanceMeters: 500,
        distanceOption: "500m",
        distanceUnit: "m",
        id: "radar-1",
        type: "radar",
        updatedAt: "2026-05-18T00:00:00.000Z",
    };
}

describe("usePinDrag", () => {
    it("does not start dragging when the touch is far from the pin", async () => {
        const mapRef = {
            current: {
                getCoordinateFromView: jest.fn(),
                getPointInView: jest.fn().mockResolvedValue([100, 100]),
            },
        };
        const onCommit = jest.fn();

        const { result } = renderHook(() =>
            usePinDrag({
                activeQuestion: makeRadarQuestion(),
                canMove: true,
                mapRef,
                onCommit,
            }),
        );

        await act(async () => {
            await result.current.dragHandlers.handleDragStart(200, 200);
        });

        expect(result.current.isDragging).toBe(false);
        expect(onCommit).not.toHaveBeenCalled();
    });

    it("starts dragging and commits when the touch is near the pin", async () => {
        const nextCenter: [number, number] = [139.7, 35.7];
        const mapRef = {
            current: {
                getCoordinateFromView: jest.fn().mockResolvedValue(nextCenter),
                getPointInView: jest.fn().mockResolvedValue([100, 100]),
            },
        };
        const onCommit = jest.fn();

        const { result } = renderHook(() =>
            usePinDrag({
                activeQuestion: makeRadarQuestion([139.65, 35.67]),
                canMove: true,
                mapRef,
                onCommit,
            }),
        );

        await act(async () => {
            await result.current.dragHandlers.handleDragStart(120, 130);
        });
        expect(result.current.isDragging).toBe(true);

        await act(async () => {
            result.current.dragHandlers.handleDragUpdate(140, 150);
            await new Promise((resolve) => {
                requestAnimationFrame(resolve);
            });
        });

        await act(async () => {
            result.current.dragHandlers.handleDragEnd();
        });

        expect(onCommit).toHaveBeenCalledWith("radar-1", nextCenter);
        expect(result.current.isDragging).toBe(false);
    });

    it("cleans up drag state when canMove becomes false", async () => {
        const mapRef = {
            current: {
                getCoordinateFromView: jest.fn(),
                getPointInView: jest.fn().mockResolvedValue([100, 100]),
            },
        };
        const onCommit = jest.fn();

        const { result, rerender } = renderHook(
            (props: { canMove: boolean }) =>
                usePinDrag({
                    activeQuestion: makeRadarQuestion(),
                    canMove: props.canMove,
                    mapRef,
                    onCommit,
                }),
            { initialProps: { canMove: true } },
        );

        await act(async () => {
            await result.current.dragHandlers.handleDragStart(120, 130);
        });
        expect(result.current.isDragging).toBe(true);

        rerender({ canMove: false });
        expect(result.current.isDragging).toBe(false);
    });
});
