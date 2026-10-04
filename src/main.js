import "./style.css";
import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { WORLDS, buildWorld } from "./worlds.js";
import { movePlayer, safeSettings } from "./collision.js";
const $ = (id) => document.getElementById(id),
  canvas = $("scene");
const defaults = {
  intensity: 25,
  chromatic: true,
  distortion: true,
  trails: false,
  reduceMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  quality: matchMedia("(pointer:coarse)").matches ? "low" : "balanced",
};
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = { getItem: () => null, setItem: () => {} };
}
const settings = safeSettings(storage, defaults);
settings.intensity = Math.max(0, Math.min(100, settings.intensity));
if (!["low", "balanced", "high"].includes(settings.quality))
  settings.quality = "balanced";
let renderer, composer, world, renderPass, visionPass, trailsPass, camera;
let exploring = false,
  uiHidden = false,
  selectedId = WORLDS[0].id,
  yaw = 0,
  pitch = 0,
  time = 0,
  last = 0,
  steps = 0,
  paused = false;
const keys = new Set(),
  stick = { x: 0, y: 0 },
  drag = { id: null, x: 0, y: 0, startX: 0, startY: 0, moved: false };
const isTouch =
  matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
let toastTimer,
  audioContext,
  audioGain,
  voices = [],
  audioEnabled = false;
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3200);
}
function save() {
  try {
    storage.setItem("liminal-atlas-settings", JSON.stringify(settings));
  } catch {
    /* Private mode and full storage must not prevent exploration. */
  }
}
function resetInput() {
  keys.clear();
  stick.x = stick.y = 0;
  $("joystick-knob").style.transform = "";
  drag.id = null;
}
function error(e) {
  $("error-detail").textContent =
    "WebGL 2に対応した新しいブラウザで、ハードウェアアクセラレーションを有効にしてお試しください。";
  $("error").hidden = false;
  $("loading").hidden = true;
  console.error(e);
}
function resetPosition() {
  if (!world) return;
  camera.position.set(world.spawn.x, world.spawn.y, world.spawn.z);
  yaw = world.spawn.yaw;
  pitch = 0;
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  resetInput();
}
function applyQuality() {
  if (!renderer) return;
  const ratio = { low: 1, balanced: 1.5, high: 2 }[settings.quality];
  const dpr = Math.min(
    devicePixelRatio || 1,
    ratio,
    Math.sqrt(2900000 / (innerWidth * innerHeight)),
  );
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
function syncEffects() {
  if (!visionPass) return;
  const amount = settings.intensity / 100;
  visionPass.uniforms.amount.value = amount;
  visionPass.uniforms.chromatic.value = settings.chromatic ? 1 : 0;
  visionPass.uniforms.distortion.value =
    settings.distortion && !settings.reduceMotion ? 1 : 0;
  trailsPass.enabled = amount > 0 && settings.trails && !settings.reduceMotion;
  trailsPass.uniforms.damp.value = 0.68 + amount * 0.18;
  $("intensity-output").value = `${settings.intensity}%`;
}
function switchWorld(id) {
  if (world?.meta.id === id) return;
  resetInput();
  const next = buildWorld(id),
    old = world;
  world = next;
  selectedId = next.meta.id;
  renderPass.scene = next.scene;
  resetPosition();
  if (old) old.dispose();
  renderer.renderLists.dispose();
  if (trailsPass) {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(trailsPass.textureOld);
    renderer.clear();
    renderer.setRenderTarget(trailsPass.textureComp);
    renderer.clear();
    renderer.setRenderTarget(previous);
  }
  const m = world.meta;
  document.documentElement.style.setProperty("--accent", m.color);
  $("selected-number").textContent = m.number;
  $("selected-title").textContent = m.name;
  $("selected-tagline").textContent = m.tagline;
  $("scene-en").textContent = m.en;
  $("scene-caption").textContent = m.caption;
  $("hud-number").textContent = `WORLD ${m.number} / ${m.genre}`;
  $("hud-title").textContent = m.name;
  $("hud-description").textContent = m.description;
  document
    .querySelectorAll(".world-card")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.world === id)),
    );
  tuneAudio();
}
function enterWorld() {
  exploring = true;
  document.body.classList.add("exploring");
  $("atlas").hidden = true;
  $("hud").hidden = false;
  $("worlds-open").hidden = false;
  $("hide-ui").hidden = false;
  $("touch-controls").hidden = !isTouch;
  $("entry-hint").textContent = isTouch
    ? "左のパッドで歩く · 右側をスワイプして見回す"
    : "画面をクリックして視点操作 / ドラッグでも見回せます";
  resetPosition();
  canvas.focus({ preventScroll: true });
}
function showAtlas() {
  if (document.pointerLockElement) document.exitPointerLock();
  exploring = false;
  setUIHidden(false);
  resetInput();
  $("atlas").hidden = false;
  $("hud").hidden = true;
  $("touch-controls").hidden = true;
  $("worlds-open").hidden = true;
  $("hide-ui").hidden = true;
  document.body.classList.remove("exploring");
  document
    .querySelector(`[data-world="${selectedId}"]`)
    ?.focus({ preventScroll: true });
}
function setUIHidden(value) {
  uiHidden = value;
  document.body.classList.toggle("ui-hidden", value);
  $("restore-ui").hidden = !value;
}
function rotate(dx, dy) {
  yaw -= Math.max(-200, Math.min(200, dx)) * 0.0025;
  pitch = Math.max(
    -1.32,
    Math.min(1.32, pitch - Math.max(-200, Math.min(200, dy)) * 0.0021),
  );
}
function tuneAudio() {
  if (audioContext && world)
    voices.forEach((voice, i) =>
      voice.frequency.setTargetAtTime(
        world.meta.freq * (i ? 1.501 : 1),
        audioContext.currentTime,
        0.7,
      ),
    );
}
async function setAudio(enabled) {
  try {
    if (enabled) {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioGain = audioContext.createGain();
        audioGain.gain.value = 0;
        audioGain.connect(audioContext.destination);
        voices = [0, 1].map((i) => {
          const voice = audioContext.createOscillator();
          voice.type = i ? "sine" : "triangle";
          voice.connect(audioGain);
          voice.start();
          return voice;
        });
      }
      await audioContext.resume();
      tuneAudio();
      audioGain.gain.setTargetAtTime(0.016, audioContext.currentTime, 0.5);
    } else if (audioGain)
      audioGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.2);
    audioEnabled = enabled;
  } catch {
    audioEnabled = false;
    $("audio").checked = false;
    toast("このブラウザでは環境音を開始できませんでした。");
  }
}
function configureUI() {
  $("world-cards").innerHTML = WORLDS.map(
    (m) =>
      `<button class="world-card" data-world="${m.id}" aria-pressed="${m.id === selectedId}" aria-label="${m.name}をプレビュー"><span class="card-number">${m.number} /</span><span class="card-art" aria-hidden="true"></span><span class="card-title">${m.name}</span><span class="card-sub">${m.genre}</span></button>`,
  ).join("");
  $("world-cards").addEventListener("click", (e) => {
    const button = e.target.closest(".world-card");
    if (button) switchWorld(button.dataset.world);
  });
  $("enter").addEventListener("click", enterWorld);
  $("worlds-open").addEventListener("click", showAtlas);
  document.querySelector(".brand").addEventListener("click", (e) => {
    e.preventDefault();
    showAtlas();
  });
  $("reset-player").addEventListener("click", () => {
    resetPosition();
    toast("世界の入口に戻りました。");
  });
  $("hide-ui").addEventListener("click", () => setUIHidden(true));
  $("restore-ui").addEventListener("click", () => setUIHidden(false));
  $("settings-open").addEventListener("click", () => {
    if (document.pointerLockElement) document.exitPointerLock();
    resetInput();
    $("settings").showModal();
  });
  $("settings").addEventListener("close", resetInput);
  $("settings").addEventListener("click", (e) => {
    if (e.target === $("settings")) {
      const r = $("settings").getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        $("settings").close();
    }
  });
  for (const [id, key] of [
    ["chromatic", "chromatic"],
    ["distortion", "distortion"],
    ["trails", "trails"],
    ["reduce-motion", "reduceMotion"],
  ]) {
    $(id).checked = settings[key];
    $(id).addEventListener("change", () => {
      settings[key] = $(id).checked;
      syncEffects();
      save();
    });
  }
  $("intensity").value = settings.intensity;
  $("intensity").addEventListener("input", () => {
    settings.intensity = Number($("intensity").value);
    syncEffects();
    save();
  });
  $("quality").value = settings.quality;
  $("quality").addEventListener("change", () => {
    settings.quality = $("quality").value;
    applyQuality();
    save();
  });
  $("audio").addEventListener("change", () => setAudio($("audio").checked));
}
function bindControls() {
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("settings").open) return;
      if (exploring) {
        if (uiHidden) setUIHidden(false);
        else showAtlas();
      }
      return;
    }
    if (
      !exploring ||
      $("settings").open ||
      /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)
    )
      return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ShiftLeft",
        "ShiftRight",
      ].includes(e.code)
    ) {
      e.preventDefault();
      keys.add(e.code);
    }
    if (e.code === "KeyH") setUIHidden(!uiHidden);
    if (e.code === "KeyR") {
      resetPosition();
      toast("世界の入口に戻りました。");
    }
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", resetInput);
  document.addEventListener("visibilitychange", () => {
    paused = document.hidden;
    resetInput();
    last = 0;
    if (audioContext) {
      if (paused) audioContext.suspend();
      else if (audioEnabled) audioContext.resume().catch(() => {});
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (!exploring || $("settings").open) return;
    canvas.focus({ preventScroll: true });
    drag.id = e.pointerId;
    drag.x = drag.startX = e.clientX;
    drag.y = drag.startY = e.clientY;
    drag.moved = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (
      !exploring ||
      $("settings").open ||
      document.pointerLockElement === canvas
    )
      return;
    if (drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (
      Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) >
      5
    )
      drag.moved = true;
    rotate(dx, dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (drag.id !== e.pointerId) return;
    const shouldLock =
      !drag.moved && e.pointerType === "mouse" && !document.pointerLockElement;
    drag.id = null;
    if (shouldLock && canvas.requestPointerLock) {
      try {
        const p = canvas.requestPointerLock();
        p?.catch(() => toast("ドラッグで見回せます。"));
      } catch {
        toast("ドラッグで見回せます。");
      }
    }
  });
  canvas.addEventListener("pointercancel", resetInput);
  document.addEventListener("mousemove", (e) => {
    if (
      document.pointerLockElement === canvas &&
      exploring &&
      !$("settings").open
    )
      rotate(e.movementX, e.movementY);
  });
  document.addEventListener("pointerlockchange", () => {
    resetInput();
    $("entry-hint").hidden = document.pointerLockElement === canvas;
  });
  const pad = $("joystick");
  let stickId = null;
  function updateStick(e) {
    const rect = pad.getBoundingClientRect(),
      r = rect.width * 0.33;
    let x = e.clientX - (rect.left + rect.width / 2),
      y = e.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y);
    if (length > r) {
      x *= r / length;
      y *= r / length;
    }
    stick.x = x / r;
    stick.y = y / r;
    $("joystick-knob").style.transform = `translate(${x}px,${y}px)`;
  }
  pad.addEventListener("pointerdown", (e) => {
    if (!exploring) return;
    e.preventDefault();
    stickId = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    updateStick(e);
  });
  pad.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickId) updateStick(e);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    pad.addEventListener(type, () => {
      stickId = null;
      stick.x = stick.y = 0;
      $("joystick-knob").style.transform = "";
    });
  addEventListener("resize", applyQuality);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    paused = true;
    toast("描画が中断されました。ページを再読み込みしてください。");
  });
}
function animate(now) {
  requestAnimationFrame(animate);
  if (paused) return;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;
  time += dt;
  if (exploring && !$("settings").open) {
    let x =
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
      stick.x;
    let z =
      (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) +
      stick.y;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4.5 : 2.7;
    const dx = (x * Math.cos(yaw) + z * Math.sin(yaw)) * speed * dt,
      dz = (-x * Math.sin(yaw) + z * Math.cos(yaw)) * speed * dt;
    movePlayer(camera.position, dx, dz, world);
    steps += Math.hypot(dx, dz);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    camera.position.y = world.spawn.y;
  } else if (!exploring && !$("settings").open) {
    camera.position.set(
      world.spawn.x + 1.1,
      world.spawn.y + 0.15,
      world.spawn.z - 2,
    );
    camera.rotation.set(
      -0.015,
      -0.12 + (settings.reduceMotion ? 0 : Math.sin(time * 0.07) * 0.1),
      0,
      "YXZ",
    );
  }
  world.update(time, dt, !settings.reduceMotion);
  visionPass.uniforms.time.value = settings.reduceMotion ? 0 : time;
  $("coordinates").textContent =
    `${camera.position.x.toFixed(1)} / ${camera.position.z.toFixed(1)}`;
  renderer.info.reset();
  composer.render(dt);
}
try {
  configureUI();
  renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.info.autoReset = false;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  camera = new T.PerspectiveCamera(66, innerWidth / innerHeight, 0.08, 180);
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(new T.Scene(), camera);
  composer.addPass(renderPass);
  visionPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0 },
      amount: { value: 0.25 },
      chromatic: { value: 1 },
      distortion: { value: 1 },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `uniform sampler2D tDiffuse;uniform float time,amount,chromatic,distortion;varying vec2 vUv;void main(){vec2 p=vUv;vec2 centered=p-.5;float radius=dot(centered,centered);p+=centered*sin(time*.19+radius*6.)*.009*amount*distortion;vec2 shift=centered*.007*amount*chromatic;vec3 color=vec3(texture2D(tDiffuse,clamp(p+shift,0.001,.999)).r,texture2D(tDiffuse,clamp(p,0.001,.999)).g,texture2D(tDiffuse,clamp(p-shift,0.001,.999)).b);color*=1.-radius*.20*amount;gl_FragColor=vec4(color,1.);}`,
  });
  composer.addPass(visionPass);
  trailsPass = new AfterimagePass(0.8);
  trailsPass.enabled = false;
  composer.addPass(trailsPass);
  composer.addPass(new OutputPass());
  applyQuality();
  switchWorld(selectedId);
  syncEffects();
  bindControls();
  $("loading").hidden = true;
  requestAnimationFrame(animate);
  // Read-only diagnostics support deterministic QA without analytics or network requests.
  window.liminalAtlas = {
    snapshot: () => ({
      world: selectedId,
      exploring,
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      yaw,
      pitch,
      settings: { ...settings },
      render: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        memory: { ...renderer.info.memory },
      },
      resources: world.stats,
      steps,
    }),
  };
} catch (e) {
  error(e);
}
