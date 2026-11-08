import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

// The build-up reveal animation on the seeded "Build a walnut side table",
// which has "Animate on open" switched on. An init script records every
// change of a data-reveal attribute with its time, so the order and timing
// can be checked after the fact.

interface Change {
  readonly at: number;
  readonly id: string;
  readonly kind: "node" | "connector";
  readonly phase: string;
  readonly marker: boolean;
}

declare global {
  interface Window {
    revealLog?: Change[];
  }
}

async function recordReveal(page: Page) {
  await page.addInitScript(() => {
    window.revealLog = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element;
        const owner = target.closest("[data-id]");
        if (!owner) continue;
        const line = target.querySelector(".connector__line");
        window.revealLog?.push({
          at: performance.now(),
          id: owner.getAttribute("data-id") ?? "",
          kind: owner.classList.contains("react-flow__edge") ? "connector" : "node",
          phase: target.getAttribute("data-reveal") ?? "",
          marker: line?.hasAttribute("marker-end") ?? false,
        });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-reveal"] });
  });
}

const log = (page: Page) => page.evaluate(() => window.revealLog ?? []);
const surface = (page: Page) => page.locator(".preview-canvas");

async function openWalnutPreview(page: Page) {
  await signInAs(page, "Ada Okafor");
  await page.getByLabel("Workspace").selectOption({ label: "Riverside Makers (owner)" });
  await page.locator("li", { hasText: "Build a walnut side table" }).getByRole("link", { name: "Preview" }).click();
  await expect(surface(page)).toBeVisible();
}

/** Node ids in the order they started to fade in. */
const fadeOrder = (changes: readonly Change[]) =>
  changes.filter((change) => change.kind === "node" && change.phase === "fading").map((change) => change.id);

interface Ends {
  readonly source: string;
  readonly target: string;
}

/** Each connector's source and target node ids. */
const connectorEnds = (page: Page): Promise<Record<string, Ends>> =>
  page.evaluate(() => {
    const ends: Record<string, Ends> = {};
    for (const connector of Array.from(document.querySelectorAll('[data-testid="connector"]'))) {
      const id = connector.closest("[data-id]")?.getAttribute("data-id") ?? "";
      ends[id] = {
        source: connector.getAttribute("data-source") ?? "",
        target: connector.getAttribute("data-target") ?? "",
      };
    }
    return ends;
  });

interface NodeInfo {
  readonly top: number;
  readonly text: string;
}

/** Each node's screen top and text. */
const nodeInfo = (page: Page): Promise<Record<string, NodeInfo>> =>
  page.evaluate(() => {
    const info: Record<string, NodeInfo> = {};
    for (const node of Array.from(document.querySelectorAll(".react-flow__node"))) {
      info[node.getAttribute("data-id") ?? ""] = {
        top: node.getBoundingClientRect().top,
        text: node.textContent ?? "",
      };
    }
    return info;
  });

test("steps fade in in reading order, each connector draws after its source and reaches a visible target, arrowheads last", async ({
  page,
}) => {
  await recordReveal(page);
  await openWalnutPreview(page);
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "running");
  // At the start nothing but the first step is on its way in.
  await expect.poll(async () => page.locator('.node[data-reveal="shown"]').count()).toBeLessThan(3);
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "done", { timeout: 15_000 });

  const changes = await log(page);
  const order = fadeOrder(changes);
  const nodes = new Map(Object.entries(await nodeInfo(page)));
  // The title pill comes first (the top-most step), and the main chain fades in from top to bottom.
  const first = nodes.get(order[0] ?? "");
  expect(first?.text).toContain("Build a walnut side table");
  expect(first?.top).toBeLessThanOrEqual(Math.min(...[...nodes.values()].map((node) => node.top)) + 1);
  const chain = [
    "Pick and mill walnut boards",
    "Cut legs and aprons",
    "Cut mortise and tenon joints",
    "Joints fit snug?",
    "Sand to 220 grit",
    "Apply an oil finish",
    "Done",
  ];
  const chainOrder = chain.map((label) => order.findIndex((id) => (nodes.get(id)?.text ?? "").includes(label)));
  expect(chainOrder.every((at) => at >= 0)).toBe(true);
  expect([...chainOrder].sort((a, b) => a - b)).toEqual(chainOrder);
  // Every node faded in exactly once.
  expect(new Set(order).size).toBe(order.length);
  expect(order.length).toBe(await page.locator(".react-flow__node").count());

  // Every connector drew (hidden → drawing → shown) after its source started to appear, without an
  // arrowhead until the end, and its target was on its way in before the line arrived.
  const ends = await connectorEnds(page);
  const fadeAt = (id: string) =>
    changes.find((change) => change.id === id && change.phase === "fading")?.at ?? Infinity;
  const connectors = Object.keys(ends);
  expect(connectors.length).toBe(await page.locator(".react-flow__edge").count());
  for (const id of connectors) {
    const own = changes.filter((change) => change.id === id);
    const drawing = own.find((change) => change.phase === "drawing");
    const shown = own.find((change) => change.phase === "shown");
    expect(drawing, id).toBeDefined();
    expect(shown, id).toBeDefined();
    expect(drawing?.marker).toBe(false);
    expect(shown?.marker).toBe(true);
    // Drawing takes about 400 ms.
    expect((shown?.at ?? 0) - (drawing?.at ?? 0)).toBeGreaterThan(300);
    const { source, target } = ends[id] ?? { source: "", target: "" };
    expect(drawing?.at ?? 0).toBeGreaterThanOrEqual(fadeAt(source));
    expect(fadeAt(target)).toBeLessThanOrEqual(shown?.at ?? 0);
  }
  await expect(page.locator(".connector__line:not([marker-end])")).toHaveCount(0);
  await expect(page.locator('[data-reveal]:not([data-reveal="shown"])')).toHaveCount(0);
});

test("Skip shows everything at once; Replay starts again from empty with the same order", async ({ page }) => {
  await recordReveal(page);
  await openWalnutPreview(page);
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "running");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "done");
  await expect(page.locator('[data-reveal]:not([data-reveal="shown"])')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip" })).toBeDisabled();

  // Replay after Skip runs the full sequence; a second Replay after it finishes gives the same order.
  await page.evaluate(() => {
    window.revealLog = [];
  });
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "running");
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "done", { timeout: 15_000 });
  const first = fadeOrder(await log(page));
  await page.evaluate(() => {
    window.revealLog = [];
  });
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "done", { timeout: 15_000 });
  expect(fadeOrder(await log(page))).toEqual(first);
  expect(first.length).toBe(await page.locator(".react-flow__node").count());
});

test("any interaction finishes the animation, and a refetch never replays it", async ({ page }) => {
  await recordReveal(page);
  await openWalnutPreview(page);
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "running");
  const pane = await page.locator(".react-flow__pane").boundingBox();
  if (!pane) throw new Error("no pane");
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  await page.mouse.wheel(0, 100);
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "done");
  await expect(page.locator('[data-reveal]:not([data-reveal="shown"])')).toHaveCount(0);

  // Returning to the window fetches the diagram again; nothing is hidden or replayed.
  await page.evaluate(() => {
    window.revealLog = [];
  });
  const refetch = page.waitForRequest(
    (request) => request.url().includes("graphql") && (request.postData() ?? "").includes("query Diagram("),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refetch;
  await page.waitForTimeout(800);
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "done");
  expect((await log(page)).filter((change) => change.phase === "hidden")).toEqual([]);
});

test("people who prefer reduced motion see the final state at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordReveal(page);
  await openWalnutPreview(page);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(surface(page)).toHaveAttribute("data-reveal-status", "idle");
  expect((await log(page)).filter((change) => change.phase !== "shown")).toEqual([]);
  await expect(page.locator(".connector__line:not([marker-end])")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay" })).toBeDisabled();
});
