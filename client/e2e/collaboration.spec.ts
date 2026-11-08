import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  canvasNode,
  centreOf,
  drag,
  flowPosition,
  newDiagram,
  signInAs,
  toFlow,
  viewportOf,
  waitForSave,
} from "./helpers";

// Live collaboration between real browsers through the real server.
// Ada (owner) and Ben (editor) share Riverside Makers; Cora is a viewer there.
// The starter diagram has a title pill and two steps, "First step" and "Second step".

const API = "http://localhost:3100";

/**
 * Lets a test take the collaboration server away from one page: while
 * `window.__cable.offline` is set, every socket to /cable is closed as soon as
 * it opens, and `__cable.dropAll()` closes the open ones (as when the server
 * goes away).
 */
async function controllableCable(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    const sockets: WebSocket[] = [];
    const state = {
      offline: false,
      dropAll: () => {
        for (const socket of sockets)
          if (socket.readyState === Native.OPEN || socket.readyState === Native.CONNECTING) socket.close();
      },
    };
    Object.assign(window, { __cable: state });
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (!String(url).includes("/cable")) return;
        sockets.push(this);
        this.addEventListener("open", () => {
          if (state.offline) this.close();
        });
      }
    };
  });
}

const setOffline = (page: Page, offline: boolean) =>
  page.evaluate((value) => {
    const cable = (window as unknown as { __cable: { offline: boolean; dropAll: () => void } }).__cable;
    cable.offline = value;
    if (value) cable.dropAll();
  }, offline);

/** Opens the diagram at `url` as `name` in a new browser context. */
async function openAs(browser: Browser, name: string, url: string, { offlineControl = false } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (offlineControl) await controllableCable(page);
  await signInAs(page, name);
  await page.goto(url);
  await expect(page.locator(".react-flow__node")).not.toHaveCount(0);
  return page;
}

const status = (page: Page) => page.locator(".save-status");
const people = (page: Page) => page.getByRole("list", { name: "People in this diagram" });
const isLive = (page: Page) => expect(status(page)).toHaveText(/All changes saved|Saved/, { timeout: 15_000 });

test("two people see each other's edits, cursors and editing badges", async ({ page, browser }) => {
  await newDiagram(page, "Shared lamp plan");
  await isLive(page);
  const ben = await openAs(browser, "Ben Lindqvist", page.url());
  await isLive(ben);
  await expect(people(page).getByRole("listitem")).toHaveCount(2);
  await expect(people(ben).getByLabel("Ada Okafor")).toBeVisible();

  // Ada moves a step; Ben's copy lands exactly where Ada released it.
  const first = canvasNode(page, "First step");
  const before = await flowPosition(first);
  const start = await centreOf(first);
  await drag(page, start, { x: start.x + 160, y: start.y + 40 });
  await waitForSave(page);
  const after = await flowPosition(first);
  expect(after).not.toEqual(before);
  await expect.poll(() => flowPosition(canvasNode(ben, "First step"))).toEqual(after);

  // Ben adds a step; Ada sees it.
  await ben.getByRole("button", { name: "Add step" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  // Ada's pointer shows on Ben's screen at the same canvas point, whatever each one's zoom.
  await ben.getByRole("button", { name: "Zoom in" }).click();
  const view = await viewportOf(page);
  const pointer = { x: start.x + 260, y: start.y + 160 };
  await page.mouse.move(pointer.x, pointer.y);
  const expected = toFlow(view, pointer);
  const cursor = ben.locator('.peer-cursor[data-member="Ada Okafor"]');
  await expect(cursor).toBeVisible();
  await expect(cursor).toContainText("Ada Okafor");
  await expect
    .poll(async () => {
      const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
        (await cursor.getAttribute("style")) ?? "",
      );
      const benZoom = (await viewportOf(ben)).zoom;
      return match ? [Math.round(Number(match[1])), Math.round(Number(match[2])), Number(match[3]) * benZoom] : null;
    })
    .toEqual([Math.round(expected.x), Math.round(expected.y), expect.closeTo(1, 2)]);

  // Selecting a step puts a badge in Ada's colour on it for Ben, and names it in the tag.
  await canvasNode(page, "Second step").click();
  const badge = ben.locator(".peer-badge .peer-badge__label", { hasText: "Ada Okafor · Step 3" });
  await expect(badge).toBeVisible();
  await expect(cursor).toContainText("Ada Okafor · Step 3");
  const second = await canvasNode(ben, "Second step").boundingBox();
  const badgeBox = await badge.boundingBox();
  expect(Math.abs((badgeBox?.x ?? 0) - (second?.x ?? 100))).toBeLessThan(2);

  // When Ben leaves, his cursor and avatar go at once.
  await ben.mouse.move(400, 400);
  await expect(page.locator('.peer-cursor[data-member="Ben Lindqvist"]')).toBeVisible();
  await ben.context().close();
  await expect(people(page).getByRole("listitem")).toHaveCount(1);
  await expect(page.locator(".peer-cursor")).toHaveCount(0);

  // The server stored everything: a reload shows the same diagram.
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect.poll(() => flowPosition(canvasNode(page, "First step"))).toEqual(after);
});

test("a page that loses the server keeps editing and resyncs both ways when it is back", async ({ page, browser }) => {
  await newDiagram(page, "Reconnect plan");
  await isLive(page);
  const ben = await openAs(browser, "Ben Lindqvist", page.url(), { offlineControl: true });
  await isLive(ben);

  await setOffline(ben, true);
  await expect(status(ben)).toHaveText("Offline – changes queued");

  // Both keep editing while Ben is cut off.
  await page.getByRole("button", { name: "Add step" }).click();
  await waitForSave(page);
  await ben.getByRole("button", { name: "Add sticky note" }).click();
  await expect(status(ben)).toHaveText("Offline – changes queued");
  await expect(ben.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  await setOffline(ben, false);
  await expect(status(ben)).toHaveText(/Saved · just now/, { timeout: 15_000 });
  await expect(ben.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(ben.getByText("New step")).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "Note" })).toHaveCount(1);
  await ben.context().close();
});

test("a viewer cannot send edits, and a socket without a token is refused", async ({ page, browser }) => {
  await newDiagram(page, "Viewer plan");
  await isLive(page);
  const diagramId = /\/app\/d\/([^/]+)/.exec(page.url())?.[1] ?? "";
  const cora = await openAs(browser, "Cora Mbeki", page.url());
  await expect(cora.getByText("Read-only")).toBeVisible();
  await expect(cora.getByRole("toolbar", { name: "Add to diagram" })).toHaveCount(0);
  await expect(people(page).getByLabel("Cora Mbeki")).toBeVisible();

  // Cora's own socket, speaking the channel protocol directly.
  const outcome = await cora.evaluate(
    async ({ api, id }) => {
      const token = window.localStorage.getItem("live-canvas.token") ?? "";
      const identifier = JSON.stringify({ channel: "DiagramChannel", diagram_id: id });
      const open = (url: string) => new WebSocket(url, ["actioncable-v1-json", "actioncable-unsupported"]);
      const refusedWithoutToken = await new Promise<string>((resolve) => {
        const socket = open(`${api.replace("http", "ws")}/cable`);
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data)) as { type?: string; reason?: string };
          if (message.type === "disconnect") resolve(message.reason ?? "");
        };
        socket.onclose = () => resolve("closed");
      });
      const rejection = await new Promise<unknown>((resolve) => {
        const socket = open(`${api.replace("http", "ws")}/cable?token=${encodeURIComponent(token)}`);
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data)) as { type?: string; message?: { type?: string } };
          if (message.type === "welcome") socket.send(JSON.stringify({ command: "subscribe", identifier }));
          if (message.type === "confirm_subscription") {
            const op = { type: "node.remove", id: "anything" };
            socket.send(
              JSON.stringify({
                command: "message",
                identifier,
                data: JSON.stringify({ action: "submit", clientOpId: "1", op }),
              }),
            );
          }
          if (message.message?.type === "rejected") resolve(message.message);
        };
      });
      return { refusedWithoutToken, rejection };
    },
    { api: API, id: diagramId },
  );

  expect(outcome.refusedWithoutToken).toBe("unauthorized");
  expect(outcome.rejection).toEqual({
    type: "rejected",
    clientOpId: "1",
    code: "FORBIDDEN",
    message: "Your role in this workspace does not allow editing",
  });
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await cora.context().close();
});

test("turning collaboration off returns every editor to autosave", async ({ page, browser }) => {
  await newDiagram(page, "Switch plan");
  await isLive(page);
  const ben = await openAs(browser, "Ben Lindqvist", page.url());
  await isLive(ben);
  await expect(ben.getByRole("switch", { name: /Live collaboration/ })).toBeDisabled();

  const toggle = page.getByRole("switch", { name: /Live collaboration/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  for (const who of [page, ben])
    await expect(who.getByText(/Live collaboration turned off by Ada Okafor/)).toBeVisible();
  await expect(people(page)).toHaveCount(0);

  // Ben's edit now goes through a whole-document save with a revision check.
  const save = ben.waitForRequest(
    (request) => request.url().endsWith("/graphql") && (request.postData() ?? "").includes("SaveDiagram"),
  );
  await ben.getByRole("button", { name: "Add step" }).click();
  await expect(status(ben)).toHaveText("Unsaved changes");
  await save;
  await waitForSave(ben);
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  // Back on: everyone collaborates again, starting from the saved document.
  await page.getByRole("switch", { name: /Live collaboration/ }).click();
  await expect(ben.getByText(/Live collaboration turned on by Ada Okafor/)).toBeVisible();
  await expect(ben.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "Add sticky note" }).click();
  await expect(ben.locator(".react-flow__node")).toHaveCount(5);
  await ben.context().close();
});
