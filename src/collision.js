export const PLAYER_RADIUS = 0.3;
export function isWalkable(x, z, world, radius = PLAYER_RADIUS) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const b = world.bounds;
  if (
    x < b.minX + radius ||
    x > b.maxX - radius ||
    z < b.minZ + radius ||
    z > b.maxZ - radius
  )
    return false;
  return !world.colliders.some(
    (c) =>
      x + radius > c.minX &&
      x - radius < c.maxX &&
      z + radius > c.minZ &&
      z - radius < c.maxZ,
  );
}
export function movePlayer(position, dx, dz, world) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(dx, dz) / (PLAYER_RADIUS * 0.6)),
  );
  for (let i = 0; i < steps; i++) {
    if (isWalkable(position.x + dx / steps, position.z, world))
      position.x += dx / steps;
    if (isWalkable(position.x, position.z + dz / steps, world))
      position.z += dz / steps;
  }
  return position;
}
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function safeSettings(storage, fallback) {
  try {
    const p = JSON.parse(storage.getItem("liminal-atlas-settings") || "{}");
    return {
      ...fallback,
      ...Object.fromEntries(
        Object.keys(fallback)
          .filter((k) => typeof p[k] === typeof fallback[k])
          .map((k) => [k, p[k]]),
      ),
    };
  } catch {
    return { ...fallback };
  }
}
