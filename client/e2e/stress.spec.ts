import { expect, test } from "@playwright/test";
import { centreOf, drag, flowPosition } from "./helpers";

// The stress page in the real browser: a generated 500-node diagram,
// visible-only rendering, and a drag that commits one operation and
// re-renders only the dragged node.

test("the stress page drags a node on a 500-node diagram with one operation", async ({ page }) => {
  await page.goto("/stress?size=500");
  await expect(page.getByText(/500 nodes, \d+ connectors, \d+ groups/)).toBeVisible();
  await page.waitForFunction(() => window.__liveCanvasStress?.ready === true);

  // Only the steps in view are mounted.
  const mounted = await page.evaluate(() => window.__liveCanvasStress?.mountedNodes() ?? 0);
  expect(mounted).toBeGreaterThan(5);
  expect(mounted).toBeLessThan(100);

  const step = page.locator(".react-flow__node-step", { hasText: "Sand part 2" });
  const before = await flowPosition(step);
  await page.evaluate(() => window.__liveCanvasStress?.resetRenders());
  const from = await centreOf(step);
  await drag(page, from, { x: from.x + 60, y: from.y + 40 }, 12);
  const after = await flowPosition(step);
  expect(after.x).toBeGreaterThan(before.x + 30);

  const result = await page.evaluate(() => {
    const probe = window.__liveCanvasStress;
    return probe ? { operations: probe.operations(), renders: probe.renders() } : null;
  });
  expect(result?.operations).toBe(1);
  // Strict mode renders twice in development, so ids are what matters here.
  expect(Object.keys(result?.renders.frame.ids ?? {})).toEqual(["stress-node-2"]);
  expect(Object.keys(result?.renders.content.ids ?? {})).toEqual(["stress-node-2"]);
});

test("each technique can be switched off with a query flag", async ({ page }) => {
  await page.goto("/stress?size=500");
  await page.getByRole("link", { name: "Visible-only rendering: on" }).click();
  await expect(page).toHaveURL(/no-visible/);
  await expect(page.getByRole("link", { name: "Visible-only rendering: off" })).toBeVisible();
  await expect(page.getByText("Measuring with 1 technique switched off.")).toBeVisible();
  await page.waitForFunction(() => window.__liveCanvasStress?.ready === true);
  expect(await page.evaluate(() => window.__liveCanvasStress?.mountedNodes())).toBe(500);
});
