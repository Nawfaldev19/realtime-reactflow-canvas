import { expect, test, type Page } from "@playwright/test";
import { canvasNode, centreOf, newDiagram, signInAs, viewportOf, type Viewport } from "./helpers";

// Opening views, pan versus scroll navigation, the custom scrollbars and the
// read-only preview. New diagrams start with the three-node starter: a title
// pill at (0, 0) and two 180 × 64 steps at (0, 120) and (0, 240), so the
// bounds are (0, 0, 180, 304).

const BOUNDS = { x: 0, y: 0, width: 180, height: 304 };

async function canvasSize(page: Page) {
  const box = await page.locator(".react-flow").first().boundingBox();
  if (!box) throw new Error("The canvas has no box");
  return { width: box.width, height: box.height };
}

/** Waits until the view has not changed for a while (no late automatic fit), then returns it. */
async function steadyView(page: Page, quietMs = 2000): Promise<Viewport> {
  await expect(page.locator(".editor-canvas")).not.toHaveClass(/canvas--opening/);
  const first = await viewportOf(page);
  await page.waitForTimeout(quietMs);
  const later = await viewportOf(page);
  expect(later).toEqual(first);
  return later;
}

async function chooseOpening(page: Page, label: RegExp) {
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("dialog", { name: "View settings" }).getByLabel(label).check();
}

async function settingsSaved(page: Page) {
  await expect(page.getByRole("dialog", { name: "View settings" }).getByText("View settings saved")).toBeVisible();
}

test("each opening view is applied on open, survives a reload and is never overridden", async ({ page }) => {
  await newDiagram(page, "Opening views");
  const size = await canvasSize(page);

  // Default: fit width, anchored at the top (60 px), centred, at most 100%.
  let view = await steadyView(page, 500);
  expect(view.zoom).toBe(1);
  expect(view.y).toBeCloseTo(60, 0);
  expect(view.x + 90 * view.zoom).toBeCloseTo(size.width / 2, 0);

  // Fit whole diagram: centred both ways (the starter fits at 100%).
  await chooseOpening(page, /Fit whole diagram/);
  await settingsSaved(page);
  await page.reload();
  view = await steadyView(page);
  const fitZoom = Math.min(1, (size.width * 0.8) / BOUNDS.width, (size.height * 0.8) / BOUNDS.height);
  expect(view.zoom).toBeCloseTo(fitZoom, 3);
  expect(view.y + 152 * view.zoom).toBeCloseTo(size.height / 2, 0);

  // Custom 70%: zoom 0.7, centred horizontally, top anchored; still 0.7 two seconds later.
  await chooseOpening(page, /Custom zoom/);
  const field = page.getByLabel("Zoom (%)");
  await field.fill("70");
  // Leaving the field (within the menu) clamps and commits it.
  await field.press("Tab");
  await settingsSaved(page);
  await page.reload();
  view = await steadyView(page);
  expect(view.zoom).toBe(0.7);
  expect(view.y).toBeCloseTo(60, 0);
  expect(view.x + 90 * 0.7).toBeCloseTo(size.width / 2, 0);

  // Saved view: zoom in, pan with the keyboard, save, and get exactly that view back.
  await page.getByRole("button", { name: "Zoom in" }).click();
  // The button animates for 100 ms; a key pressed meanwhile would start from the zoom in between.
  await expect.poll(async () => (await viewportOf(page)).zoom).toBeCloseTo(0.84, 3);
  await page.locator(".editor-canvas").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowUp");
  const chosen = await viewportOf(page);
  await chooseOpening(page, /Saved view/);
  await expect(page.getByText(/Saved the current view \(84%\)/)).toBeVisible();
  await settingsSaved(page);
  await page.reload();
  view = await steadyView(page);
  expect(Math.abs(view.x - chosen.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(view.y - chosen.y)).toBeLessThanOrEqual(0.5);
  expect(view.zoom).toBeCloseTo(chosen.zoom, 3);

  // "Save current view" stores a new view; the preview opens with it too.
  await page.locator(".editor-canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("button", { name: "Save current view" }).click();
  await settingsSaved(page);
  const saved = await viewportOf(page);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.locator(".preview-canvas")).toBeVisible();
  const preview = await steadyView(page, 500);
  expect(Math.abs(preview.x - saved.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(preview.y - saved.y)).toBeLessThanOrEqual(0.5);
  expect(preview.zoom).toBeCloseTo(saved.zoom, 3);
});

/** Opens the preview from the editor and waits for its opening view. */
async function openPreview(page: Page) {
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.locator(".preview-canvas")).toBeVisible();
  await steadyView(page, 300);
}

test("pan mode zooms with the wheel; scroll mode scrolls, zooms with Ctrl and shows scrollbars", async ({ page }) => {
  await newDiagram(page, "Navigation modes");
  await openPreview(page);
  const canvas = page.locator(".react-flow__pane");
  const centre = await centreOf(canvas);
  await page.mouse.move(centre.x, centre.y);

  // Pan mode (the default): the wheel zooms around the pointer; no scrollbars.
  const before = await viewportOf(page);
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => (await viewportOf(page)).zoom).toBeLessThan(before.zoom);
  await expect(page.getByRole("scrollbar")).toHaveCount(0);

  // Scroll mode: the wheel moves the view, a horizontal swipe moves it sideways, Ctrl + wheel zooms.
  await page.getByRole("button", { name: /Scroll mode/ }).click();
  try {
    await expect(page.getByRole("button", { name: /Scroll mode/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("scrollbar", { name: "Scroll vertically" })).toBeVisible();
    await page.mouse.move(centre.x, centre.y);
    const scrolled = await viewportOf(page);
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await viewportOf(page)).y).toBeLessThan(scrolled.y);
    expect((await viewportOf(page)).zoom).toBe(scrolled.zoom);
    const sideways = await viewportOf(page);
    await page.mouse.wheel(120, 0);
    await expect.poll(async () => (await viewportOf(page)).x).toBeLessThan(sideways.x);
    const zoomed = await viewportOf(page);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect.poll(async () => (await viewportOf(page)).zoom).toBeGreaterThan(zoomed.zoom);

    // The preference is the member's own: it is still scroll after a reload.
    await page.reload();
    await expect(page.getByRole("button", { name: /Scroll mode/ })).toHaveAttribute("aria-pressed", "true");
  } finally {
    // Other tests expect Ada in pan mode.
    await page.getByRole("button", { name: /Pan mode/ }).click();
    await expect(page.getByRole("button", { name: /Pan mode/ })).toHaveAttribute("aria-pressed", "true");
  }
});

test("the custom scrollbars follow the view and move it by dragging, clicking the track and keys", async ({ page }) => {
  await signInAs(page, "Ada Okafor");
  await page.getByLabel("Workspace").selectOption({ label: "Riverside Makers (owner)" });
  await page.locator("li", { hasText: "Laser-cut lamp shade" }).getByRole("link", { name: "Preview" }).click();
  await expect(page.locator(".preview-canvas")).toBeVisible();
  await steadyView(page, 300);
  await page.getByRole("button", { name: "Show scrollbars" }).click();
  const thumb = page.getByRole("scrollbar", { name: "Scroll vertically" });
  await expect(thumb).toBeVisible();

  // The thumb follows a view change made elsewhere.
  const before = Number(await thumb.getAttribute("aria-valuenow"));
  await page.locator(".preview-canvas").focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => Number(await thumb.getAttribute("aria-valuenow"))).toBeGreaterThan(before);

  // Dragging the thumb to the top of its track shows the top of the scrollable area.
  const box = await thumb.boundingBox();
  if (!box) throw new Error("no thumb");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 2000, { steps: 5 });
  await page.mouse.up();
  await expect(thumb).toHaveAttribute("aria-valuenow", "0");

  // A click on the track below the thumb pages down; keys on the focused thumb scroll 20 px.
  const track = page.getByTestId("scrollbar-vertical");
  const trackBox = await track.boundingBox();
  if (!trackBox) throw new Error("no track");
  const y = (await viewportOf(page)).y;
  await page.mouse.click(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height - 5);
  await expect.poll(async () => (await viewportOf(page)).y).toBeLessThan(y - 100);
  await thumb.focus();
  const paged = (await viewportOf(page)).y;
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await viewportOf(page)).y).toBeCloseTo(paged - 20, 0);

  // The toggle hides them.
  await page.getByRole("button", { name: "Show scrollbars" }).click();
  await expect(page.getByRole("scrollbar")).toHaveCount(0);
});

test("the preview is read-only", async ({ page }) => {
  await newDiagram(page, "Read-only preview");
  await openPreview(page);
  const step = canvasNode(page, "First step");
  const before = await step.boundingBox();
  if (!before) throw new Error("no step");

  // Dragging a step pans the view instead of moving the step relative to the others.
  const other = canvasNode(page, "Second step");
  const gap = async () => {
    const a = await step.boundingBox();
    const b = await other.boundingBox();
    return a && b ? Math.round(b.y - a.y) : NaN;
  };
  const spacing = await gap();
  await page.mouse.move(before.x + 20, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x + 140, before.y + 80, { steps: 8 });
  await page.mouse.up();
  expect(await gap()).toBe(spacing);
  await expect(step).not.toHaveClass(/selected/);

  // No text editing, no deleting, no connecting.
  await step.dblclick();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await step.click();
  await page.keyboard.press("Delete");
  await expect(canvasNode(page, "First step")).toHaveCount(1);
  await expect(page.locator(".react-flow__handle.connectable")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Add to diagram" })).toHaveCount(0);
});
