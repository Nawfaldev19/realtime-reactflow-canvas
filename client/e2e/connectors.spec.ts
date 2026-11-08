import { expect, test, type Locator, type Page } from "@playwright/test";
import { canvasNode, centreOf, drag, newDiagram, waitForSave, type ScreenPoint } from "./helpers";

// Connectors: route styles, point and segment editing, re-attachment,
// sketching, drop-to-create, multi-source connect and sliding labels.

const connector = (page: Page, from: string, to: string) =>
  page.getByRole("group", { name: `Connector from ${from} to ${to}` });
const realConnectors = (page: Page) => page.locator("[data-testid=connector]:not(.connector--ghost)");

/** A point on a connector's drawn line, at `fraction` of its length, in screen coordinates. */
async function pointOnConnector(edge: Locator, fraction: number): Promise<ScreenPoint> {
  return edge.locator(".connector__line").evaluate((element, at) => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() * at);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error("The connector is not rendered");
    return {
      x: point.x * matrix.a + point.y * matrix.c + matrix.e,
      y: point.x * matrix.b + point.y * matrix.d + matrix.f,
    };
  }, fraction);
}

/** The screen positions of a connector's two drawn ends. */
async function connectorEnds(edge: Locator): Promise<[ScreenPoint, ScreenPoint]> {
  return [await pointOnConnector(edge, 0), await pointOnConnector(edge, 1)];
}

async function selectConnector(page: Page, edge: Locator, fraction = 0.6) {
  const point = await pointOnConnector(edge, fraction);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole("heading", { name: "Connector", level: 2 })).toBeVisible();
}

/** The centre of a node's port on `side`, shown by hovering the node first. */
async function port(page: Page, text: string, side: "top" | "right" | "bottom" | "left"): Promise<ScreenPoint> {
  const node = canvasNode(page, text);
  await node.hover();
  return centreOf(node.locator(`.react-flow__handle-${side}`));
}

/** Presses at `from`, moves through `points` in small steps and releases at the last one. */
async function stroke(page: Page, from: ScreenPoint, points: readonly ScreenPoint[], { space = false } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  let previous = from;
  for (const [index, point] of points.entries()) {
    await page.mouse.move(previous.x + (point.x - previous.x) / 2, previous.y + (point.y - previous.y) / 2, {
      steps: 8,
    });
    if (space && index === 0) await page.keyboard.down("Space");
    await page.mouse.move(point.x, point.y, { steps: 8 });
    previous = point;
  }
  if (space) await page.keyboard.up("Space");
  await page.mouse.up();
}

test("switching the route style redraws the connector and clears hand-placed points with an undo", async ({ page }) => {
  await newDiagram(page, "Route style check");
  const edge = connector(page, "First step", "Second step");
  await selectConnector(page, edge);
  const styles = page.getByRole("group", { name: "Route style" });
  await expect(styles.getByRole("button", { name: "Orthogonal step" })).toHaveAttribute("aria-pressed", "true");

  await styles.getByRole("button", { name: "Polyline" }).click();
  await expect(edge.getByTestId("connector")).toHaveAttribute("data-route-style", "polyline");

  // Add a point, then switch again: the point is cleared, and Undo brings it back.
  const add = edge.getByTestId("route-add-handle");
  await expect(add).toHaveCount(1);
  const handle = await centreOf(add);
  await drag(page, handle, { x: handle.x + 80, y: handle.y });
  await expect(edge.getByTestId("route-point")).toHaveCount(1);
  await styles.getByRole("button", { name: "Spline", exact: true }).click();
  await expect(edge.getByTestId("connector")).toHaveAttribute("data-route-style", "spline");
  await expect(edge.getByTestId("route-point")).toHaveCount(0);
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(edge.getByTestId("connector")).toHaveAttribute("data-route-style", "polyline");
  await expect(edge.getByTestId("route-point")).toHaveCount(1);

  await styles.getByRole("button", { name: "Bézier spline" }).click();
  await expect(edge.getByTestId("connector")).toHaveAttribute("data-route-style", "bezier");
  await waitForSave(page);
  await page.reload();
  await expect(connector(page, "First step", "Second step").getByTestId("connector")).toHaveAttribute(
    "data-route-style",
    "bezier",
  );
});

test("an add handle becomes one point that is dragged at once, and points snap to the anchor's axis in screen pixels", async ({
  page,
}) => {
  await newDiagram(page, "Point snap check");
  const edge = connector(page, "First step", "Second step");
  await selectConnector(page, edge);
  await page.getByRole("group", { name: "Route style" }).getByRole("button", { name: "Polyline" }).click();

  // Press on the add handle and move 60 px: exactly one new point, at the release position.
  const add = await centreOf(edge.getByTestId("route-add-handle"));
  await drag(page, add, { x: add.x + 60, y: add.y });
  const point = edge.getByTestId("route-point");
  await expect(point).toHaveCount(1);
  const placed = await centreOf(point);
  expect(Math.abs(placed.x - (add.x + 60))).toBeLessThan(1.5);
  await expect(edge.getByTestId("route-add-handle")).toHaveCount(2);

  // Drag it to 4 screen px right of the source's x: it snaps onto that x, with a guide while dragging.
  const [source] = await connectorEnds(edge);
  await page.mouse.move(placed.x, placed.y);
  await page.mouse.down();
  await page.mouse.move(source.x + 4, placed.y + 10, { steps: 10 });
  await expect(edge.getByTestId("snap-guide")).toHaveCount(1);
  await page.mouse.up();
  await expect(edge.getByTestId("snap-guide")).toHaveCount(0);
  const snapped = await centreOf(point);
  expect(Math.abs(snapped.x - source.x)).toBeLessThan(1);

  // 14 screen px away is outside the 7 px threshold, whatever the zoom: no snap.
  await drag(page, snapped, { x: source.x + 14, y: snapped.y });
  const free = await centreOf(point);
  expect(free.x - source.x).toBeGreaterThan(8);

  // Keyboard: arrows nudge, Backspace removes the point but never the connector.
  await point.focus();
  await page.keyboard.press("Backspace");
  await expect(edge.getByTestId("route-point")).toHaveCount(0);
  await expect(edge).toHaveCount(1);
});

test("dragging an orthogonal segment inserts one bend at the stub, and the edited route follows a moved step", async ({
  page,
}) => {
  await newDiagram(page, "Segment edit check");
  // Move the second step right and down, so its connector has two corners.
  const second = canvasNode(page, "Second step");
  const from = await centreOf(second);
  await drag(page, from, { x: from.x + 260, y: from.y + 120 });
  const edge = connector(page, "First step", "Second step");
  await selectConnector(page, edge, 0.5);
  const handles = edge.getByTestId("segment-handle");
  const before = await handles.count();
  expect(before).toBeGreaterThanOrEqual(2);

  // The first movable segment starts at the source stub: dragging it inserts exactly one bend.
  const first = handles.first();
  const axis = await first.getAttribute("data-axis");
  const start = await centreOf(first);
  const offset = axis === "y" ? { x: 0, y: 40 } : { x: 40, y: 0 };
  await drag(page, start, { x: start.x + offset.x, y: start.y + offset.y });
  await expect(handles).toHaveCount(before + 1);

  // Every drawn segment is horizontal or vertical.
  const orthogonal = () =>
    edge.locator(".connector__line").evaluate((element) => {
      const numbers = (element.getAttribute("d") ?? "").match(/[MLQ][^MLQ]*/g) ?? [];
      let previous: number[] | null = null;
      for (const command of numbers) {
        const values = command.slice(1).trim().split(/\s+/).map(Number);
        const end = values.slice(-2);
        if (
          previous &&
          command.startsWith("L") &&
          Math.abs((end[0] ?? 0) - (previous[0] ?? 0)) > 0.01 &&
          Math.abs((end[1] ?? 0) - (previous[1] ?? 0)) > 0.01
        )
          return false;
        previous = end;
      }
      return true;
    });
  expect(await orthogonal()).toBe(true);
  const middle = await centreOf(handles.nth(Math.floor((before + 1) / 2)));

  // Move the target step: the route re-attaches at its ends and keeps the edited middle.
  const target = await centreOf(second);
  await drag(page, target, { x: target.x + 80, y: target.y + 60 });
  await selectConnector(page, edge, 0.5);
  expect(await orthogonal()).toBe(true);
  const box = await second.boundingBox();
  const [, end] = await connectorEnds(edge);
  if (!box) throw new Error("The step has no box");
  expect(end.x).toBeGreaterThanOrEqual(box.x - 2);
  expect(end.x).toBeLessThanOrEqual(box.x + box.width + 2);
  expect(end.y).toBeGreaterThanOrEqual(box.y - 2);
  expect(end.y).toBeLessThanOrEqual(box.y + box.height + 2);
  const kept = await handles.evaluateAll((elements) =>
    elements
      .map((element) => element.getBoundingClientRect())
      .map((rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })),
  );
  expect(kept.some((point) => Math.abs(point.x - middle.x) < 2 || Math.abs(point.y - middle.y) < 2)).toBe(true);
});

test("holding Space while connecting sketches the route, and the points become the connector's points", async ({
  page,
}) => {
  await newDiagram(page, "Sketch check");
  await page.getByLabel("New connector style").selectOption({ label: "Polyline connector" });
  const start = await port(page, "Sketch check", "right");
  const target = await centreOf(canvasNode(page, "Second step"));
  await stroke(
    page,
    start,
    [
      { x: start.x + 160, y: start.y },
      { x: start.x + 160, y: target.y - 80 },
      { x: start.x + 160, y: target.y },
      target,
    ],
    { space: true },
  );
  const edge = connector(page, "Sketch check", "Second step");
  await expect(edge).toHaveCount(1);
  // The new connector is selected and shows the sketched points as handles.
  expect(await edge.getByTestId("route-point").count()).toBeGreaterThanOrEqual(3);
  await expect(edge.getByTestId("connector")).toHaveAttribute("data-route-style", "polyline");
});

test("dropping a connection on empty canvas offers a shape menu; Escape leaves nothing behind", async ({ page }) => {
  await newDiagram(page, "Drop check");
  const from = await port(page, "Second step", "right");
  const empty = { x: from.x + 220, y: from.y + 30 };

  await stroke(page, from, [empty]);
  const menu = page.getByRole("menu", { name: "Create a connected step" });
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("ghost-node")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId("ghost-node")).toHaveCount(0);
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await expect(realConnectors(page)).toHaveCount(2);
  await expect(page.locator(".connector--ghost")).toHaveCount(0);

  await stroke(page, from, [empty]);
  await menu.getByRole("menuitem", { name: "Decision" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__node-decision")).toHaveCount(1);
  await expect(connector(page, "Second step", "Decide?")).toHaveCount(1);
  // The new step sits where the connection was dropped.
  const created = await centreOf(page.locator(".react-flow__node-decision"));
  expect(Math.hypot(created.x - empty.x, created.y - empty.y)).toBeLessThan(4);
  await expect(realConnectors(page)).toHaveCount(3);
});

test("connecting from a multi-selection connects every selected step, also when dropped on empty canvas", async ({
  page,
}) => {
  await newDiagram(page, "Multi check");
  // Select the start and the second step, then drop from the second step's right port on empty canvas.
  await canvasNode(page, "Multi check").click();
  await canvasNode(page, "Second step").click({ modifiers: ["ControlOrMeta"] });
  const from = await port(page, "Second step", "right");
  await stroke(page, from, [{ x: from.x + 220, y: from.y + 20 }]);
  await expect(page.getByTestId("connection-preview")).toHaveCount(0);
  await page.getByRole("menu", { name: "Create a connected step" }).getByRole("menuitem", { name: "Step" }).click();
  await expect(connector(page, "Multi check", "New step")).toHaveCount(1);
  await expect(connector(page, "Second step", "New step")).toHaveCount(1);

  // Now select the start and the first step and connect both to the new step's drop zone in one gesture.
  await canvasNode(page, "Multi check").click();
  await canvasNode(page, "First step").click({ modifiers: ["ControlOrMeta"] });
  const start = await port(page, "First step", "right");
  const target = await centreOf(canvasNode(page, "New step"));
  await stroke(page, start, [{ x: start.x + 60, y: start.y }, target]);
  await expect(connector(page, "First step", "New step")).toHaveCount(1);
  // Start → New step already existed, so only the first step was added; nothing is duplicated.
  await expect(connector(page, "Multi check", "New step")).toHaveCount(1);
  await expect(realConnectors(page)).toHaveCount(5);
});

test("a label slides along its connector and keeps its place when the steps move", async ({ page }) => {
  await newDiagram(page, "Label check");
  const second = canvasNode(page, "Second step");
  const origin = await centreOf(second);
  await drag(page, origin, { x: origin.x + 300, y: origin.y + 160 });
  const edge = connector(page, "First step", "Second step");
  await selectConnector(page, edge, 0.5);
  await page.getByRole("button", { name: "Add a label" }).click();
  await page.getByRole("dialog", { name: "Edit connector label" }).getByRole("button", { name: "Yes" }).click();
  const label = page.getByTestId("connector-label");
  await expect(label).toHaveText("Yes");

  // Drag the label toward the target: it stays on the path.
  const target = await pointOnConnector(edge, 0.75);
  await drag(page, await centreOf(label), target);
  const placed = await centreOf(label);
  expect(Math.hypot(placed.x - target.x, placed.y - target.y)).toBeLessThan(6);

  // Move the target: the label is still at about three quarters of the new path.
  const now = await centreOf(second);
  await drag(page, now, { x: now.x - 120, y: now.y + 80 });
  const expected = await pointOnConnector(edge, 0.75);
  const moved = await centreOf(label);
  expect(Math.hypot(moved.x - expected.x, moved.y - expected.y)).toBeLessThan(8);

  // A double-click edits in place and never opens the quick editor.
  await label.dblclick();
  await expect(page.getByRole("dialog", { name: "Edit connector label" })).toHaveCount(0);
  const field = page.getByRole("textbox", { name: "Label text", exact: true });
  await field.fill("Ready");
  await field.press("Enter");
  await expect(label).toHaveText("Ready");
  await waitForSave(page);
});

test("dragging a connector's end to another step reconnects it and keeps its id; empty canvas snaps it back", async ({
  page,
}) => {
  await newDiagram(page, "Reconnect check");
  const edge = connector(page, "Reconnect check", "First step");
  const id = await edge.getAttribute("data-id");
  await selectConnector(page, edge, 0.5);
  const grab = await centreOf(edge.getByTestId("grab-target"));

  // Released on empty canvas: nothing changes.
  await drag(page, grab, { x: grab.x + 300, y: grab.y });
  await expect(connector(page, "Reconnect check", "First step")).toHaveCount(1);

  // Released inside the second step: the end moves there.
  await drag(page, await centreOf(edge.getByTestId("grab-target")), await centreOf(canvasNode(page, "Second step")));
  const moved = connector(page, "Reconnect check", "Second step");
  await expect(moved).toHaveCount(1);
  await expect(moved).toHaveAttribute("data-id", id ?? "");
  await expect(connector(page, "Reconnect check", "First step")).toHaveCount(0);
});
