import * as T from "three";
import { seededRandom } from "./collision.js";

export const WORLDS = [
  {
    id: "ryokan",
    number: "01",
    name: "彼岸の旅館",
    en: "THE INN BETWEEN",
    genre: "JAPANESE · UNCANNY",
    tagline: "廊下の先で、誰かがずっと待っている。",
    caption: "A ROOM WAS PREPARED. NO ONE ARRIVED.",
    description: "畳と障子の迷宮。風のない庭に、月だけが浮かぶ。",
    color: "#c8bc8b",
    freq: 55,
    seed: 103,
  },
  {
    id: "cathedral",
    number: "02",
    name: "星祈りの聖堂",
    en: "THE ASTRAL CHAPEL",
    genre: "WESTERN · MYSTICAL",
    tagline: "祈りは、まだ星になりきれない。",
    caption: "EVERY PRAYER IS AN UNFINISHED STAR.",
    description: "空に続く尖塔、浮かぶ祭壇。静けさだけが反響する。",
    color: "#b8a7ea",
    freq: 65.4,
    seed: 206,
  },
  {
    id: "courtyard",
    number: "03",
    name: "紅月の回廊",
    en: "THE VERMILION MOON",
    genre: "CHINESE · DREAMLIKE",
    tagline: "同じ中庭に、何度でも帰ってくる。",
    caption: "THE MOON HAS FORGOTTEN TO SET.",
    description: "赤い柱と翡翠の屋根。巨大な月が、無人の庭を見下ろす。",
    color: "#dfa39b",
    freq: 73.4,
    seed: 309,
  },
  {
    id: "ship",
    number: "04",
    name: "第零航宙船",
    en: "VESSEL ZERO",
    genre: "SPACECRAFT · ISOLATION",
    tagline: "航海は終わった。船は、まだ生きている。",
    caption: "NO CREW. NO DESTINATION. STILL AWAKE.",
    description: "星間を漂う観測船。窓の外には、知らない星雲がある。",
    color: "#91d8d9",
    freq: 46.2,
    seed: 412,
  },
  {
    id: "colony",
    number: "05",
    name: "眠らないコロニー",
    en: "THE BORROWED SUN",
    genre: "COLONY · LIMINAL",
    tagline: "ここでは、太陽にも帰る場所がない。",
    caption: "PERFECT WEATHER. ZERO RESIDENTS.",
    description: "人工の空に包まれた居住区。暮れない夕日が街を止める。",
    color: "#e2b9a1",
    freq: 82.4,
    seed: 515,
  },
  {
    id: "forest",
    number: "06",
    name: "巨樹の胎内",
    en: "THE DREAMING ROOT",
    genre: "NATURE · FANTASTICAL",
    tagline: "森のほうが、あなたを夢に見ている。",
    caption: "SOMETHING VAST IS DREAMING YOU.",
    description: "見上げるほどの菌傘と巨樹。光る胞子が記憶のように漂う。",
    color: "#94d8b5",
    freq: 41.2,
    seed: 618,
  },
];

const textureCache = new Map();
function texture(kind, color) {
  // A per-world cache avoids duplicate uploads and is emptied at every construction.
  const key = kind + color;
  if (textureCache.has(key)) return textureCache.get(key);
  const n = 128,
    data = new Uint8Array(n * n * 4),
    rng = seededRandom(42),
    c = new T.Color(color);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let v = 0.84 + rng() * 0.2;
      if (kind === "wood")
        v *= 0.82 + 0.18 * Math.sin(x * 0.9 + Math.sin(y * 0.03) * 2);
      if (kind === "paper") v *= x % 16 === 0 || y % 32 === 0 ? 0.63 : 1;
      if (kind === "tile") v *= x % 32 < 2 || y % 32 < 2 ? 0.45 : 1;
      if (kind === "bark")
        v *= 0.73 + 0.27 * Math.sin(x * 0.35 + Math.sin(y * 0.09) * 2);
      if (kind === "stone")
        v *= 0.87 + 0.13 * Math.sin(x * 0.22) * Math.cos(y * 0.18);
      const i = (y * n + x) * 4;
      data[i] = Math.min(255, c.r * v * 255);
      data[i + 1] = Math.min(255, c.g * v * 255);
      data[i + 2] = Math.min(255, c.b * v * 255);
      data[i + 3] = 255;
    }
  const map = new T.DataTexture(data, n, n);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  textureCache.set(key, map);
  return map;
}
function builder(meta) {
  textureCache.clear();
  const scene = new T.Scene(),
    group = new T.Group();
  scene.add(group);
  const colliders = [],
    animations = [],
    materials = new Set(),
    geometries = new Set(),
    batches = new Map();
  const world = {
    scene,
    group,
    colliders,
    animations,
    meta,
    bounds: { minX: -25, maxX: 25, minZ: -28, maxZ: 28 },
    spawn: { x: 0, y: 1.65, z: 20, yaw: 0 },
    disposed: false,
  };
  const boxGeo = new T.BoxGeometry(1, 1, 1);
  geometries.add(boxGeo);
  function mat(color, opts = {}) {
    const material = new T.MeshStandardMaterial({
      color,
      roughness: 0.8,
      ...opts,
    });
    materials.add(material);
    return material;
  }
  function tex(kind, color, repeat = [1, 1], opts = {}) {
    const map = texture(kind, color);
    map.repeat.set(...repeat);
    return mat("#ffffff", { map, ...opts });
  }
  function glow(color, intensity = 1) {
    const material = new T.MeshBasicMaterial({
      color: new T.Color(color).multiplyScalar(intensity),
    });
    materials.add(material);
    return material;
  }
  function collider(x, z, w, d) {
    colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }
  function box(x, y, z, w, h, d, m, solid = false) {
    let arr = batches.get(m);
    if (!arr) {
      arr = [];
      batches.set(m, arr);
    }
    arr.push([x, y, z, w, h, d]);
    if (solid && y - h / 2 < 2 && y + h / 2 > 0.3) collider(x, z, w, d);
  }
  function mesh(geo, m, pos = [0, 0, 0], solid = false, size = [1, 1]) {
    geometries.add(geo);
    materials.add(m);
    const o = new T.Mesh(geo, m);
    o.position.set(...pos);
    group.add(o);
    if (solid) collider(pos[0], pos[2], ...size);
    return o;
  }
  function instances(geo, material, transforms) {
    geometries.add(geo);
    materials.add(material);
    const mesh = new T.InstancedMesh(geo, material, transforms.length);
    const dummy = new T.Object3D();
    transforms.forEach((v, i) => {
      dummy.position.set(v[0], v[1], v[2]);
      dummy.scale.set(v[3], v[4], v[5]);
      dummy.rotation.set(v[6] || 0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  function cylinder(x, y, z, r, h, m, solid = false, rTop = r, segments = 12) {
    return mesh(
      new T.CylinderGeometry(rTop, r, h, segments),
      m,
      [x, y, z],
      solid,
      [r * 2, r * 2],
    );
  }
  function sphere(x, y, z, r, m, detail = 24) {
    return mesh(new T.SphereGeometry(r, detail, Math.round(detail * 0.65)), m, [
      x,
      y,
      z,
    ]);
  }
  function torus(x, y, z, r, tube, m, arc = Math.PI * 2) {
    return mesh(new T.TorusGeometry(r, tube, 7, 48, arc), m, [x, y, z]);
  }
  function light(color, intensity, pos, distance = 25) {
    const l = new T.PointLight(color, intensity, distance, 1.5);
    l.position.set(...pos);
    group.add(l);
    return l;
  }
  function environment(bg, fog, near, far, ambient = 1) {
    scene.background = new T.Color(bg);
    scene.fog = new T.Fog(fog, near, far);
    group.add(new T.HemisphereLight("#d9ede7", "#3a3028", ambient));
    const sun = new T.DirectionalLight("#fff1d9", 2);
    sun.position.set(-8, 16, 12);
    group.add(sun);
    return sun;
  }
  function stars(count, color, range = [70, 60, 100], yOffset = 5) {
    const rng = seededRandom(meta.seed),
      a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (rng() - 0.5) * range[0];
      a[i * 3 + 1] = rng() * range[1] + yOffset;
      a[i * 3 + 2] = (rng() - 0.5) * range[2];
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(a, 3));
    geometries.add(geo);
    const material = new T.PointsMaterial({
      color,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    materials.add(material);
    const obj = new T.Points(geo, material);
    group.add(obj);
    return obj;
  }
  function label(text, pos, width = 3, color = "#c4e5d7") {
    if (typeof document === "undefined") return;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#111c22";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.font = "36px monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 80);
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    const m = new T.MeshBasicMaterial({ map });
    materials.add(m);
    mesh(new T.PlaneGeometry(width, width / 4), m, pos);
  }
  function finish() {
    for (const [m, arr] of batches) {
      const inst = new T.InstancedMesh(boxGeo, m, arr.length),
        dummy = new T.Object3D();
      arr.forEach((v, i) => {
        dummy.position.set(v[0], v[1], v[2]);
        dummy.scale.set(v[3], v[4], v[5]);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.computeBoundingSphere();
      group.add(inst);
    }
    world.update = (t, dt, motion) =>
      animations.forEach((fn) => fn(t, dt, motion));
    world.dispose = () => {
      if (world.disposed) return;
      world.disposed = true;
      const textures = new Set();
      materials.forEach((m) => {
        Object.values(m).forEach((v) => {
          if (v?.isTexture) textures.add(v);
        });
        m.dispose();
      });
      textures.forEach((t) => t.dispose());
      geometries.forEach((g) => g.dispose());
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      scene.clear();
    };
    world.stats = {
      batches: batches.size,
      colliders: colliders.length,
      meshes: group.children.filter((o) => o.isMesh).length,
    };
    return world;
  }
  return {
    world,
    box,
    mat,
    tex,
    glow,
    mesh,
    instances,
    collider,
    cylinder,
    sphere,
    torus,
    light,
    environment,
    stars,
    label,
    finish,
  };
}
function ryokan(b) {
  const {
    world,
    box,
    mat,
    tex,
    glow,
    cylinder,
    sphere,
    light,
    environment,
    label,
  } = b;
  world.bounds = { minX: -12, maxX: 12, minZ: -25, maxZ: 25 };
  world.spawn.z = 20;
  environment("#252b22", "#3c4030", 9, 53, 0.9);
  const wood = tex("wood", "#76603a", [3, 3]),
    dark = mat("#211e17"),
    tatami = tex("paper", "#899370", [3, 2]),
    paper = tex("paper", "#ddd3a8", [1, 1], {
      emissive: "#7b6440",
      emissiveIntensity: 0.2,
    }),
    trim = mat("#41362a"),
    warm = glow("#ffc986", 1.5);
  box(0, -0.2, 0, 25, 0.4, 52, wood);
  box(0, 3.8, 0, 25, 0.25, 52, dark);
  for (const x of [-12, 12]) box(x, 1.9, 0, 0.3, 3.8, 52, trim, true);
  box(0, 1.9, -25, 24, 3.8, 0.2, trim, true);
  box(0, 1.9, 25, 24, 3.8, 0.2, trim, true);
  for (let z = -20; z <= 20; z += 8) {
    for (const side of [-1, 1]) {
      const x = side * 7.3;
      box(x, 0.025, z, 8.4, 0.05, 7.4, tatami);
      box(side * 2.9, 1.85, z - 2.8, 0.14, 3.6, 2.1, paper, true);
      box(side * 2.9, 1.85, z + 2.8, 0.14, 3.6, 2.1, paper, true);
      box(x, 1.85, z - 4, 9, 3.6, 0.12, paper, true);
      box(side * 2.9, 3.15, z, 0.15, 1, 3.5, paper);
      box(side * 2.9, 0.25, z, 0.18, 0.14, 3.4, trim);
      box(x, 0.38, z, 2.2, 0.6, 1.3, dark, true);
      sphere(x, 0.92, z, 0.26, warm, 12);
    }
    for (const x of [-2.9, 2.9]) {
      box(x, 1.85, z + 3.9, 0.17, 3.7, 0.17, trim, true);
      box(x, 3.55, z, 0.2, 0.25, 8, trim);
    }
    box(0, 3.5, z, 6.3, 0.2, 0.15, trim);
    box(0, 3.7, z, 0.07, 0.65, 0.07, dark);
    cylinder(0, 3.1, z, 0.33, 0.6, warm, false, 0.33, 8);
    box(0, 2.8, z, 0.7, 0.06, 0.7, trim);
  }
  box(0, 1.4, -24.8, 4.5, 2.8, 0.1, paper);
  label("ROOM 000", [0, 2.7, -24.68], 2.3, "#d6c795");
  sphere(0, 2, -24.5, 0.58, glow("#b23629"));
  light("#ffc886", 14, [0, 2.8, 10], 22);
  light("#dabc82", 11, [0, 2.8, -13], 24);
}
function cathedral(b) {
  const {
    world,
    box,
    mat,
    tex,
    glow,
    cylinder,
    sphere,
    torus,
    light,
    environment,
    stars,
  } = b;
  world.bounds = { minX: -18, maxX: 18, minZ: -38, maxZ: 30 };
  world.spawn.z = 24;
  environment("#101125", "#1b1837", 13, 78, 0.65);
  const stone = tex("stone", "#777690", [2, 5]),
    floor = tex("tile", "#4c4969", [12, 24], {
      roughness: 0.35,
      metalness: 0.35,
    }),
    dark = mat("#1d2239"),
    silver = mat("#9ba4b4", { metalness: 0.5, roughness: 0.3 }),
    violet = glow("#c9b2ff", 1.6),
    blue = glow("#77cfe5", 1.3);
  box(0, -0.2, -4, 37, 0.4, 70, floor);
  box(-18, 11, -4, 0.5, 22, 70, stone, true);
  box(18, 11, -4, 0.5, 22, 70, stone, true);
  box(0, 11, -38, 36, 22, 0.5, dark, true);
  for (let z = -32; z <= 24; z += 8) {
    for (const x of [-11, -6, 6, 11]) {
      cylinder(x, 5, z, 0.46, 10, stone, true, 0.38);
      box(x, 0.25, z, 1.3, 0.5, 1.3, stone, true);
    }
    torus(0, 10, z, 6, 0.22, stone, Math.PI);
    for (const side of [-1, 1]) {
      box(side * 17.72, 8, z, 0.08, 10, 2, blue);
      for (let j = 0; j < 3; j++) {
        box(side * 10, 0.55, z + j * 1.5, 5, 1, 0.25, dark, true);
        box(side * 10, 0.35, z + j * 1.5 + 0.35, 5, 0.25, 0.7, dark, true);
      }
    }
  }
  for (let i = 0; i < 3; i++)
    torus(0, 9, -36.9, 5.2 - i * 0.5, 0.09, i % 2 ? violet : silver);
  const glass = sphere(
    0,
    9,
    -37,
    3.9,
    mat("#342e6f", { emissive: "#706fcb", emissiveIntensity: 0.45 }),
    32,
  );
  glass.scale.z = 0.1;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    box(
      Math.cos(a) * 2.8,
      9 + Math.sin(a) * 2.8,
      -36.5,
      0.08,
      0.08,
      0.15,
      violet,
    );
  }
  const halo = torus(0, 8, -23, 3, 0.08, violet);
  halo.rotation.x = 0.12;
  const moon = sphere(
    0,
    8,
    -23,
    1.55,
    mat("#8a8abc", {
      emissive: "#4b4472",
      emissiveIntensity: 0.25,
      roughness: 0.5,
    }),
  );
  world.animations.push((t, dt, m) => {
    halo.rotation.y = m ? Math.sin(t * 0.11) * 0.28 : 0;
    moon.position.y = 8 + (m ? Math.sin(t * 0.25) * 0.12 : 0);
  });
  box(0, 0.5, -29, 5, 1, 2, silver, true);
  box(0, 0.06, -4, 3, 0.1, 55, mat("#35264d"));
  stars(500, "#b3c8ff", [34, 20, 66], 3);
  light("#9e8cff", 50, [0, 7, -20], 42);
  light("#718fb5", 20, [0, 4, 14], 30);
}
function courtyard(b) {
  const {
    world,
    box,
    mat,
    tex,
    glow,
    cylinder,
    sphere,
    light,
    environment,
    stars,
  } = b;
  world.bounds = { minX: -24, maxX: 24, minZ: -26, maxZ: 26 };
  world.spawn.z = 20;
  environment("#291c2b", "#513335", 12, 71, 0.95);
  const stone = tex("tile", "#8b8a7d", [16, 18]),
    red = mat("#711e22"),
    jade = tex("tile", "#2f6963", [6, 2]),
    dark = mat("#222d30"),
    gold = mat("#b19458", { metalness: 0.55, roughness: 0.45 }),
    lantern = glow("#ffa267", 1.3);
  box(0, -0.2, 0, 50, 0.4, 55, stone);
  box(0, 2.4, -26, 50, 4.8, 0.3, dark, true);
  for (const x of [-24, 24]) box(x, 2.4, 0, 0.3, 4.8, 54, dark, true);
  for (let z = -20; z <= 20; z += 8)
    for (const x of [-12, 12]) {
      cylinder(x, 2.4, z, 0.28, 4.8, red, true);
      cylinder(x, 0.2, z, 0.47, 0.4, gold, true);
      box(x, 4.8, z, 4.5, 0.25, 8, red);
      for (let j = 0; j < 5; j++)
        box(x, 5.15 + j * 0.18, z, 6.2 - j * 0.95, 0.16, 8.1, jade);
      sphere(x, 3.7, z, 0.38, lantern, 12);
      box(x, 4.25, z, 0.04, 0.4, 0.04, gold);
    }
  for (const z of [-18, 12]) {
    for (const x of [-7, 7]) cylinder(x, 3, z, 0.45, 6, red, true);
    box(0, 5.6, z, 15, 0.45, 1, red);
    box(0, 5.55, z, 5, 1, 0.4, gold);
    for (let j = 0; j < 7; j++)
      box(0, 6 + j * 0.2, z, 17 - j * 0.9, 0.18, 6 - j * 0.7, jade);
    for (const x of [-8.6, 8.6]) box(x, 6.15, z, 0.55, 0.5, 6, jade);
  }
  for (const x of [-6, 6]) {
    cylinder(x, 0.9, -4, 0.35, 1.8, stone, true);
    sphere(x, 2, -4, 0.35, lantern, 12);
    box(x, 2.5, -4, 1.1, 0.14, 1.1, jade);
  }
  // A stone island and a shallow, inaccessible reflecting basin keep walking level.
  box(0, 0.15, -5, 6, 0.3, 6, dark, true);
  box(
    0,
    0.32,
    -5,
    5.5,
    0.02,
    5.5,
    mat("#263f47", { metalness: 0.65, roughness: 0.15 }),
  );
  cylinder(0, 1.3, -5, 0.7, 2, stone, true, 0.3);
  sphere(0, 13, -35, 7, glow("#d27e70", 0.9), 48);
  stars(160, "#ffbeb2", [70, 30, 70], 7);
  light("#ec8461", 30, [0, 6, 7], 30);
  light("#d98b71", 23, [0, 4, -16], 26);
}
function ship(b) {
  const {
    world,
    box,
    mat,
    tex,
    glow,
    mesh,
    instances,
    collider,
    cylinder,
    sphere,
    torus,
    light,
    environment,
    stars,
    label,
  } = b;
  world.bounds = { minX: -6.9, maxX: 6.9, minZ: -31, maxZ: 30 };
  world.spawn.z = 24;
  environment("#020913", "#092232", 12, 75, 0.7);
  const steel = tex("tile", "#637480", [8, 20], {
      metalness: 0.45,
      roughness: 0.4,
    }),
    dark = mat("#14252e", { metalness: 0.65, roughness: 0.35 }),
    frame = mat("#86969b", { metalness: 0.7, roughness: 0.35 }),
    cyan = glow("#75efff", 1.6),
    amber = glow("#d6ae56");
  box(0, -0.18, 0, 14, 0.36, 64, steel);
  box(0, 7, 0, 14, 0.3, 64, dark);
  box(0, 3.5, -31, 14, 7, 0.35, dark, true);
  box(0, 3.5, 30, 14, 7, 0.35, dark, true);
  for (const x of [-7, 7]) {
    box(x, 0.6, 0, 0.2, 1.2, 62, dark, true);
    box(x, 6, 0, 0.2, 2, 62, dark, true);
    box(
      x,
      3.3,
      0,
      0.06,
      4.1,
      62,
      mat("#0b293b", {
        transparent: true,
        opacity: 0.12,
        metalness: 0.4,
        roughness: 0.1,
      }),
      true,
    );
  }
  for (let z = -28; z <= 28; z += 7) {
    for (const x of [-6.8, 6.8]) {
      box(x, 3.4, z, 0.4, 6.8, 0.4, frame, true);
      box(x * 0.78, 6.7, z, 3, 0.5, 0.4, frame);
      box(x * 0.68, 3.8, z, 1.5, 0.08, 0.7, cyan);
      box(x * 0.65, 0.8, z, 1.4, 1.6, 1.5, dark, true);
      box(x * 0.65, 1.62, z, 1.35, 0.03, 1.4, cyan);
    }
    box(0, 6.75, z, 9, 0.25, 0.35, frame);
    box(0, 6.55, z, 3, 0.06, 0.15, cyan);
  }
  for (const x of [-2.7, 2.7]) box(x, 0.025, 0, 0.035, 0.04, 62, amber);
  for (let z = -27; z <= 25; z += 4) box(0, 0.025, z, 0.06, 0.03, 1.1, cyan);
  const core = torus(0, 3.6, -25, 2, 0.12, cyan);
  const inner = torus(0, 3.6, -25, 1.35, 0.07, amber);
  sphere(0, 3.6, -25, 0.7, glow("#9ddaff", 2));
  cylinder(0, 0.8, -25, 2.7, 1.6, dark, true, 2.3);
  world.animations.push((t, dt, m) => {
    core.rotation.y = m ? t * 0.16 : 0;
    inner.rotation.x = m ? t * 0.12 : 0;
  });
  const planet = sphere(
    17,
    5,
    -16,
    7,
    mat("#302958", { emissive: "#373773", emissiveIntensity: 0.65 }),
    48,
  );
  const ring = torus(17, 5, -16, 9, 0.04, glow("#9499e2"));
  ring.rotation.x = 0.8;
  stars(800, "#d3e6ff", [130, 80, 150], -32);
  label("VESSEL 0 / OBSERVATORY", [0, 5.9, -30.75], 6);
  light("#75d5f2", 40, [0, 4, -23], 32);
  light("#759cc5", 18, [0, 4, 14], 29);
}
function colony(b) {
  const {
    world,
    box,
    mat,
    tex,
    glow,
    sphere,
    mesh,
    cylinder,
    torus,
    light,
    environment,
    label,
  } = b;
  world.bounds = { minX: -27, maxX: 27, minZ: -36, maxZ: 32 };
  world.spawn.z = 27;
  environment("#817b77", "#a59185", 22, 120, 1.3);
  const wall = tex("stone", "#bbc4b9", [2, 4], { roughness: 0.65 }),
    floor = tex("tile", "#829191", [18, 24]),
    glass = mat("#45666d", { metalness: 0.5, roughness: 0.25 }),
    dark = mat("#596966"),
    mint = glow("#bce2d4", 1.1),
    grass = mat("#7c9d80");
  box(0, -0.2, 0, 56, 0.4, 74, floor);
  for (const x of [-5, 5]) box(x, 0.025, 0, 0.04, 0.04, 71, mint);
  for (let z = -28; z <= 24; z += 13)
    for (const side of [-1, 1]) {
      const x = side * 15,
        h = 12 + (Math.abs(z) % 3) * 2;
      box(x, h / 2, z, 13, h, 9, wall, true);
      box(x, h + 0.1, z, 13.5, 0.25, 9.5, dark);
      for (let y = 2; y < h; y += 3)
        for (let dz = -2; dz <= 2; dz += 2) {
          box(side * 8.45, y, z + dz, 0.05, 1.5, 1.2, glass);
          box(side * 8.4, y - 0.8, z + dz, 0.13, 0.1, 1.6, mint);
        }
      box(side * 7.5, 0.9, z, 1.5, 1.8, 2, dark, true);
      box(side * 7.49, 1.9, z, 1.5, 0.12, 2, mint);
    }
  for (const z of [-16, 10]) {
    box(0, 8.5, z, 17, 0.6, 3, wall);
    for (const x of [-7, 7]) box(x, 4.2, z, 0.55, 8.4, 0.55, wall, true);
    box(0, 9.1, z - 1.4, 17, 0.9, 0.12, glass);
  }
  for (const z of [-24, -3, 18])
    for (const x of [-4, 4]) {
      box(x, 0.25, z, 1.6, 0.5, 2.6, dark, true);
      box(x, 0.53, z, 1.4, 0.06, 2.4, grass);
      cylinder(x, 1.5, z, 0.08, 2, dark, true);
      sphere(x, 3, z, 1.05, grass, 12);
    }
  const dome = mesh(
    new T.IcosahedronGeometry(76, 3),
    new T.MeshBasicMaterial({
      color: "#b4c8be",
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    }),
    [0, -7, -2],
  );
  sphere(-24, 22, -58, 9, glow("#eac4a0"));
  sphere(
    -24,
    22,
    -57.8,
    8.1,
    mat("#625e68", { emissive: "#302f41", emissiveIntensity: 0.8 }),
  );
  box(0, 3, -36, 11, 6, 0.4, wall, true);
  label("RESIDENTIAL / 00", [0, 4, -35.7], 6, "#dde8d8");
  label("ALL SYSTEMS NORMAL", [0, 2.5, -35.68], 5, "#9ecec0");
  light("#bddece", 8, [0, 4, 0], 30);
}
function forest(b) {
  const {
    world,
    box,
    mat,
    tex,
    glow,
    mesh,
    instances,
    collider,
    cylinder,
    sphere,
    torus,
    light,
    environment,
    stars,
  } = b;
  world.bounds = { minX: -27, maxX: 27, minZ: -36, maxZ: 30 };
  world.spawn.z = 24;
  environment("#072324", "#174042", 8, 70, 0.8);
  const ground = tex("stone", "#42605b", [12, 14]),
    bark = tex("bark", "#35494b", [2, 8]),
    rootmat = mat("#405951"),
    cyan = glow("#8ef5c8", 1.4),
    purple = glow("#b89adf", 1.2),
    rng = seededRandom(618);
  box(0, -0.3, 0, 57, 0.6, 75, ground);
  const trunks = [],
    crowns = [],
    stems = [],
    caps = [[], []],
    rims = [[], []];
  cyan.side = purple.side = T.DoubleSide;
  for (let i = 0; i < 30; i++) {
    let x = (rng() - 0.5) * 50,
      z = (rng() - 0.5) * 65;
    if (Math.abs(x) < 3.5) x += x < 0 ? -5 : 5;
    const r = 0.75 + rng() * 1.1,
      h = 19 + rng() * 22,
      crown = 6 + rng() * 6;
    trunks.push([x, h / 2, z, r, h, r]);
    crowns.push([x, h, z, crown, crown * 0.6, crown]);
    collider(x, z, r * 2, r * 2);
  }
  instances(new T.CylinderGeometry(0.5, 1, 1, 9), bark, trunks);
  instances(new T.SphereGeometry(1, 12, 8), mat("#24413e"), crowns);
  for (let i = 0; i < 22; i++) {
    let x = (rng() - 0.5) * 45,
      z = (rng() - 0.5) * 60;
    if (Math.abs(x) < 2.5) x += x < 0 ? -4 : 4;
    const h = 1.4 + rng() * 5,
      r = 0.8 + h * 0.3,
      stem = 0.15 + h * 0.04,
      k = i % 3 ? 0 : 1;
    stems.push([x, h / 2, z, stem, h, stem]);
    collider(x, z, stem * 2, stem * 2);
    caps[k].push([x, h, z, r, r * 0.35, r]);
    rims[k].push([x, h, z, r, r, r, Math.PI / 2]);
  }
  instances(new T.CylinderGeometry(0.5, 1, 1, 8), mat("#879698"), stems);
  for (let k = 0; k < 2; k++) {
    instances(
      new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      k ? purple : cyan,
      caps[k],
    );
    instances(
      new T.TorusGeometry(0.98, 0.02, 6, 32),
      k ? purple : cyan,
      rims[k],
    );
  }
  // Root arches frame a clear walking path; their overhead geometry cannot block it.
  for (const z of [-22, -9, 8]) {
    const arch = torus(0, 0, z, 7, 0.6, rootmat, Math.PI);
    cylinder(-7, 0.7, z, 0.75, 1.4, rootmat, true);
    cylinder(7, 0.7, z, 0.75, 1.4, rootmat, true);
  }
  const heart = sphere(
    0,
    6,
    -29,
    2.4,
    mat("#4f8c91", {
      emissive: "#297d72",
      emissiveIntensity: 0.8,
      roughness: 0.15,
      metalness: 0.4,
    }),
    32,
  );
  const orbit = torus(0, 6, -29, 3.9, 0.03, cyan);
  orbit.rotation.x = 0.4;
  world.animations.push((t, dt, m) => {
    heart.position.y = 6 + (m ? Math.sin(t * 0.2) * 0.25 : 0);
    orbit.rotation.y = m ? t * 0.08 : 0;
  });
  const spores = stars(450, "#bdfccf", [50, 15, 64], 0.4);
  world.animations.push((t, dt, m) => {
    spores.position.y = m ? Math.sin(t * 0.12) * 0.28 : 0;
  });
  light("#8dffce", 30, [0, 4, -20], 30);
  light("#5abdb3", 20, [0, 3, 14], 26);
}
export function buildWorld(id) {
  const meta = WORLDS.find((w) => w.id === id) || WORLDS[0],
    b = builder(meta);
  ({ ryokan, cathedral, courtyard, ship, colony, forest })[meta.id](b);
  return b.finish();
}
