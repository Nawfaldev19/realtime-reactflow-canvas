import { expect, test, type Locator } from "@playwright/test";
import { canvasNode, centreOf, drag, newDiagram, waitForSave } from "./helpers";

/** The canvas writes each node's stacking order into its inline style. */
async function zIndex(node: Locator): Promise<number> {
  const match = /z-index:\s*(-?\d+)/.exec((await node.getAttribute("style")) ?? "");
  if (!match) throw new Error("The node has no z-index");
  return Number(match[1]);
}

test("stacking commands reorder overlapping nodes and persist", async ({ page }) => {
  await newDiagram(page, "Stacking check");
  const first = canvasNode(page, "First step");
  const second = canvasNode(page, "Second step");

  // Overlap the steps: the second (created later) is on top.
  const from = await centreOf(second);
  const target = await centreOf(first);
  await drag(page, from, { x: target.x + 30, y: target.y + 20 });
  expect(await zIndex(second)).toBeGreaterThan(await zIndex(first));

  const panel = page.getByRole("complementary", { name: "Properties" });
  await first.click({ position: { x: 8, y: 8 } });
  await panel.getByRole("button", { name: "Bring to front" }).click();
  await expect.poll(async () => (await zIndex(first)) > (await zIndex(second))).toBe(true);

  await panel.getByRole("button", { name: "Send backward" }).click();
  await expect.poll(async () => (await zIndex(first)) < (await zIndex(second))).toBe(true);

  await panel.getByRole("button", { name: "Bring forward" }).click();
  await expect.poll(async () => (await zIndex(first)) > (await zIndex(second))).toBe(true);

  await panel.getByRole("button", { name: "Send to back" }).click();
  await expect.poll(async () => (await zIndex(first)) < (await zIndex(second))).toBe(true);

  // Keyboard: Ctrl+Shift+] brings the selection to the front.
  await page.keyboard.press("Control+Shift+BracketRight");
  await expect.poll(async () => (await zIndex(first)) > (await zIndex(second))).toBe(true);

  await waitForSave(page);
  await page.reload();
  const reloadedFirst = canvasNode(page, "First step");
  await expect(reloadedFirst).toBeVisible();
  expect(await zIndex(reloadedFirst)).toBeGreaterThan(await zIndex(canvasNode(page, "Second step")));
});
