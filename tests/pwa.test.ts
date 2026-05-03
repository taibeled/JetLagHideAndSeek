import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const distDir = path.resolve(import.meta.dirname, "../dist");
const swPath = path.join(distDir, "sw.js");
const manifestPath = path.join(distDir, "manifest.webmanifest");

const describeFn =
  existsSync(swPath) && existsSync(manifestPath) ? describe : describe.skip;

describeFn("pwa build validation", () => {
  it("service worker exists and imports workbox", () => {
    const content = readFileSync(swPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/importScripts.*workbox|import\s+.*workbox-/);
  });

  it("service worker uses NetworkOnly for API routes", () => {
    const content = readFileSync(swPath, "utf-8");
    expect(content).toContain("/api/cas/");
    expect(content).toContain("/api/teams/");
    expect(content).toContain("NetworkOnly");
  });

  it("manifest has required fields", () => {
    const raw = readFileSync(manifestPath, "utf-8");
    let manifest: unknown;
    expect(() => {
      manifest = JSON.parse(raw);
    }).not.toThrow();

    const m = manifest as Record<string, unknown>;
    expect(m.name).toBeTruthy();
    expect(typeof m.name).toBe("string");
    expect(m.start_url).toBeTruthy();
    expect(typeof m.start_url).toBe("string");
    expect(Array.isArray(m.icons)).toBe(true);
    expect((m.icons as unknown[]).length).toBeGreaterThan(0);
  });

  it("precache manifest includes key assets", () => {
    const content = readFileSync(swPath, "utf-8");
    expect(content).toContain("index.html");
    expect(content).toMatch(/precacheAndRoute|PrecacheEntry/);
  });
});
