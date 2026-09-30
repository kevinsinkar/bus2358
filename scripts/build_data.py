#!/usr/bin/env python3
"""Build data/routes.json and data/trips.json from CapMetro's static GTFS.

routes.json: {route_id: {name, long, color, shapes: {shape_id: [[lat, lon], ...]}}}
trips.json:  {trip_id: shape_id}

Usage: python scripts/build_data.py [--gtfs path/to/gtfs.zip]
"""
import argparse
import csv
import io
import json
import math
import os
import sys
import urllib.request
import zipfile
from collections import defaultdict

# CapMetro static GTFS on the Texas open data portal. If this ever 404s, find the
# current download link on https://data.texas.gov (search "CapMetro GTFS").
GTFS_URL = "https://data.texas.gov/download/r4v4-vz24/application/zip"
OUT = os.path.join(os.path.dirname(__file__), "..", "data")
TOLERANCE_M = 4.0  # polyline simplification tolerance


def read_csv(z, name):
    with z.open(name) as f:
        return csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def simplify(points, tol_m):
    """Ramer-Douglas-Peucker on lat/lon using a local equirectangular projection."""
    if len(points) < 3:
        return points
    lat0 = math.radians(points[0][0])
    kx, ky = 111320 * math.cos(lat0), 110540
    xy = [((lon * kx), (lat * ky)) for lat, lon in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = xy[a], xy[b]
        dx, dy = x2 - x1, y2 - y1
        denom = math.hypot(dx, dy) or 1e-9
        best, idx = -1.0, None
        for i in range(a + 1, b):
            x0, y0 = xy[i]
            d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / denom
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol_m:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtfs", help="local GTFS zip (skips download)")
    args = ap.parse_args()

    if args.gtfs:
        data = open(args.gtfs, "rb").read()
    else:
        req = urllib.request.Request(GTFS_URL, headers={"User-Agent": "bus2358-tracker"})
        data = urllib.request.urlopen(req, timeout=120).read()
    z = zipfile.ZipFile(io.BytesIO(data))

    routes = {}
    for r in rows(z, "routes.txt"):
        routes[r["route_id"]] = {
            "name": (r.get("route_short_name") or r["route_id"]).strip(),
            "long": (r.get("route_long_name") or "").strip(),
            "color": (r.get("route_color") or "").strip().lstrip("#"),
            "shapes": {},
        }

    trips, shape_route = {}, {}
    for t in rows(z, "trips.txt"):
        sid = t.get("shape_id") or ""
        if not sid:
            continue
        trips[t["trip_id"]] = sid
        shape_route.setdefault(sid, t["route_id"])

    pts = defaultdict(list)
    for s in rows(z, "shapes.txt"):
        if s["shape_id"] in shape_route:
            pts[s["shape_id"]].append((int(s["shape_pt_sequence"]), float(s["shape_pt_lat"]), float(s["shape_pt_lon"])))

    for sid, lst in pts.items():
        lst.sort()
        line = simplify([(la, lo) for _, la, lo in lst], TOLERANCE_M)
        rid = shape_route[sid]
        if rid in routes:
            routes[rid]["shapes"][sid] = [[round(la, 5), round(lo, 5)] for la, lo in line]

    routes = {k: v for k, v in routes.items() if v["shapes"]}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "routes.json"), "w") as f:
        json.dump(routes, f, separators=(",", ":"))
    with open(os.path.join(OUT, "trips.json"), "w") as f:
        json.dump(trips, f, separators=(",", ":"))
    print(f"routes: {len(routes)}, shapes: {sum(len(v['shapes']) for v in routes.values())}, trips: {len(trips)}")


if __name__ == "__main__":
    sys.exit(main())
