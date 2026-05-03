import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverCasServer } from "@/lib/casDiscovery";
import {
    casServerEffectiveUrl,
    casServerStatus,
    casServerUrl,
} from "@/lib/context";

const { probeHealthMock } = vi.hoisted(() => ({
    probeHealthMock: vi.fn(),
}));

vi.mock("@/lib/cas", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/cas")>("@/lib/cas");
    return { ...actual, probeHealth: probeHealthMock };
});

const ORIGIN = "http://localhost:8787";
const BASE_PATH = "/JetLagHideAndSeek";

describe("casDiscovery", () => {
    beforeEach(() => {
        vi.stubGlobal("window", { location: { origin: ORIGIN } });
        vi.stubEnv("BASE_URL", `${BASE_PATH}/`);
    });

    afterEach(() => {
        probeHealthMock.mockReset();
        casServerStatus.set("unknown");
        casServerEffectiveUrl.set(null);
        casServerUrl.set("");
        vi.unstubAllGlobals();
    });

    it("probes window.location.origin first", async () => {
        probeHealthMock.mockResolvedValueOnce(true);

        await discoverCasServer();

        expect(probeHealthMock).toHaveBeenCalledTimes(1);
        expect(probeHealthMock).toHaveBeenCalledWith(ORIGIN);
        expect(casServerEffectiveUrl.get()).toBe(ORIGIN);
        expect(casServerStatus.get()).toBe("available");
    });

    it("falls back to window.location.origin + BASE_URL when origin alone fails", async () => {
        probeHealthMock
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        await discoverCasServer();

        expect(probeHealthMock).toHaveBeenCalledTimes(2);
        expect(probeHealthMock).toHaveBeenNthCalledWith(1, ORIGIN);
        expect(probeHealthMock).toHaveBeenNthCalledWith(
            2,
            `${ORIGIN}${BASE_PATH}`,
        );
        expect(casServerEffectiveUrl.get()).toBe(`${ORIGIN}${BASE_PATH}`);
        expect(casServerStatus.get()).toBe("available");
    });

    it("falls back to user-configured casServerUrl when BASE_URL also fails", async () => {
        casServerUrl.set("http://custom:3000/");
        probeHealthMock
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        await discoverCasServer();

        expect(probeHealthMock).toHaveBeenCalledTimes(3);
        expect(probeHealthMock).toHaveBeenNthCalledWith(1, ORIGIN);
        expect(probeHealthMock).toHaveBeenNthCalledWith(
            2,
            `${ORIGIN}${BASE_PATH}`,
        );
        expect(probeHealthMock).toHaveBeenNthCalledWith(
            3,
            "http://custom:3000",
        );
        expect(casServerEffectiveUrl.get()).toBe("http://custom:3000");
        expect(casServerStatus.get()).toBe("available");
    });

    it("sets casServerStatus to 'available' when a candidate succeeds", async () => {
        probeHealthMock
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        await discoverCasServer();

        expect(casServerStatus.get()).toBe("available");
        expect(casServerEffectiveUrl.get()).not.toBeNull();
    });

    it("sets casServerStatus to 'unavailable' and casServerEffectiveUrl to null when all fail", async () => {
        probeHealthMock.mockResolvedValue(false);

        await discoverCasServer();

        expect(casServerStatus.get()).toBe("unavailable");
        expect(casServerEffectiveUrl.get()).toBeNull();
    });

    it("root deploy candidate behavior — with base path /, probes only origin after dedupe", async () => {
        vi.stubEnv("BASE_URL", "/");
        probeHealthMock.mockResolvedValueOnce(true);

        await discoverCasServer();

        expect(probeHealthMock).toHaveBeenCalledTimes(1);
        expect(probeHealthMock).toHaveBeenCalledWith(ORIGIN);
        expect(casServerEffectiveUrl.get()).toBe(ORIGIN);
        expect(casServerStatus.get()).toBe("available");
    });
});
