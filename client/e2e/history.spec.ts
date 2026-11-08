import { expect, test, type Browser, type Page } from "@playwright/test";
import { canvasNode, centreOf, drag, newDiagram, signInAs, waitForSave } from "./helpers";

// Version history: saving labelled versions, comparing them with the
// diagram (added, removed and changed highlights, overlay and side by side),
// restoring as one undoable operation, with collaboration on and off, and a
// restore reaching a collaborator's screen.
// The starter diagram has a title pill and two steps, "First step" and "Second step".

const versionsPanel = (page: Page) => page.getByRole("complementary", { name: "Version history" });
const nodes = (page: Page) => page.locator(".editor-canvas:not(.compare-canvas) .react-flow__node");

async function openVersions(page: Page) {
  await page.getByRole("button", { name: "Versions" }).click();
  await expect(versionsPanel(page)).toBeVisible();
}

async function saveVersion(page: Page, label: string, number: number) {
  const panel = versionsPanel(page);
  await panel.getByLabel("Label (optional)").fill(label);
  await panel.getByRole("button", { name: "Save version" }).click();
  await expect(panel.getByRole("status")).toHaveText(`Saved v${String(number)}`);
  await expect(panel.getByRole("listitem", { name: `v${String(number)} · ${label}` })).toBeVisible();
}

async function restore(page: Page, number: number) {
  const panel = versionsPanel(page);
  await panel.getByRole("button", { name: `Restore v${String(number)}` }).click();
  await panel
    .getByRole("group", { name: `Restore v${String(number)}?` })
    .getByRole("button", { name: `Restore v${String(number)}` })
    .click();
  await expect(panel.getByRole("status")).toHaveText(`Restored v${String(number)}. Undo puts it back.`);
}

/** Moves "First step", deletes "Second step" and adds a step: one changed, one removed, one added. */
async function editThreeWays(page: Page) {
  const first = await centreOf(canvasNode(page, "First step"));
  const before = await canvasNode(page, "First step").boundingBox();
  await drag(page, first, { x: first.x - 220, y: first.y + 60 });
  await expect.poll(() => canvasNode(page, "First step").boundingBox()).not.toEqual(before);
  await canvasNode(page, "Second step").click();
  await page.keyboard.press("Delete");
  await expect(nodes(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Add step" }).click();
  await expect(nodes(page)).toHaveCount(3);
}

const isLive = (page: Page) =>
  expect(page.locator(".save-status")).toHaveText(/All changes saved|Saved/, { timeout: 15_000 });

test("save a labelled version, edit, compare the highlights, restore, and undo the restore", async ({ page }) => {
  await newDiagram(page, "History lamp plan");
  await isLive(page);
  await openVersions(page);
  await expect(versionsPanel(page).getByRole("listitem", { name: "v1 · Created" })).toContainText("Ada Okafor");
  await saveVersion(page, "Starter", 2);

  await editThreeWays(page);
  await waitForSave(page);

  // Compare v2 with the current diagram: exactly one added, one removed and one changed step glow.
  await versionsPanel(page).getByRole("button", { name: "Compare v2" }).click();
  const compare = page.getByRole("dialog", { name: "Compare versions" });
  await expect(compare.getByRole("button", { name: "Added (1)" })).toBeVisible();
  await expect(compare.getByRole("button", { name: "Removed (1)" })).toBeVisible();
  await expect(compare.getByRole("button", { name: "Changed (1)" })).toBeVisible();
  const overlay = compare.locator(".compare-canvas");
  await expect(overlay).toHaveCount(1);
  await expect(overlay.locator(".react-flow__node.diff--added")).toHaveCount(1);
  await expect(overlay.locator(".react-flow__node.diff--removed")).toHaveText(/Second step/);
  await expect(overlay.locator(".react-flow__node.diff--changed")).toHaveText(/First step/);
  // The title pill did not change: plain, not highlighted.
  await expect(overlay.locator(".react-flow__node.diff--plain")).toHaveCount(1);
  await expect(overlay.locator(".react-flow__edge.diff--removed")).toHaveCount(1);

  // The diff card says what changed.
  await overlay.locator(".react-flow__node.diff--changed").click();
  await expect(compare.getByRole("complementary", { name: "What changed" })).toContainText("Moved");

  // A filter hides its highlight.
  await compare.getByRole("button", { name: "Removed (1)" }).click();
  await expect(compare.getByRole("button", { name: "Removed (1)" })).toHaveAttribute("aria-pressed", "false");
  await expect(overlay.locator(".react-flow__node.diff--removed")).toHaveCount(0);
  await expect(overlay.locator(".react-flow__node.diff--hidden")).toHaveCount(1);
  await compare.getByRole("button", { name: "Removed (1)" }).click();

  // Side by side: the version on the left with what was removed, the diagram on the right with what was added.
  await compare.getByRole("button", { name: "Side by side" }).click();
  const [left, right] = [
    compare.getByRole("region", { name: "v2 · Starter" }),
    compare.getByRole("region", { name: "Current diagram" }),
  ];
  await expect(left.locator(".react-flow__node.diff--removed")).toHaveText(/Second step/);
  await expect(left.locator(".react-flow__node.diff--added")).toHaveCount(0);
  await expect(right.locator(".react-flow__node.diff--added")).toHaveCount(1);
  await expect(right.locator(".react-flow__node.diff--changed")).toHaveText(/First step/);
  await page.keyboard.press("Escape");
  await expect(compare).toBeHidden();

  // Restore v2: the diagram looks like the version again, and the state before it is kept as v3.
  const firstBefore = await canvasNode(page, "First step").boundingBox();
  await restore(page, 2);
  await expect(nodes(page)).toHaveCount(3);
  await expect(canvasNode(page, "Second step")).toBeVisible();
  await expect(versionsPanel(page).getByRole("listitem", { name: "v3 · Before restoring v2" })).toBeVisible();
  expect(await canvasNode(page, "First step").boundingBox()).not.toEqual(firstBefore);
  await waitForSave(page);

  // One undo takes the whole restore back.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(canvasNode(page, "Second step")).toHaveCount(0);
  await expect(nodes(page)).toHaveCount(3);
  await expect(page.locator(".react-flow__node", { hasText: "New step" })).toHaveCount(1);
  await waitForSave(page);
  await page.reload();
  await expect(nodes(page)).toHaveCount(3);
  await expect(canvasNode(page, "Second step")).toHaveCount(0);
});

test("restore works with live collaboration off, through autosave", async ({ page }) => {
  await newDiagram(page, "Offline restore plan");
  await isLive(page);
  await page.getByRole("switch", { name: /Live collaboration/ }).click();
  await expect(page.getByText(/Live collaboration turned off by Ada Okafor/)).toBeVisible();
  await openVersions(page);
  await saveVersion(page, "Before the cuts", 2);
  await editThreeWays(page);
  await waitForSave(page);

  const save = page.waitForRequest(
    (request) => request.url().endsWith("/graphql") && (request.postData() ?? "").includes("SaveDiagram"),
  );
  await restore(page, 2);
  await save;
  await waitForSave(page);
  await page.reload();
  await expect(nodes(page)).toHaveCount(3);
  await expect(canvasNode(page, "Second step")).toBeVisible();
});

async function openAs(browser: Browser, name: string, url: string) {
  const context = await browser.newContext();
  const other = await context.newPage();
  await signInAs(other, name);
  await other.goto(url);
  await expect(other.locator(".react-flow__node")).not.toHaveCount(0);
  return other;
}

test("a restore in one browser appears in the other, and its history panel offers a refresh", async ({
  page,
  browser,
}) => {
  await newDiagram(page, "Shared restore plan");
  await isLive(page);
  await openVersions(page);
  await saveVersion(page, "Both steps", 2);
  const ben = await openAs(browser, "Ben Lindqvist", page.url());
  await isLive(ben);
  await openVersions(ben);
  await expect(versionsPanel(ben).getByRole("listitem", { name: "v2 · Both steps" })).toBeVisible();

  await canvasNode(page, "Second step").click();
  await page.keyboard.press("Delete");
  await expect(nodes(ben)).toHaveCount(2);

  await restore(page, 2);
  await expect(nodes(ben)).toHaveCount(3);
  await expect(canvasNode(ben, "Second step")).toBeVisible();

  // Ada's restore kept the state before it as v3; Ben's open panel hears about it.
  await versionsPanel(ben)
    .getByRole("button", { name: /New versions saved/ })
    .click();
  await expect(versionsPanel(ben).getByRole("listitem", { name: "v3 · Before restoring v2" })).toBeVisible();
  await ben.context().close();
});

test("a viewer can list and compare versions but not save or restore them", async ({ page, browser }) => {
  await newDiagram(page, "Viewer history plan");
  await isLive(page);
  const cora = await openAs(browser, "Cora Mbeki", page.url());
  await openVersions(cora);
  const panel = versionsPanel(cora);
  await expect(panel.getByRole("listitem", { name: "v1 · Created" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Save version" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Restore v1" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Compare v1" }).click();
  await expect(cora.getByRole("dialog", { name: "Compare versions" }).getByRole("status")).toHaveText("No differences");
  await cora.context().close();
});
