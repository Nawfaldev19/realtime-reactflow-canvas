import { expect, test } from "@playwright/test";
import { canvasNode, drag, newDiagram, waitForSave } from "./helpers";

test("typing grows a node, resizing changes its box, and the fit button restores an exact fit", async ({ page }) => {
  await newDiagram(page, "Resize check");
  // The last step has nothing below it to cover its resize handles. Find it by id: its text is about to change.
  const id = await canvasNode(page, "Second step").getAttribute("data-id");
  const node = page.locator(`.react-flow__node[data-id="${id ?? ""}"]`);
  const before = await node.boundingBox();
  if (!before) throw new Error("missing node box");

  // Grow while editing: six lines no longer fit the 64px step.
  await node.dblclick();
  const editor = page.getByRole("textbox", { name: "Step text" });
  await expect(editor).toBeFocused();
  await page.keyboard.type("Measure twice");
  for (const line of ["Mark the joints", "Cut once", "Dry-fit", "Glue", "Clamp overnight"]) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  await expect.poll(async () => (await node.boundingBox())?.height ?? 0).toBeGreaterThan(before.height * 1.8);
  // Backspace edits text; it never deletes the node.
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(node).toContainText("Clamp overnigh");
  const grown = await node.boundingBox();
  if (!grown) throw new Error("missing node box");

  // Drag the bottom-right resize handle: wider, and much shorter than the text.
  await node.click();
  const handle = node.locator(".react-flow__resize-control.handle.bottom.right");
  const corner = await handle.boundingBox();
  if (!corner) throw new Error("missing resize handle");
  const start = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
  await drag(page, start, { x: start.x + 80, y: start.y - grown.height * 0.6 });
  const resized = await node.boundingBox();
  if (!resized) throw new Error("missing node box");
  expect(resized.width).toBeGreaterThan(grown.width + 40);
  expect(resized.height).toBeLessThan(grown.height * 0.6);

  // The content now overflows, so the fit button appears; it grows the node to fit exactly.
  const fit = page.getByRole("button", { name: "Fit height to text" });
  await expect(fit).toBeVisible();
  await fit.click();
  await expect(fit).toHaveCount(0);
  const fitted = await node.boundingBox();
  expect(fitted && fitted.height > resized.height).toBe(true);

  await waitForSave(page);
  await page.reload();
  const reloaded = await page.locator(`.react-flow__node[data-id="${id ?? ""}"]`).boundingBox();
  expect(Math.abs((reloaded?.height ?? 0) - (fitted?.height ?? 0))).toBeLessThan(2);
});
