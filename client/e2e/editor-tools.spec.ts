import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  canvasNode,
  centreOf,
  dragByAndHold,
  flowPosition,
  newDiagram,
  toFlow,
  toScreen,
  viewportOf,
  waitForSave,
} from "./helpers";

// Editor tools: alignment guides, the selection toolbar, automatic layout,
// undo and redo, copy and paste, find, and the shape library. The starter
// diagram has a title pill at (0, 0) and two 180 × 64 steps at (0, 120) and
// (0, 240), connected in a chain.

const overlay = (page: Page) => page.getByTestId("guide-overlay");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Selection tools" });

/** A node's size from the inline width and height the canvas gives it. */
async function sizeOf(node: Locator): Promise<{ width: number; height: number }> {
  const style = (await node.getAttribute("style")) ?? "";
  const width = /width:\s*([\d.]+)px/.exec(style);
  const height = /height:\s*([\d.]+)px/.exec(style);
  return { width: Number(width?.[1]), height: Number(height?.[1]) };
}

const increasing = (values: readonly number[]) =>
  values.every((value, at) => at === 0 || value > (values[at - 1] ?? Infinity));

/** Waits until the opening fit of the view has finished. */
async function settled(page: Page) {
  let previous = "";
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await viewportOf(page));
        const same = current === previous;
        previous = current;
        return same;
      },
      { intervals: [150] },
    )
    .toBe(true);
}

/** Drags a node so its top-left corner lands on a canvas point (a body drag keeps the grab offset). */
async function moveNodeTo(page: Page, node: Locator, target: { x: number; y: number }) {
  await settled(page);
  const view = await viewportOf(page);
  const position = await flowPosition(node);
  await dragByAndHold(page, await centreOf(node), {
    x: (target.x - position.x) * view.zoom,
    y: (target.y - position.y) * view.zoom,
  });
  await page.mouse.up();
}

async function setSnapping(page: Page, on: boolean) {
  await page.getByRole("button", { name: "Snapping" }).click();
  const box = page.getByRole("dialog", { name: "Snapping" }).getByLabel("Snap to other steps");
  if (on) await box.check();
  else await box.uncheck();
  await page.keyboard.press("Escape");
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
}

test("alignment guides appear and snap while dragging and while resizing", async ({ page }) => {
  await newDiagram(page, "Guides check");
  const second = canvasNode(page, "Second step");
  // Targets stay well inside the canvas: near its edge the canvas pans while dragging.
  await moveNodeTo(page, second, { x: 250, y: 330 });
  await expect.poll(() => flowPosition(second)).toEqual({ x: 250, y: 330 });

  // Drag it back until its left edge is 5 screen pixels right of the others' left edges (x = 0).
  const view = await viewportOf(page);
  await dragByAndHold(page, await centreOf(second), { x: -250 * view.zoom + 5, y: 0 });
  await expect(overlay(page)).toHaveAttribute("data-vertical", "left:0");
  await page.mouse.up();
  await expect(overlay(page)).not.toHaveAttribute("data-vertical");
  await expect.poll(() => flowPosition(second)).toEqual({ x: 0, y: 330 });

  // Put it beside the first step, 20 below its top, then resize its bottom to 3 screen pixels below the first step's bottom (184).
  await moveNodeTo(page, second, { x: 250, y: 140 });
  await expect.poll(() => flowPosition(second)).toEqual({ x: 250, y: 140 });
  await second.click({ position: { x: 10, y: 10 } });
  const handle = second.locator(".react-flow__resize-control.handle.bottom.right");
  const corner = await centreOf(handle);
  const now = await viewportOf(page);
  const bottom = toScreen(now, { x: 0, y: 184 }).y + 3;
  await dragByAndHold(page, corner, { x: -3, y: bottom - corner.y });
  await expect(overlay(page)).toHaveAttribute("data-horizontal", "bottom:184");
  await page.mouse.up();
  await expect(overlay(page)).not.toHaveAttribute("data-horizontal");
  await expect.poll(async () => (await sizeOf(second)).height).toBe(44);
  await expect.poll(async () => (await sizeOf(second)).width).toBe(180);
});

test("the selection toolbar justifies, aligns and distributes several steps", async ({ page }) => {
  await newDiagram(page, "Align check");
  await setSnapping(page, false);
  const title = canvasNode(page, "Align check");
  const first = canvasNode(page, "First step");
  const second = canvasNode(page, "Second step");
  await moveNodeTo(page, first, { x: 220, y: 120 });
  await moveNodeTo(page, second, { x: 130, y: 240 });
  await expect.poll(() => flowPosition(first)).toEqual({ x: 220, y: 120 });

  await title.click({ position: { x: 10, y: 10 } });
  await first.click({ position: { x: 10, y: 10 }, modifiers: ["ControlOrMeta"] });
  await second.click({ position: { x: 10, y: 10 }, modifiers: ["ControlOrMeta"] });
  await expect(toolbar(page)).toBeVisible();

  await toolbar(page).getByRole("button", { name: "Justify right" }).click();
  // Every step is 180 wide and the rightmost right edge is 400.
  await expect
    .poll(async () =>
      [await flowPosition(title), await flowPosition(first), await flowPosition(second)].map((point) => point.x),
    )
    .toEqual([220, 220, 220]);

  // Heights 56, 64, 64 over 0..304 leave two gaps of 60.
  await toolbar(page).getByRole("button", { name: "Distribute vertically" }).click();
  await expect
    .poll(async () =>
      [await flowPosition(title), await flowPosition(first), await flowPosition(second)].map((point) => point.y),
    )
    .toEqual([0, 116, 240]);

  await toolbar(page).getByRole("button", { name: "Align top" }).click();
  await expect
    .poll(async () =>
      [await flowPosition(title), await flowPosition(first), await flowPosition(second)].map((point) => point.y),
    )
    .toEqual([0, 0, 0]);
});

test("both layout engines lay out in both directions, and Manual restores the arrangement", async ({ page }) => {
  await newDiagram(page, "Layout check");
  const nodes = [canvasNode(page, "Layout check"), canvasNode(page, "First step"), canvasNode(page, "Second step")];
  await setSnapping(page, false);
  await moveNodeTo(page, canvasNode(page, "Second step"), { x: 250, y: 200 });
  const manual = await Promise.all(nodes.map(flowPosition));
  expect(manual[2]).toEqual({ x: 250, y: 200 });
  const positions = () => Promise.all(nodes.map(flowPosition));

  await page.getByRole("button", { name: "Layout" }).click();
  const menu = page.getByRole("dialog", { name: "Layout" });
  const direction = menu.getByLabel("Direction");

  for (const engine of ["Fast", "Layered"]) {
    await direction.selectOption("TB");
    await menu.getByRole("button", { name: engine }).click();
    await expect(menu.getByRole("button", { name: engine })).toHaveAttribute("aria-pressed", "true");
    // Top to bottom: each step below the one before, centres in one column (equal widths).
    await expect
      .poll(async () => {
        const points = await positions();
        return increasing(points.map((point) => point.y)) && new Set(points.map((point) => point.x)).size === 1;
      })
      .toBe(true);

    await direction.selectOption("LR");
    await expect.poll(async () => increasing((await positions()).map((point) => point.x))).toBe(true);
  }

  await menu.getByRole("button", { name: "Manual — free positioning" }).click();
  await expect.poll(positions).toEqual(manual);
  await expect(menu.getByRole("button", { name: "Manual — free positioning" })).toBeDisabled();

  await waitForSave(page);
  await page.reload();
  await expect.poll(() => flowPosition(canvasNode(page, "Second step"))).toEqual({ x: 250, y: 200 });
});

test("undo and redo round-trip a move, and are left to the text editor while typing", async ({ page }) => {
  await newDiagram(page, "Undo check");
  await setSnapping(page, false);
  const first = canvasNode(page, "First step");
  const start = await flowPosition(first);
  await moveNodeTo(page, first, { x: 260, y: 150 });
  await expect.poll(() => flowPosition(first)).toEqual({ x: 260, y: 150 });

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => flowPosition(first)).toEqual(start);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => flowPosition(first)).toEqual({ x: 260, y: 150 });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => flowPosition(first)).toEqual(start);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => flowPosition(first)).toEqual({ x: 260, y: 150 });

  // While editing text, Ctrl/Cmd+Z belongs to the editor: the move stays.
  await first.dblclick();
  const editor = page.getByRole("textbox", { name: "Step text" });
  await expect(editor).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" twice");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).toBeFocused();
  expect(await flowPosition(first)).toEqual({ x: 260, y: 150 });
  await page.keyboard.type(" again");
  await page.keyboard.press("Escape");
  await expect(first).toContainText("again");

  // The text edit is one history step.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(first).not.toContainText("again");
  await expect(first).toContainText("First step");
  expect(await flowPosition(first)).toEqual({ x: 260, y: 150 });
});

test("copying a group pastes its children and internal connector at the pointer", async ({ page }) => {
  await newDiagram(page, "Paste check");
  const first = canvasNode(page, "First step");
  const second = canvasNode(page, "Second step");
  await first.click({ position: { x: 10, y: 10 } });
  await second.click({ position: { x: 10, y: 10 }, modifiers: ["ControlOrMeta"] });
  await toolbar(page).getByRole("button", { name: "Group", exact: true }).click();
  const groups = page.locator(".react-flow__node-group");
  await expect(groups).toHaveCount(1);
  const connectors = page.locator("[data-testid=connector]:not(.connector--ghost)");
  await expect(connectors).toHaveCount(2);

  // Select the group by its frame (below its children) and copy it.
  const frame = await groups.first().boundingBox();
  if (!frame) throw new Error("missing group box");
  await page.mouse.click(frame.x + 12, frame.y + frame.height - 8);
  await expect(groups.first()).toHaveClass(/selected/);
  const originalId = (await groups.first().getAttribute("data-id")) ?? "";
  await page.keyboard.press("ControlOrMeta+c");

  const view = await viewportOf(page);
  const target = toScreen(view, { x: 380, y: 20 });
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press("ControlOrMeta+v");

  await expect(groups).toHaveCount(2);
  const pasted = page.locator(`.react-flow__node-group:not([data-id="${originalId}"])`);
  const pastedId = await pasted.getAttribute("data-id");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(connectors).toHaveCount(3);
  const pastedChildren = page.locator(`.node[data-parent-id="${pastedId ?? ""}"]`);
  await expect(pastedChildren).toHaveCount(2);
  await expect(pastedChildren.filter({ hasText: "First step" })).toHaveCount(1);
  // The copy's top-left corner is at the pointer.
  const corner = await flowPosition(pasted);
  expect(Math.abs(corner.x - 380)).toBeLessThanOrEqual(1);
  expect(Math.abs(corner.y - 20)).toBeLessThanOrEqual(1);
  await expect(pasted).toHaveClass(/selected/);
});

test("find locates a step far outside the view and pans to it", async ({ page }) => {
  await newDiagram(page, "Find check");
  const second = canvasNode(page, "Second step");
  await second.click({ position: { x: 10, y: 10 } });
  const panel = page.getByRole("complementary", { name: "Properties" });
  await panel.getByLabel("X", { exact: true }).fill("6000");
  await panel.getByLabel("X", { exact: true }).press("Enter");
  await expect.poll(() => flowPosition(second)).toEqual({ x: 6000, y: 240 });
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  const canvas = await page.locator(".react-flow").first().boundingBox();
  if (!canvas) throw new Error("missing canvas box");
  const outside = await second.boundingBox();
  expect((outside?.x ?? 0) > canvas.x + canvas.width).toBe(true);

  await page.keyboard.press("ControlOrMeta+f");
  const input = page.getByRole("searchbox", { name: "Find in diagram" });
  await expect(input).toBeFocused();
  await input.fill("second");
  const result = page.getByRole("list", { name: "Results" }).getByRole("button");
  await expect(result).toHaveCount(1);
  await expect(result).toContainText("Step 3");
  await expect(page.getByRole("group", { name: "Filter results" }).getByRole("button", { name: /All/ })).toContainText(
    "1",
  );
  await input.press("Enter");

  await expect
    .poll(async () => {
      const box = await second.boundingBox();
      return Boolean(
        box &&
          box.x >= canvas.x &&
          box.x + box.width <= canvas.x + canvas.width &&
          box.y >= canvas.y &&
          box.y + box.height <= canvas.y + canvas.height,
      );
    })
    .toBe(true);
  await expect(second).toHaveClass(/selected/);
  await input.press("Escape");
  await expect(input).toHaveCount(0);
});

test("a shape dragged from the library lands with its top-left at the drop point", async ({ page }) => {
  await newDiagram(page, "Library check");
  const library = page.getByRole("complementary", { name: "Shape library" });
  await library.getByLabel("Filter shapes").fill("hexagon");
  const item = library.getByRole("button", { name: "Hexagon" });
  await expect(library.getByRole("button")).toHaveCount(2);

  const canvas = await page.locator(".react-flow").first().boundingBox();
  if (!canvas) throw new Error("missing canvas box");
  const drop = { x: canvas.width - 260, y: canvas.height - 200 };
  await item.dragTo(page.locator(".react-flow__pane"), { targetPosition: drop });

  const shape = page.locator(".react-flow__node-shape");
  await expect(shape).toHaveCount(1);
  const view = await viewportOf(page);
  const expected = toFlow(view, { x: canvas.x + drop.x, y: canvas.y + drop.y });
  const corner = await flowPosition(shape);
  expect(Math.abs(corner.x - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(corner.y - expected.y)).toBeLessThanOrEqual(1);
  // The new shape is the selection and ready for typing.
  await expect(shape).toHaveClass(/selected/);
  await page.keyboard.type("Drill pilot holes");
  await page.keyboard.press("Escape");
  await expect(shape).toContainText("Drill pilot holes");
});
