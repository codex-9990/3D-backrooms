import { test, expect } from "@playwright/test";
const ids = ["ryokan", "cathedral", "courtyard", "ship", "colony", "forest"];
async function ready(page) {
  page.on("console", (message) => {
    if (message.type() === "error")
      console.log("BROWSER ERROR:", message.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#error")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => !!window.liminalAtlas))
    .toBe(true);
}
test("all six worlds render, walk and reset with stable GPU resource counts", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await ready(page);
  await page.screenshot({ path: "test-results/atlas-desktop.png" });
  const firstPass = {};
  for (let round = 0; round < 2; round++)
    for (const id of ids) {
      await page.locator(`[data-world="${id}"]`).click();
      await page.locator("#enter").click();
      await page.waitForTimeout(180);
      let state = await page.evaluate(() => window.liminalAtlas.snapshot());
      expect(state.world).toBe(id);
      expect(state.exploring).toBe(true);
      expect(state.render.memory.geometries).toBeGreaterThan(0);
      const before = state.position.z;
      await page.keyboard.down("w");
      await page.waitForTimeout(420);
      await page.keyboard.up("w");
      state = await page.evaluate(() => window.liminalAtlas.snapshot());
      expect(state.position.z).toBeLessThan(before - 0.12);
      await page.locator("#reset-player").click();
      if (round === 0) {
        firstPass[id] = state.render.memory;
        await page.screenshot({ path: `test-results/world-${id}.png` });
      } else {
        expect(state.render.memory.geometries).toBeLessThanOrEqual(
          firstPass[id].geometries + 2,
        );
        expect(state.render.memory.textures).toBeLessThanOrEqual(
          firstPass[id].textures + 1,
        );
      }
      await page.locator("#worlds-open").click();
    }
  expect(errors).toEqual([]);
});
test("canvas receives mouse input; settings, UI hide, keyboard escape and storage work", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#enter").click();
  expect(
    await page.evaluate(
      () => document.elementFromPoint(innerWidth * 0.6, innerHeight * 0.5).id,
    ),
  ).toBe("scene");
  const start = await page.evaluate(() => window.liminalAtlas.snapshot());
  await page.mouse.move(700, 420);
  await page.mouse.down();
  await page.mouse.move(820, 460, { steps: 8 });
  await page.mouse.up();
  let state = await page.evaluate(() => window.liminalAtlas.snapshot());
  expect(Math.abs(state.yaw - start.yaw)).toBeGreaterThan(0.1);
  await page.locator("#hide-ui").click();
  await expect(page.locator("#restore-ui")).toBeVisible();
  await page.locator("#restore-ui").click();
  await expect(page.locator("#header")).toBeVisible();
  await page.locator("#settings-open").click();
  await page.locator("#intensity").press("End");
  await page.locator("#trails").check();
  await page.locator("#reduce-motion").check();
  await page.locator("#quality").selectOption("low");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).not.toBeVisible();
  await expect(page.locator("#hud")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#atlas")).toBeVisible();
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  state = await page.evaluate(() => window.liminalAtlas.snapshot());
  expect(state.settings.intensity).toBe(100);
  expect(state.settings.reduceMotion).toBe(true);
  expect(state.settings.quality).toBe("low");
});
test("mobile layout and simultaneous touch movement/look stay interactive", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "test-results/atlas-mobile.png" });
  await page.locator('[data-world="forest"]').tap();
  await page.locator("#enter").tap();
  await expect(page.locator("#joystick")).toBeVisible();
  expect(
    await page.evaluate(() => document.elementFromPoint(300, 420).id),
  ).toBe("scene");
  let state = await page.evaluate(() => window.liminalAtlas.snapshot());
  const start = state.position.z;
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 81, y: 698, id: 1 },
      { x: 285, y: 420, id: 2 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 81, y: 662, id: 1 },
      { x: 340, y: 450, id: 2 },
    ],
  });
  await page.waitForTimeout(500);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  state = await page.evaluate(() => window.liminalAtlas.snapshot());
  expect(state.position.z).toBeLessThan(start - 0.1);
  expect(Math.abs(state.yaw)).toBeGreaterThan(0.05);
  await page.screenshot({ path: "test-results/forest-mobile.png" });
  await page.locator("#worlds-open").tap();
  await expect(page.locator("#atlas")).toBeVisible();
  await context.close();
});
test("blocked localStorage and reduced-motion preference do not break startup", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    }),
  );
  const page = await context.newPage();
  await ready(page);
  const state = await page.evaluate(() => window.liminalAtlas.snapshot());
  expect(state.settings.reduceMotion).toBe(true);
  await page.locator("#enter").click();
  await expect(page.locator("#hud")).toBeVisible();
  await context.close();
});
