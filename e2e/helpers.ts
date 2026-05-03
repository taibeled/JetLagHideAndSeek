import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as zlib from "node:zlib";

import type { Locator, Page, Route } from "@playwright/test";
import { expect, request } from "@playwright/test";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Inlined wire helpers (avoid importing from src/ which uses Astro aliases) ---

const teamSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
  name: z.string(),
});

const wireV1SnapshotSchema = z
  .object({
    v: z.literal(1),
    team: teamSchema.optional(),
  })
  .passthrough();

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue;
    sorted[key] = sortKeysDeep(v);
  }
  return sorted;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

// --- SID computation (mirrors server/src/sid.ts) ---

function computeSidFromCanonicalUtf8(canonicalUtf8: string): string {
  const hash = createHash("sha256")
    .update(canonicalUtf8, "utf8")
    .digest()
    .subarray(0, 16);
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// --- CAS blob builder ---

export async function buildCasBlob(snapshot: unknown): Promise<{
  sid: string;
  compressedPayload: string;
}> {
  const parsed = wireV1SnapshotSchema.parse(snapshot);
  const canonicalUtf8 = canonicalize(parsed);
  const sid = computeSidFromCanonicalUtf8(canonicalUtf8);
  const compressedPayload = zlib
    .deflateSync(Buffer.from(canonicalUtf8, "utf8"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return { sid, compressedPayload };
}

// --- Fixture loading ---

export function loadFixture(name: string): Record<string, unknown> {
  const raw = readFileSync(join(__dirname, "fixtures", name), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

// --- CAS blob seeding via real PUT ---

export async function seedOrMockCasBlob(
  sid: string,
  payload: string,
): Promise<void> {
  const ctx = await request.newContext({ baseURL: "http://localhost:8787" });
  try {
    const res = await ctx.put(`/api/cas/blobs/${sid}`, {
      headers: { "content-type": "text/plain; charset=utf-8" },
      data: payload,
    });
    if (!res.ok()) {
      throw new Error(
        `Failed to seed CAS blob ${sid}: ${res.status()} ${await res.text()}`,
      );
    }
  } finally {
    await ctx.dispose();
  }
}

// --- PWA state cleardown ---

export async function clearPwaState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  });
}

// --- Utility helpers ---

export async function maybeClick(locator: Locator): Promise<void> {
  try {
    if (await locator.isVisible({ timeout: 2000 })) {
      await locator.click();
    }
  } catch {
    // element not visible or clickable — ignore
  }
}

export function stationPreview(page: Page): Locator {
  return page.getByTestId("station-preview");
}

// --- Overpass mock infrastructure ---

const overpassUrls = [
  "https://overpass-api.de/api/interpreter**",
  "https://overpass.private.coffee/api/interpreter**",
];

export interface OverpassMockCall {
  url: string;
  /** Decoded `?data=` query param — the searchable Overpass query string. */
  query: string;
  servedFixture: string;
}

export interface OverpassFixtureContract {
  fixture: string;
  /** Matcher: return true if this fixture should serve the intercepted request. */
  match: (url: URL, body: string) => boolean;
  delay?: number;
}

export interface OverpassMock {
  calls: OverpassMockCall[];
  assertCalledRelation: (id: string) => void;
  assertNotCalledWay: (id: string) => void;
}

/**
 * Install page.route() interceptors for Overpass API.
 * Contracts are tested in order; the first match wins.
 * Unmatched Overpass requests pass through to the real API.
 */
export async function mockOverpass(
  page: Page,
  contracts: OverpassFixtureContract[],
): Promise<OverpassMock> {
  const calls: OverpassMockCall[] = [];

  for (const url of overpassUrls) {
    await page.route(url, (route) => {
      const req = route.request();
      const reqUrl = new URL(req.url());
      const query = decodeURIComponent(
        reqUrl.searchParams.get("data") ?? "",
      );
      const body = req.postData() ?? "";

      for (const contract of contracts) {
        if (contract.match(reqUrl, body)) {
          calls.push({
            url: reqUrl.toString(),
            query,
            servedFixture: contract.fixture,
          });
          const raw = readFileSync(
            join(__dirname, "fixtures", contract.fixture),
            "utf8",
          );
          const fulfill = () =>
            route.fulfill({ body: raw, contentType: "application/json" });
          if (contract.delay) {
            return new Promise<void>((resolve) =>
              setTimeout(() => {
                fulfill().then(resolve);
              }, contract.delay),
            );
          }
          return fulfill();
        }
      }

      return route.continue();
    });
  }

  return {
    calls,
    assertCalledRelation(id: string) {
      const match = calls.some(
        (c) => c.query.includes(`relation(${id})`),
      );
      expect(
        match,
        `Expected an Overpass call containing relation(${id})`,
      ).toBe(true);
    },
    assertNotCalledWay(id: string) {
      const match = calls.some(
        (c) => c.query.includes(`way(${id})`),
      );
      expect(
        match,
        `Expected no Overpass call containing way(${id})`,
      ).toBe(false);
    },
  };
}

/** Build a query-fragment matcher for Overpass requests. */
export function matchOverpassQuery(
  fragments: string[],
): (url: URL, body: string) => boolean {
  return (url, body) => {
    const dataParam = url.searchParams.get("data") ?? "";
    const searchable =
      decodeURIComponent(dataParam) + (body ? `\n${body}` : "");
    return fragments.every((f) => searchable.includes(f));
  };
}

/** Convenience: create a contract from a fixture name and query fragments. */
export function overpassRoute(
  fixture: string,
  fragments: string[],
  delay?: number,
): OverpassFixtureContract {
  return { fixture, match: matchOverpassQuery(fragments), delay };
}
