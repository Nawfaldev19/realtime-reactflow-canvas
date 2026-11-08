import { expect, type Locator, type Page } from "@playwright/test";

export async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: `Continue as ${name}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** A node's position in canvas coordinates, read from the transform the canvas applies. */
export async function flowPosition(node: Locator): Promise<{ x: number; y: number }> {
  const style = (await node.getAttribute("style")) ?? "";
  const match = /translate\((-?[\d.]+)px, ?(-?[\d.]+)px\)/.exec(style);
  if (!match) throw new Error(`Unexpected node style: ${style}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

/** Signs in as Ada, creates a fresh diagram (the three-node starter) and opens it. */
export async function newDiagram(page: Page, title: string) {
  await signInAs(page, "Ada Okafor");
  await page.getByLabel("Workspace").selectOption({ label: "Riverside Makers (owner)" });
  await expect(page.getByRole("heading", { name: "Riverside Makers", level: 1 })).toBeVisible();
  await page.getByLabel("New diagram title").fill(title);
  await page.getByRole("button", { name: "New diagram" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export async function centreOf(locator: Locator): Promise<ScreenPoint> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The element has no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags with the mouse in small steps, so the canvas sees a real gesture. */
export async function drag(page: Page, from: ScreenPoint, to: ScreenPoint, steps = 10) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 2, from.y + (to.y - from.y) / 2, { steps });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Waits for autosave to report the latest change as saved. */
export async function waitForSave(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /Saved · just now/ })).toBeVisible({ timeout: 10_000 });
}

/** The canvas node wrapper that contains `text`. */
export const canvasNode = (page: Page, text: string) => page.locator(".react-flow__node", { hasText: text });

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  /** The canvas element's top-left corner on the page. */
  readonly left: number;
  readonly top: number;
}

/** The canvas transform (screen = canvas × zoom + translation, relative to the canvas element). */
export async function viewportOf(page: Page): Promise<Viewport> {
  const style = (await page.locator(".react-flow__viewport").getAttribute("style")) ?? "";
  const match = /translate\((-?[\d.]+)px, ?(-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(style);
  if (!match) throw new Error(`Unexpected viewport style: ${style}`);
  const box = await page.locator(".react-flow").first().boundingBox();
  if (!box) throw new Error("The canvas has no bounding box");
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]), left: box.x, top: box.y };
}

/** Page coordinates of a canvas point. */
export const toScreen = (view: Viewport, point: ScreenPoint): ScreenPoint => ({
  x: view.left + view.x + point.x * view.zoom,
  y: view.top + view.y + point.y * view.zoom,
});

/** Canvas coordinates of a page point. */
export const toFlow = (view: Viewport, point: ScreenPoint): ScreenPoint => ({
  x: (point.x - view.left - view.x) / view.zoom,
  y: (point.y - view.top - view.y) / view.zoom,
});

/**
 * Presses at `from` and moves the dragged element by exactly `by` screen
 * pixels, keeping the button down so a test can look at the gesture in
 * progress. The canvas starts a node drag only once the pointer has moved, and
 * measures from that point, so a small first move starts the drag and the
 * rest of the movement is counted from there.
 */
export async function dragByAndHold(page: Page, from: ScreenPoint, by: ScreenPoint, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const start = { x: from.x + 3, y: from.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.move(start.x + by.x / 2, start.y + by.y / 2, { steps });
  await page.mouse.move(start.x + by.x, start.y + by.y, { steps });
}
