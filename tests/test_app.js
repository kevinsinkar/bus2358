const assert = require("assert");
const { findVehicle, classify, chooseShapes } = require("../app.js");

const now = 1_800_000_000;
const feedCamel = { entity: [
  { id: "a", vehicle: { trip: { tripId: "T1", routeId: "801" }, position: { latitude: 30.27, longitude: -97.74, speed: 10 }, timestamp: String(now - 20), vehicle: { id: "2357" } } },
  { id: "b", vehicle: { trip: { tripId: "T2", routeId: "803" }, position: { latitude: 30.3, longitude: -97.7, bearing: 90 }, timestamp: now - 30, vehicle: { id: "2358" } } },
] };
const feedSnake = { entity: [
  { id: "x", vehicle: { trip: { trip_id: "T9", route_id: "20" }, position: { latitude: 30.1, longitude: -97.8 }, timestamp: { low: now - 5 }, vehicle: { label: "2358" } } },
] };

let v = findVehicle(feedCamel, "2358");
assert.strictEqual(v.routeId, "803"); assert.strictEqual(v.tripId, "T2"); assert.strictEqual(v.lat, 30.3);
assert.strictEqual(classify(v, now, 600).inService, true);

v = findVehicle(feedSnake, "2358");
assert.strictEqual(v.routeId, "20"); assert.strictEqual(v.tripId, "T9");
assert.strictEqual(classify(v, now, 600).inService, true);

// not present
assert.strictEqual(findVehicle(feedCamel, "9999"), null);
assert.deepStrictEqual(classify(null, now, 600), { inService: false, reason: "missing" });
// empty / odd feeds
assert.strictEqual(findVehicle({}, "2358"), null);
assert.strictEqual(findVehicle([], "2358"), null);
// stale
const stale = findVehicle({ entity: [{ vehicle: { position: { latitude: 1, longitude: 2 }, timestamp: now - 3600, vehicle: { id: "2358" } } }] }, "2358");
assert.strictEqual(classify(stale, now, 600).reason, "stale");
// 2358 must not match 23580 / 12358
assert.strictEqual(findVehicle({ entity: [{ vehicle: { position: { latitude: 1, longitude: 2 }, vehicle: { id: "23580" } } }] }, "2358"), null);

// shapes
const info = { shapes: { s1: [[1, 1]], s2: [[2, 2]] } };
let c = chooseShapes(info, "s2");
assert.deepStrictEqual(c.primary, [[2, 2]]); assert.strictEqual(c.others.length, 1);
c = chooseShapes(info, "nope");
assert.strictEqual(c.primary, null); assert.strictEqual(c.others.length, 2);
assert.deepStrictEqual(chooseShapes(null, "s1"), { primary: null, others: [] });

console.log("app.js tests passed");
