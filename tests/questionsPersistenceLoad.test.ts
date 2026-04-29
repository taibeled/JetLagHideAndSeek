import { beforeEach, describe, expect, it, vi } from "vitest";

type StorageMap = Map<string, string>;

class InMemoryStorage implements Storage {
    private data: StorageMap = new Map();

    clear() {
        this.data.clear();
    }

    getItem(key: string) {
        return this.data.has(key) ? this.data.get(key)! : null;
    }

    key(index: number) {
        return Array.from(this.data.keys())[index] ?? null;
    }

    removeItem(key: string) {
        this.data.delete(key);
    }

    setItem(key: string, value: string) {
        this.data.set(key, value);
    }

    get length() {
        return this.data.size;
    }
}

const makeLargeQuestionsPayload = (questionCount: number, blobSize: number) => {
    const largeName = "custom-station-".concat("x".repeat(blobSize));

    return JSON.stringify(
        Array.from({ length: questionCount }, (_, i) => ({
            id: "tentacles",
            key: i + 1,
            data: {
                lat: 35.0 + i / 1000,
                lng: 139.0 + i / 1000,
                drag: true,
                color: "blue",
                collapsed: false,
                radius: 15,
                unit: "miles",
                locationType: "custom",
                location: false,
                places: [
                    {
                        type: "Feature",
                        geometry: {
                            type: "Point",
                            coordinates: [139.0 + i / 1000, 35.0 + i / 1000],
                        },
                        properties: {
                            name: `${largeName}-${i}`,
                        },
                    },
                ],
            },
        })),
    );
};

describe("questions persistence under load", () => {
    beforeEach(() => {
        vi.resetModules();
        const storage = new InMemoryStorage();
        vi.stubGlobal("localStorage", storage);
        vi.stubGlobal("window", {
            localStorage: storage,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
    });

    it("does not reset to empty when a large persisted payload is corrupted", async () => {
        // Simulate a long session with many custom map questions.
        const largePayload = makeLargeQuestionsPayload(400, 300);
        expect(largePayload.length).toBeGreaterThan(100_000);

        // Simulate corruption under persistence pressure (truncated JSON).
        localStorage.setItem("questions", largePayload.slice(0, -20));

        const context = await import("@/lib/context");
        const persistedQuestions = context.questions.get();

        // Desired behavior: avoid silently dropping all history after decode issues.
        expect(persistedQuestions.length).toBeGreaterThan(0);
    });
});
