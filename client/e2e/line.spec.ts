import { expect, test, type Page } from "@playwright/test";
import { centreOf, newDiagram, waitForSave, type ScreenPoint } from "./helpers";

/** Moves the pointer along an arc around `pivot`, from angle `from` to `to` (0° up, clockwise). */
async function rotatePointer(page: Page, pivot: ScreenPoint, radius: number, from: number, to: number, steps = 24) {
  const at = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return { x: pivot.x + radius * Math.sin(radians), y: pivot.y - radius * Math.cos(radians) };
  };
  for (let step = 1; step <= steps; step += 1) {
    const point = at(from + ((to - from) * step) / steps);
    await page.mouse.move(point.x, point.y);
  }
}

test("rotating a line with its handle previews and snaps to the nearest cardinal angle", async ({ page }) => {
  await newDiagram(page, "Line rotation check");
  await page.getByRole("button", { name: "Add line" }).click();
  const line = page.locator(".react-flow__node-line");
  await expect(line).toHaveCount(1);
  const angle = page.getByLabel("Angle");
  await expect(angle).toHaveValue("90");

  const handle = page.getByRole("slider", { name: "Rotate line" });
  const pivot = await centreOf(line);
  const start = await centreOf(handle);
  const radius = Math.hypot(start.x - pivot.x, start.y - pivot.y);
  const startAngle = (Math.atan2(start.x - pivot.x, -(start.y - pivot.y)) * 180) / Math.PI;

  // Turn 86° clockwise: the raw angle 176° is within 7° of 180°, so the guide shows and the release snaps.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await rotatePointer(page, pivot, radius, startAngle, startAngle + 86);
  // A vertical guide has a zero-width box, so check that it is rendered rather than "visible".
  await expect(page.getByTestId("line-snap-guide")).toBeAttached();
  await page.mouse.up();
  await expect(page.getByTestId("line-snap-guide")).toHaveCount(0);
  await expect(angle).toHaveValue("180");
  const vertical = await line.boundingBox();
  expect(vertical && vertical.height > vertical.width * 4).toBe(true);

  // Turn back 20°: 160° is outside every snap window and is kept as it is.
  const again = await centreOf(handle);
  const againAngle = (Math.atan2(again.x - pivot.x, -(again.y - pivot.y)) * 180) / Math.PI;
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await rotatePointer(page, pivot, radius, againAngle, againAngle - 20, 10);
  await expect(page.getByTestId("line-snap-guide")).toHaveCount(0);
  await page.mouse.up();
  await expect(angle).toHaveValue("160");

  // The pivot did not move.
  const after = await centreOf(line);
  expect(Math.abs(after.x - pivot.x)).toBeLessThan(1.5);
  expect(Math.abs(after.y - pivot.y)).toBeLessThan(1.5);

  await waitForSave(page);
  await page.reload();
  const reloaded = page.locator(".react-flow__node-line");
  await expect(reloaded).toHaveCount(1);
  // The stroke passes through the box centre at 160° (0° up, clockwise); clicking on it 40 px from the
  // centre selects the line (the centre itself is on the starter diagram's connector).
  const centre = await centreOf(reloaded);
  const radians = (160 * Math.PI) / 180;
  await page.mouse.click(centre.x + 40 * Math.sin(radians), centre.y - 40 * Math.cos(radians));
  await expect(page.getByLabel("Angle")).toHaveValue("160");
});
