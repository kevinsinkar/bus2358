"""Builds a tiny synthetic GTFS zip and checks scripts/build_data.py output."""
import io, json, os, subprocess, sys, tempfile, zipfile

ROOT = os.path.join(os.path.dirname(__file__), "..")

files = {
    "routes.txt": "route_id,route_short_name,route_long_name,route_color\n801,801,MetroRapid N Lamar/S Congress,E31837\n20,20,Manor Rd/Riverside,0072BC\n999,999,No shapes,000000\n",
    "trips.txt": "route_id,service_id,trip_id,shape_id\n801,wk,T1,s801a\n801,wk,T2,s801b\n20,wk,T3,s20a\n999,wk,T4,\n",
    "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n"
    + "".join(f"s801a,{30.2+i*0.001:.6f},-97.74,{i}\n" for i in range(50))  # straight line -> simplifies to 2 pts
    + "s801b,30.3,-97.7,2\ns801b,30.2,-97.7,1\ns801b,30.25,-97.65,3\n"      # out of order
    + "s20a,30.1,-97.8,1\ns20a,30.11,-97.81,2\n",
}
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as z:
    for n, c in files.items():
        z.writestr(n, "﻿" + c if n == "routes.txt" else c)  # BOM on one file

with tempfile.TemporaryDirectory() as d:
    gz = os.path.join(d, "g.zip")
    open(gz, "wb").write(buf.getvalue())
    subprocess.check_call([sys.executable, os.path.join(ROOT, "scripts", "build_data.py"), "--gtfs", gz])

routes = json.load(open(os.path.join(ROOT, "data", "routes.json")))
trips = json.load(open(os.path.join(ROOT, "data", "trips.json")))
assert set(routes) == {"801", "20"}, routes.keys()          # route with no shapes dropped
assert routes["801"]["color"] == "E31837" and routes["801"]["name"] == "801"
assert len(routes["801"]["shapes"]["s801a"]) == 2, routes["801"]["shapes"]["s801a"]  # simplified
assert routes["801"]["shapes"]["s801b"][0] == [30.2, -97.7]                          # sorted by sequence
assert trips == {"T1": "s801a", "T2": "s801b", "T3": "s20a"}, trips
print("build_data.py tests passed")
