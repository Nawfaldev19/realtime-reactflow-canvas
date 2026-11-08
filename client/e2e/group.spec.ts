import { expect, test, type Locator } from "@playwright/test";
import { canvasNode, centreOf, drag, newDiagram, waitForSave } from "./helpers";

const parentOf = (node: Locator) => node.locator(".node").first().getAttribute("data-parent-id");

/** Grabs a node 50 px left of its centre: a new step lands on the canvas centre, where a connector can pass over its middle. */
async function grab(node: Locator) {
  const centre = await centreOf(node);
  return { x: centre.x - 50, y: centre.y };
}

test("grouping, dragging a node into a group and Alt-dragging it out", async ({ page }) => {
  await newDiagram(page, "Group check");
  const first = canvasNode(page, "First step");
  const second = canvasNode(page, "Second step");

  // Box-select both steps (Shift + drag on the pane), then group them.
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  if (!a || !b) throw new Error("missing node boxes");
  await page.keyboard.down("Shift");
  await drag(page, { x: a.x - 30, y: a.y - 20 }, { x: b.x + b.width + 30, y: b.y + b.height + 20 });
  await page.keyboard.up("Shift");
  await page.getByRole("complementary", { name: "Properties" }).getByRole("button", { name: "Group" }).click();

  const group = page.locator(".react-flow__node-group");
  await expect(group).toHaveCount(1);
  const groupId = await group.getAttribute("data-id");
  expect(await parentOf(first)).toBe(groupId);
  expect(await parentOf(second)).toBe(groupId);

  // A new step, moved well clear of the group, stays at the top level.
  await page.getByRole("button", { name: "Add step" }).click();
  const added = canvasNode(page, "New step");
  const groupBox = await group.boundingBox();
  if (!groupBox) throw new Error("missing group box");
  const outside = { x: groupBox.x + groupBox.width + 160, y: groupBox.y + groupBox.height / 2 };
  await drag(page, await grab(added), outside);
  expect(await parentOf(added)).toBe("");

  // Released with its centre inside the group, it joins the group.
  await drag(page, await grab(added), {
    x: groupBox.x + groupBox.width / 2 - 50,
    y: groupBox.y + groupBox.height - 25,
  });
  await expect.poll(() => parentOf(added)).toBe(groupId);

  // Without Alt it cannot leave; with Alt held it is detached.
  await drag(page, await grab(added), outside);
  await expect.poll(() => parentOf(added)).toBe(groupId);
  await page.keyboard.down("Alt");
  await drag(page, await grab(added), outside);
  await page.keyboard.up("Alt");
  await expect.poll(() => parentOf(added)).toBe("");

  await waitForSave(page);
  await page.reload();
  await expect(page.locator(".react-flow__node-group")).toHaveCount(1);
  expect(await parentOf(canvasNode(page, "First step"))).toBe(groupId);
  expect(await parentOf(canvasNode(page, "New step"))).toBe("");
});
