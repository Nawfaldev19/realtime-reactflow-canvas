import { expect, test } from "@playwright/test";
import { centreOf, newDiagram, waitForSave } from "./helpers";

test("drawing in draw mode creates a sketch node that is selected by its ink only and survives a reload", async ({
  page,
}) => {
  await newDiagram(page, "Sketch check");
  await page.getByRole("button", { name: "Draw" }).click();
  const overlay = page.getByTestId("sketch-overlay");
  await expect(overlay).toBeVisible();

  const area = await overlay.boundingBox();
  if (!area) throw new Error("The drawing area has no box");
  const origin = { x: area.x + area.width * 0.6, y: area.y + area.height * 0.4 };
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  for (let step = 1; step <= 30; step += 1) {
    await page.mouse.move(origin.x + step * 6, origin.y + (step % 2 === 0 ? 30 : -30) * Math.min(1, step / 5));
  }
  await expect(page.locator(".sketch-overlay__preview path")).toHaveAttribute("d", /^M .* Z$/);
  await page.mouse.up();

  const sketch = page.locator(".react-flow__node-sketch");
  await expect(sketch).toHaveCount(1);
  await expect(sketch.locator("path")).toHaveAttribute("d", /^M .* Q .* Z$/);

  // A tap draws nothing; Escape leaves draw mode.
  await page.mouse.click(origin.x - 200, origin.y + 150);
  await expect(sketch).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);

  // The empty corner of the sketch's box does not select it.
  const box = await sketch.boundingBox();
  if (!box) throw new Error("The sketch has no box");
  await page.mouse.click(box.x + 2, box.y + box.height - 2);
  await expect(sketch).not.toHaveClass(/selected/);

  await waitForSave(page);
  await page.reload();
  await expect(page.locator(".react-flow__node-sketch")).toHaveCount(1);
  const reloaded = await centreOf(page.locator(".react-flow__node-sketch"));
  expect(reloaded.x).toBeGreaterThan(0);
});
