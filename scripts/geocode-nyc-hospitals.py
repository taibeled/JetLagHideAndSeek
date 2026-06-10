#!/usr/bin/env python3
"""
Geocode NYC hospitals from NYC_All_Hospitals.xlsx using Nominatim,
cluster hospitals within 1000 feet (305m), and output a TypeScript data file.

Usage:
    python scripts/geocode-nyc-hospitals.py --xlsx /path/to/NYC_All_Hospitals.xlsx

    The xlsx file is not committed to the repo. Download it from NYC Open Data and
    pass its path via --xlsx (or place it at <repo>/data/NYC_All_Hospitals.xlsx).

Requires:
    pip install pandas openpyxl requests
"""

import argparse
import json
import math
import re
import time
from datetime import date
from pathlib import Path

import pandas as pd
import requests

# ── Repo-relative defaults ────────────────────────────────────────────────────
_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_XLSX = _REPO_ROOT / "data" / "NYC_All_Hospitals.xlsx"
_DEFAULT_OUTPUT_TS = _REPO_ROOT / "src" / "data" / "nyc-hospitals.ts"
# Resumable geocoding cache. Repo-relative (not /tmp, which doesn't exist on
# Windows and is wiped on reboot); gitignored via _cache/.
_DEFAULT_PROGRESS = _REPO_ROOT / "_cache" / "nyc_hospitals_geocoded.json"

# ── CLI ───────────────────────────────────────────────────────────────────────
_parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
_parser.add_argument("--xlsx", type=Path, default=_DEFAULT_XLSX,
                     help="Path to NYC_All_Hospitals.xlsx (default: %(default)s)")
_parser.add_argument("--output", type=Path, default=_DEFAULT_OUTPUT_TS,
                     help="Output TypeScript file (default: %(default)s)")
_parser.add_argument("--progress", type=Path, default=_DEFAULT_PROGRESS,
                     help="Geocoding progress cache (default: %(default)s)")
_args = _parser.parse_args()

# ── Config ────────────────────────────────────────────────────────────────────
XLSX_PATH = _args.xlsx
PROGRESS_FILE = _args.progress
OUTPUT_TS = _args.output
CLUSTER_RADIUS_M = 305  # ~1000 feet
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "JetLagHideAndSeek-geocoder"
SLEEP_S = 1.1


# ── Haversine ─────────────────────────────────────────────────────────────────
def haversine_m(lat1, lon1, lat2, lon2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Nominatim query (resilient) ───────────────────────────────────────────────
def _nominatim_query(params):
    """Run one Nominatim search. Returns the parsed JSON list, or None on any
    failure (timeout, 429/5xx, HTML error page, non-JSON body). Never raises —
    a single bad response must not crash a multi-hundred-row geocoding run."""
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
    except requests.RequestException as e:
        print(f"[req error: {e}]", end="  ", flush=True)
        return None
    if not resp.ok:
        snippet = resp.text[:120].replace("\n", " ")
        print(f"[HTTP {resp.status_code}: {snippet}]", end="  ", flush=True)
        return None
    if "json" not in resp.headers.get("content-type", "").lower():
        snippet = resp.text[:120].replace("\n", " ")
        print(f"[non-JSON: {snippet}]", end="  ", flush=True)
        return None
    try:
        return resp.json()
    except ValueError as e:
        print(f"[bad JSON: {e}]", end="  ", flush=True)
        return None


# ── Geocode one hospital ──────────────────────────────────────────────────────
def geocode(name, address, city, state):
    # Attempt 1: structured query
    results = _nominatim_query({
        "street": address,
        "city": city,
        "state": state,
        "country": "US",
        "format": "json",
        "limit": 1,
    })
    if results:
        r = results[0]
        return float(r["lat"]), float(r["lon"]), "structured"

    time.sleep(SLEEP_S)

    # Attempt 2: free-text fallback — include hospital name for better match
    results2 = _nominatim_query(
        {"q": f"{name}, {address}, {city}, NY, USA", "format": "json", "limit": 1}
    )
    if results2:
        r = results2[0]
        return float(r["lat"]), float(r["lon"]), "fallback"

    return None, None, "failed"


# ── Slug helper ───────────────────────────────────────────────────────────────
def to_ref(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s)
    return s[:40].rstrip("-")


# ── Cluster helper ────────────────────────────────────────────────────────────
def cluster_name(members: list[str]) -> str:
    if len(members) == 1:
        return members[0]
    if len(members) <= 3:
        return " / ".join(members)
    shortest = min(members, key=len)
    return f"{shortest} (campus)"


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    df = pd.read_excel(XLSX_PATH)
    hospitals = df[["Hospital Name", "Address", "City", "State"]].to_dict("records")

    # Load progress
    geocoded: dict = {}
    if PROGRESS_FILE.exists():
        geocoded = json.loads(PROGRESS_FILE.read_text())
        print(f"Resuming — {len(geocoded)} already geocoded")
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Geocode
    for i, h in enumerate(hospitals):
        key = h["Hospital Name"]
        if key in geocoded:
            continue
        print(f"[{i+1:02d}/81] {key[:60]}...", end="  ", flush=True)
        lat, lng, method = geocode(key, h["Address"], h["City"], h["State"])
        if lat is not None:
            print(f"→ {lat:.5f}, {lng:.5f}  ({method})")
        else:
            print("→ FAILED")
        geocoded[key] = {"lat": lat, "lng": lng, "method": method,
                          "address": h["Address"], "city": h["City"]}
        PROGRESS_FILE.write_text(json.dumps(geocoded, indent=2))
        time.sleep(SLEEP_S)

    # Separate successful / failed
    ok = [(name, d["lat"], d["lng"]) for name, d in geocoded.items() if d["lat"] is not None]
    failed = [name for name, d in geocoded.items() if d["lat"] is None]
    print(f"\nGeocoded: {len(ok)}/{len(hospitals)}  |  Failed: {len(failed)}")
    if failed:
        for f in failed:
            print(f"  FAILED: {f}")

    # Sort by name (gives deterministic member ordering within each cluster).
    ok.sort(key=lambda x: x[0])

    # Cluster via connected components (single-linkage): union any two
    # hospitals within CLUSTER_RADIUS_M, then average each component to its
    # centroid. This is order-independent — unlike greedy first-match
    # assignment, where a shifting centroid made the result depend on
    # iteration order. It also matches the stated rule: hospitals within
    # 1000ft *of each other* merge.
    parent = list(range(len(ok)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]  # path compression
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    for i in range(len(ok)):
        for j in range(i + 1, len(ok)):
            if haversine_m(ok[i][1], ok[i][2], ok[j][1], ok[j][2]) <= CLUSTER_RADIUS_M:
                union(i, j)

    components: dict[int, list[int]] = {}
    for i in range(len(ok)):
        components.setdefault(find(i), []).append(i)

    clusters: list[dict] = []  # {lat, lng, members}
    for idxs in components.values():
        members = [ok[i][0] for i in idxs]
        clusters.append({
            "lat": sum(ok[i][1] for i in idxs) / len(idxs),
            "lng": sum(ok[i][2] for i in idxs) / len(idxs),
            "members": members,
        })

    # Sort clusters by display name
    clusters.sort(key=lambda c: cluster_name(c["members"]))

    print(f"\nClusters after {CLUSTER_RADIUS_M}m merge: {len(clusters)}")
    merged = [c for c in clusters if len(c["members"]) > 1]
    if merged:
        print("\nMerged clusters:")
        for c in merged:
            print(f"  • {cluster_name(c['members'])}")
            for m in c["members"]:
                print(f"      - {m}")

    # Build TypeScript entries
    ts_entries = []
    # Dedupe refs: to_ref truncates to 40 chars and same-named hospitals in
    # different boroughs collide, so two clusters can yield the same slug.
    # `ref` is a stable toggle key downstream, so collisions would conflate
    # entries. Clusters are already deterministically sorted, so appending a
    # numeric suffix per repeated base keeps refs stable across re-runs.
    seen_refs: dict[str, int] = {}
    for c in clusters:
        display = cluster_name(c["members"])
        base_ref = to_ref(display)
        count = seen_refs.get(base_ref, 0)
        seen_refs[base_ref] = count + 1
        ref = base_ref if count == 0 else f"{base_ref}-{count}"
        members_json = json.dumps(c["members"], ensure_ascii=False)
        ts_entries.append(
            f'    {{\n'
            f'        name: {json.dumps(display)},\n'
            f'        lat: {c["lat"]:.6f},\n'
            f'        lng: {c["lng"]:.6f},\n'
            f'        ref: "{ref}",\n'
            f'        members: {members_json},\n'
            f'    }}'
        )

    today = date.today().isoformat()
    ts = f"""// Curated NYC hospital list, geocoded from NYC_All_Hospitals.xlsx.
// Hospitals within 1000 feet (305m) of each other are merged into a single point.
// Generated: {today} — do not edit by hand, re-run scripts/geocode-nyc-hospitals.py

export interface NycHospital {{
    name: string;
    lat: number;
    lng: number;
    /** OSM-style ref for toggle/disable tracking */
    ref: string;
    /** Original hospital names that were merged into this point */
    members: string[];
}}

export const NYC_HOSPITALS: NycHospital[] = [
{',\n'.join(ts_entries)},
];
"""

    OUTPUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_TS.write_text(ts)
    print(f"\nWrote {len(clusters)} entries → {OUTPUT_TS}")

    # Summary
    print("\n── Summary ─────────────────────────────────────────────────────")
    print(f"  Total hospitals in spreadsheet: {len(hospitals)}")
    print(f"  Successfully geocoded:          {len(ok)}")
    print(f"  Failed:                         {len(failed)}")
    print(f"  Clusters after 305m merge:      {len(clusters)}")
    print(f"  Merged groups (2+ hospitals):   {len(merged)}")


if __name__ == "__main__":
    main()
