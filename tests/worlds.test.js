import test from "node:test";
import assert from "node:assert/strict";
import { WORLDS, buildWorld } from "../src/worlds.js";
import {
  isWalkable,
  movePlayer,
  seededRandom,
  safeSettings,
} from "../src/collision.js";

test("six original themes have unique identity and deterministic geometry", () => {
  assert.equal(WORLDS.length, 6);
  assert.equal(new Set(WORLDS.map((w) => w.id)).size, 6);
  for (const meta of WORLDS) {
    const w = buildWorld(meta.id),
      second = buildWorld(meta.id);
    assert.deepEqual(w.colliders, second.colliders);
    assert.deepEqual(w.stats, second.stats);
    assert.ok(w.stats.batches < 15);
    assert.ok(w.stats.meshes < 180, `${meta.id} mesh budget`);
    w.dispose();
    w.dispose();
    second.dispose();
    assert.equal(w.disposed, true);
  }
});
for (const meta of WORLDS)
  test(`${meta.id}: spawn, free initial path, bounds, collision and GPU disposal`, () => {
    const w = buildWorld(meta.id);
    assert.ok(isWalkable(w.spawn.x, w.spawn.z, w), "valid spawn");
    const p = { ...w.spawn };
    movePlayer(p, 0, -2, w);
    assert.ok(p.z < w.spawn.z - 1.9, "initial forward route is open");
    assert.equal(isWalkable(NaN, 0, w), false);
    assert.equal(isWalkable(w.bounds.maxX + 1, 0, w), false);
    movePlayer(p, 1000, 1000, w);
    assert.ok(isWalkable(p.x, p.z, w), "substeps avoid tunneling");
    for (const c of w.colliders)
      assert.equal(
        isWalkable((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, w),
        false,
      );
    let disposed = 0;
    w.group.traverse((o) => {
      o.geometry?.addEventListener("dispose", () => disposed++);
      if (o.material)
        for (const m of [o.material].flat())
          m.addEventListener("dispose", () => disposed++);
    });
    w.dispose();
    assert.ok(disposed > 0);
    assert.equal(w.scene.children.length, 0);
  });
test("movement slides along blockers without crossing them", () => {
  const world = {
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      colliders: [{ minX: 1, maxX: 2, minZ: -2, maxZ: 2 }],
    },
    p = { x: 0, z: 0 };
  movePlayer(p, 4, -1, world);
  assert.ok(p.x <= 0.7);
  assert.ok(p.z < -0.9);
});
test("settings recover from blocked storage, bad JSON and mistyped values", () => {
  const base = { quality: "low", intensity: 25, reduceMotion: false };
  assert.deepEqual(
    safeSettings(
      {
        getItem() {
          throw Error();
        },
      },
      base,
    ),
    base,
  );
  assert.deepEqual(safeSettings({ getItem: () => "{bad" }, base), base);
  assert.deepEqual(
    safeSettings(
      {
        getItem: () =>
          JSON.stringify({ intensity: "bad", reduceMotion: true, evil: 1 }),
      },
      base,
    ),
    { ...base, reduceMotion: true },
  );
});
test("procedural random generator repeats", () => {
  const a = seededRandom(23),
    b = seededRandom(23);
  assert.deepEqual(
    Array.from({ length: 20 }, a),
    Array.from({ length: 20 }, b),
  );
});
