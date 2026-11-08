import { expect, test } from "@playwright/test";
import { flowPosition, signInAs } from "./helpers";

test("a moved node keeps its new position after a reload", async ({ page }) => {
  await signInAs(page, "Ada Okafor");
  await page.getByLabel("Workspace").selectOption({ label: "Riverside Makers (owner)" });
  await expect(page.getByRole("heading", { name: "Riverside Makers", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Build a walnut side table" }).click();
  await expect(page.getByRole("heading", { name: "Build a walnut side table", level: 1 })).toBeVisible();

  const node = page.locator(".react-flow__node", { hasText: "Cut legs and aprons" });
  await expect(node).toBeVisible();
  const before = await flowPosition(node);

  const box = await node.boundingBox();
  if (!box) throw new Error("The node has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();

  const after = await flowPosition(node);
  expect(after.x).toBeGreaterThan(before.x + 50);
  await expect(page.getByRole("status").filter({ hasText: /Saved · just now/ })).toBeVisible({ timeout: 10_000 });

  await page.reload();
  const reloaded = page.locator(".react-flow__node", { hasText: "Cut legs and aprons" });
  await expect(reloaded).toBeVisible();
  expect(await flowPosition(reloaded)).toEqual(after);
});

test("the landing tour walks through the hero features by keyboard and leads to sign-in", async ({ page }) => {
  await page.goto("/");
  const tour = page.getByRole("region", { name: "Take the tour" });
  await expect(tour.getByText("Stop 1 of 8")).toBeVisible();

  await tour.getByRole("button", { name: /Next/ }).focus();
  for (let stop = 2; stop <= 8; stop += 1) {
    await page.keyboard.press("Enter");
    await expect(tour.getByText(`Stop ${String(stop)} of 8`)).toBeVisible();
  }

  await expect(tour.getByRole("heading", { name: "Fast on large diagrams" })).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(tour.getByRole("link", { name: "Start trying it" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Choose a person" })).toBeVisible();
});
