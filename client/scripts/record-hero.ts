import { writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import gifenc from "gifenc";
import { PNG } from "pngjs";
import { canvasNode, centreOf, signInAs, type ScreenPoint } from "../e2e/helpers";

// The README's hero animation (docs/hero.gif): Ada, on the left, adds a step
// to "Build a walnut side table", moves it into place and draws a connector to
// it; Ben, on the right, sees her cursor move and every change arrive live.
//
// Both windows are recorded with Chromium's screencast, sampled at a fixed
// frame rate, halved in size, placed side by side and encoded as a GIF with
// one palette. A pixel that did not change since the previous frame is written
// as transparent, which is what keeps the file small.

const OUTPUT = `${import.meta.dirname}/../../docs/hero.gif`;
const VIEWPORT = { width: 1280, height: 800 };
const FRAME_MS = 100;
const GAP = 8;
const GAP_COLOUR = [228, 224, 216] as const;

const { GIFEncoder, quantize, applyPalette } = gifenc;

interface Recorder {
  latest: Buffer | null;
  stop: () => Promise<void>;
}

/** Keeps the most recent screencast frame of `page` as PNG bytes. */
async function record(context: BrowserContext, page: Page): Promise<Recorder> {
  const session = await context.newCDPSession(page);
  const recorder: Recorder = {
    latest: null,
    stop: async () => {
      await session.send("Page.stopScreencast");
    },
  };
  session.on("Page.screencastFrame", (frame) => {
    recorder.latest = Buffer.from(frame.data, "base64");
    void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await session.send("Page.startScreencast", {
    format: "png",
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1,
  });
  return recorder;
}

/** The screencast has no system pointer, so Ada's window draws its own. */
const showPointer = () => {
  addEventListener("DOMContentLoaded", () => {
    const pointer = document.createElement("div");
    pointer.setAttribute("aria-hidden", "true");
    pointer.style.cssText =
      "position:fixed;left:0;top:0;width:18px;height:26px;z-index:2147483647;pointer-events:none;" +
      "clip-path:polygon(0 0,0 85%,26% 66%,45% 100%,62% 93%,44% 60%,80% 60%);" +
      "background:#1f1d1a;outline:none;transform:translate(-100px,-100px)";
    document.body.append(pointer);
    addEventListener(
      "pointermove",
      (event) => (pointer.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`),
      { capture: true },
    );
  });
};

async function openWalnutTable(context: BrowserContext, name: string, role: string) {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await signInAs(page, name);
  await page.getByLabel("Workspace").selectOption({ label: `Riverside Makers (${role})` });
  await page.getByRole("link", { name: "Build a walnut side table" }).click();
  await expect(canvasNode(page, "Cut legs and aprons")).toBeVisible();
  await expect(page.locator(".save-status")).toHaveText(/All changes saved|Saved/, { timeout: 15_000 });
  return page;
}

/**
 * Moves the mouse from `from` to `to` over `ms` milliseconds, as a person
 * would. Positions follow the clock, so a busy machine sends fewer moves
 * rather than stretching the gesture.
 */
async function glide(page: Page, from: ScreenPoint, to: ScreenPoint, ms: number) {
  const start = Date.now();
  for (let elapsed = 0; elapsed < ms; elapsed = Date.now() - start) {
    const t = elapsed / ms;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);
    await page.waitForTimeout(25);
  }
  await page.mouse.move(to.x, to.y);
}

/** Halves an RGBA image by averaging each 2 × 2 block. */
function halve(png: PNG): { data: Uint8Array; width: number; height: number } {
  const width = Math.floor(png.width / 2);
  const height = Math.floor(png.height / 2);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = (2 * y * png.width + 2 * x) * 4;
      const b = a + png.width * 4;
      const out = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const sum =
          (png.data[a + c] ?? 0) + (png.data[a + 4 + c] ?? 0) + (png.data[b + c] ?? 0) + (png.data[b + 4 + c] ?? 0);
        data[out + c] = Math.round(sum / 4);
      }
      data[out + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Places two equally sized images side by side with a gap between them. */
function sideBySide(left: ReturnType<typeof halve>, right: ReturnType<typeof halve>) {
  const width = left.width + GAP + right.width;
  const height = left.height;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    data.set(left.data.subarray(y * left.width * 4, (y + 1) * left.width * 4), y * width * 4);
    for (let x = left.width; x < left.width + GAP; x += 1) data.set([...GAP_COLOUR, 255], (y * width + x) * 4);
    data.set(right.data.subarray(y * right.width * 4, (y + 1) * right.width * 4), (y * width + left.width + GAP) * 4);
  }
  return { data, width, height };
}

function encode(frames: readonly Buffer[][]): Uint8Array {
  const images = frames.map(([left, right]) => {
    if (!left || !right) throw new Error("A frame is missing one of the two windows");
    return sideBySide(halve(PNG.sync.read(left)), halve(PNG.sync.read(right)));
  });
  const first = images[0];
  if (!first) throw new Error("Nothing was recorded");
  const { width, height } = first;

  // One palette for the whole animation, from a few frames spread over it; the
  // last entry is reserved for "unchanged" (transparent) pixels.
  const samples = [0, 0.33, 0.66, 1].map((at) => images[Math.round(at * (images.length - 1))] ?? first);
  const pool = new Uint8Array(samples.length * first.data.length);
  samples.forEach((image, index) => pool.set(image.data, index * first.data.length));
  const palette = quantize(pool, 255);
  const transparentIndex = palette.length;
  palette.push([255, 0, 255]);

  const gif = GIFEncoder();
  let previous: Uint8Array | null = null;
  for (const image of images) {
    const index = applyPalette(image.data, palette);
    const shown = index.slice();
    if (previous) for (let i = 0; i < index.length; i += 1) if (index[i] === previous[i]) index[i] = transparentIndex;
    gif.writeFrame(index, width, height, {
      palette,
      delay: FRAME_MS,
      dispose: 1,
      transparent: previous !== null,
      transparentIndex,
    });
    previous = shown;
  }
  gif.finish();
  return gif.bytes();
}

test("record docs/hero.gif", async ({ browser }) => {
  test.setTimeout(180_000);
  const adaContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await adaContext.addInitScript(showPointer);
  const benContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const ada = await openWalnutTable(adaContext, "Ada Okafor", "owner");
  const ben = await openWalnutTable(benContext, "Ben Lindqvist", "editor");
  for (const page of [ada, ben]) await page.getByRole("button", { name: "Hide shapes" }).click();
  await expect(ada.getByRole("list", { name: "People in this diagram" }).getByRole("listitem")).toHaveCount(2);

  // Park Ada's pointer over the canvas before recording starts.
  const pare = await centreOf(canvasNode(ada, "Pare tenons with a chisel"));
  let pointer = { x: pare.x - 120, y: pare.y - 260 };
  await ada.mouse.move(pointer.x, pointer.y);
  await expect(ben.locator('.peer-cursor[data-member="Ada Okafor"]')).toBeVisible();

  const recorders = [await record(adaContext, ada), await record(benContext, ben)];
  await expect.poll(() => recorders.every((recorder) => recorder.latest !== null)).toBe(true);
  // Frames are sampled on a fixed clock, except while the script only looks
  // things up, so a slow machine does not stretch the animation.
  const frames: Buffer[][] = [];
  let sampling = true;
  const sampler = setInterval(() => {
    if (sampling) frames.push(recorders.map((recorder) => recorder.latest).filter((frame) => frame !== null));
  }, FRAME_MS);
  const offCamera = async <T>(lookup: () => Promise<T>): Promise<T> => {
    sampling = false;
    try {
      return await lookup();
    } finally {
      sampling = true;
    }
  };

  await ada.waitForTimeout(500);

  // Ada adds a step from the toolbar; it lands in both windows.
  const addStep = ada.getByRole("button", { name: "Add step" });
  const [addAt, nodes] = await offCamera(() =>
    Promise.all([centreOf(addStep), ada.locator(".react-flow__node").count()]),
  );
  await glide(ada, pointer, addAt, 900);
  pointer = addAt;
  await addStep.click();
  await expect(ben.locator(".react-flow__node")).toHaveCount(nodes + 1);
  await ada.keyboard.press("Escape");
  await ada.waitForTimeout(300);

  // She drags it into the empty space above "Pare tenons with a chisel".
  const from = await offCamera(() => centreOf(canvasNode(ada, "New step")));
  await glide(ada, pointer, from, 700);
  await ada.mouse.down();
  const to = { x: pare.x, y: pare.y - 190 };
  await glide(ada, from, to, 1100);
  await ada.mouse.up();
  pointer = to;
  await ada.waitForTimeout(400);

  // And draws a connector from the new step down to "Pare tenons with a chisel".
  const connectors = (page: Page) => page.locator("[data-testid=connector]:not(.connector--ghost)");
  const [port, edges] = await offCamera(() =>
    Promise.all([centreOf(canvasNode(ada, "New step").locator(".react-flow__handle-bottom")), connectors(ben).count()]),
  );
  await glide(ada, pointer, port, 500);
  await ada.mouse.down();
  await glide(ada, port, pare, 1100);
  await ada.mouse.up();
  pointer = pare;
  await expect(connectors(ben)).toHaveCount(edges + 1);
  await glide(ada, pointer, { x: pointer.x - 60, y: pointer.y - 120 }, 700);
  await ada.waitForTimeout(1400);

  clearInterval(sampler);
  for (const recorder of recorders) await recorder.stop();
  const gif = encode(frames.filter((frame) => frame.length === 2));
  writeFileSync(OUTPUT, gif);
  expect(gif.byteLength).toBeLessThan(4 * 1024 * 1024);
  await adaContext.close();
  await benContext.close();
});
