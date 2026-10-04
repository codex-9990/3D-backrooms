import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { WORLDS, buildWorld } from "../src/worlds.js";
import {
  isWalkable,
  movePlayer,
  seededRandom,
  safeSettings,
} from "../src/collision.js";

const worldIds = [
  "ryokan",
  "cathedral",
  "courtyard",
  "ship",
  "colony",
  "forest",
  "dreamMall",
  "poolrooms",
  "parallel",
];
const pastelIds = worldIds.slice(6);

function geometryFingerprint(world) {
  const hash = createHash("sha256");
  const addArray = (array) => {
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  };
  world.group.traverse((object) => {
    if (!object.geometry) return;
    hash.update(
      JSON.stringify([
        object.type,
        object.position.toArray(),
        object.quaternion.toArray(),
        object.scale.toArray(),
        object.count ?? 1,
      ]),
    );
    for (const [name, attribute] of Object.entries(object.geometry.attributes)) {
      hash.update(name);
      addArray(attribute.array);
    }
    if (object.geometry.index) addArray(object.geometry.index.array);
    if (object.instanceMatrix) addArray(object.instanceMatrix.array);
  });
  return hash.digest("hex");
}

function reachableFloor(world) {
  const step = 0.5;
  const queue = [[0, 0]];
  const visited = new Set(["0,0"]);
  const blocked = new Set();
  const extent = {
    minX: world.spawn.x,
    maxX: world.spawn.x,
    minZ: world.spawn.z,
    maxZ: world.spawn.z,
  };
  for (let head = 0; head < queue.length; head++) {
    const [column, row] = queue[head];
    const x = world.spawn.x + column * step;
    const z = world.spawn.z + row * step;
    extent.minX = Math.min(extent.minX, x);
    extent.maxX = Math.max(extent.maxX, x);
    extent.minZ = Math.min(extent.minZ, z);
    extent.maxZ = Math.max(extent.maxZ, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${column + dx},${row + dz}`;
      if (visited.has(key) || blocked.has(key)) continue;
      const nextX = x + dx * step;
      const nextZ = z + dz * step;
      if (!isWalkable(nextX, nextZ, world)) {
        blocked.add(key);
        continue;
      }
      // Validate the whole edge with actual player movement, so thin walls
      // between grid samples cannot create a false navigable route.
      const position = { x, z };
      movePlayer(position, dx * step, dz * step, world);
      if (Math.hypot(position.x - nextX, position.z - nextZ) > 1e-6) continue;
      visited.add(key);
      queue.push([column + dx, row + dz]);
    }
  }
  return { ...extent, area: visited.size * step * step };
}

function followRoute(world, waypoints) {
  const position = { ...world.spawn };
  for (const [x, z] of waypoints) {
    movePlayer(position, x - position.x, z - position.z, world);
    assert.ok(
      Math.hypot(position.x - x, position.z - z) < 1e-6,
      `${world.meta.id}: route reaches (${x}, ${z}), got (${position.x}, ${position.z})`,
    );
  }
}

test("nine themes preserve the original collection and generate distinct deterministic geometry", () => {
  assert.deepEqual(
    WORLDS.map((w) => w.id),
    worldIds,
  );
  assert.equal(new Set(WORLDS.map((w) => w.id)).size, 9);
  assert.deepEqual(
    WORLDS.map((w) => w.number),
    worldIds.map((_, i) => String(i + 1).padStart(2, "0")),
  );
  const fingerprints = new Set();
  for (const meta of WORLDS) {
    const w = buildWorld(meta.id),
      second = buildWorld(meta.id);
    assert.deepEqual(w.colliders, second.colliders);
    assert.deepEqual(w.stats, second.stats);
    const fingerprint = geometryFingerprint(w);
    assert.equal(
      fingerprint,
      geometryFingerprint(second),
      `${meta.id} geometry is repeatable`,
    );
    fingerprints.add(fingerprint);
    assert.ok(w.stats.batches < 15);
    assert.ok(w.stats.meshes < 180, `${meta.id} mesh budget`);
    w.dispose();
    w.dispose();
    second.dispose();
    assert.equal(w.disposed, true);
  }
  assert.equal(fingerprints.size, 9, "each world has its own architecture");
});

for (const id of pastelIds)
  test(`${id}: finite geometry, instancing, triangle budget and reduced motion`, () => {
    const world = buildWorld(id);
    let triangles = 0;
    let instances = 0;
    let pointLights = 0;
    world.group.traverse((object) => {
      if (object.isPointLight) pointLights++;
      const geometry = object.geometry;
      if (!geometry) return;
      for (const attribute of Object.values(geometry.attributes))
        assert.ok(attribute.array.every(Number.isFinite), `${id} finite vertices`);
      if (object.isInstancedMesh) {
        assert.ok(object.instanceMatrix.array.every(Number.isFinite));
        instances += object.count;
      }
      if (object.isMesh)
        triangles +=
          ((geometry.index?.count ?? geometry.attributes.position.count) / 3) *
          (object.isInstancedMesh ? object.count : 1);
    });
    assert.ok(instances > 50, `${id} repeated architecture is instanced`);
    assert.ok(triangles > 0 && triangles < 30000, `${id}: ${triangles} triangles`);
    assert.ok(world.stats.meshes < 80, `${id} draw-object budget`);
    assert.ok(pointLights <= 4, `${id} point-light budget`);
    world.update(1, 1 / 60, false);
    const still = geometryFingerprint(world);
    world.update(30, 1 / 60, false);
    assert.equal(geometryFingerprint(world), still, "reduced motion stops animated geometry");
    world.dispose();
  });

for (const id of pastelIds)
  test(`${id}: the entrance connects to the breadth and depth of the world`, () => {
    const world = buildWorld(id);
    const reached = reachableFloor(world);
    const width = world.bounds.maxX - world.bounds.minX;
    const depth = world.bounds.maxZ - world.bounds.minZ;
    assert.ok(reached.maxX - reached.minX > width * 0.75, "both sides are reachable");
    assert.ok(reached.maxZ - reached.minZ > depth * 0.75, "the distant rooms are reachable");
    assert.ok(reached.area > 150, "the entrance opens onto a substantial explorable floor");
    world.dispose();
  });

test("dream mall fountain and escalators block entry while both atrium routes stay open", () => {
  const world = buildWorld("dreamMall");
  for (const side of [-1, 1]) {
    assert.equal(isWalkable(side * 8.5, -22, world), false, "closed escalator");
    followRoute(world, [[side * 6, 25], [side * 6, -30], [0, -30]]);
  }
  assert.equal(isWalkable(0, -6, world), false, "fountain basin");
  const position = { ...world.spawn };
  movePlayer(position, 0, -55, world);
  assert.ok(position.z > -1.9, "walking forward stops at the fountain rim");
  world.dispose();
});

test("poolrooms keeps pools solid and its central and outside promenades connected", () => {
  const world = buildWorld("poolrooms");
  followRoute(world, [[0, -32]]);
  for (const side of [-1, 1]) {
    for (const z of [1, -20])
      assert.equal(isWalkable(side * 10, z, world), false, "pool water is inaccessible");
    followRoute(world, [[side * 17.5, 25], [side * 17.5, -32], [0, -32]]);
  }
  world.dispose();
});

test("parallel halls connect all three lanes through every cross-passage", () => {
  const world = buildWorld("parallel");
  for (const z of [12, -8, -28])
    for (const side of [-1, 1])
      followRoute(world, [[0, z], [side * 11.6, z], [side * 11.6, -44]]);
  assert.equal(isWalkable(5.8, 2, world), false, "lane divider remains solid");
  assert.equal(isWalkable(-5.8, -18, world), false, "lane divider remains solid");
  world.dispose();
});

test("pool water animates only when motion is enabled", () => {
  const world = buildWorld("poolrooms");
  const water = new Set();
  world.group.traverse((object) => {
    for (const material of [object.material].flat())
      if (material?.isShaderMaterial) water.add(material);
  });
  assert.equal(water.size, 1, "pools share one water shader");
  const [material] = water;
  world.update(10, 1 / 60, true);
  const animatedTime = material.uniforms.uTime.value;
  world.update(20, 1 / 60, true);
  assert.notEqual(material.uniforms.uTime.value, animatedTime);
  world.update(20, 1 / 60, false);
  const stillTime = material.uniforms.uTime.value;
  world.update(30, 1 / 60, false);
  assert.equal(material.uniforms.uTime.value, stillTime);
  world.dispose();
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

test("courtyard reflecting basin blocks walking at its rim height", () => {
  const world = buildWorld("courtyard");
  assert.equal(isWalkable(2, -5, world), false);
  assert.equal(isWalkable(-2, -5, world), false);
  world.dispose();
});
