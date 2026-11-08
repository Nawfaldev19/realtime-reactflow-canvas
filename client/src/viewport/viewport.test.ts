import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import {
  canZoomIn,
  canZoomOut,
  centreOn,
  clampZoom,
  fitAll,
  fitWidth,
  HOME,
  MAX_ZOOM,
  MIN_ZOOM,
  openingViewport,
  restoreViewport,
  TOP_INSET,
  topAnchored,
  zoomBy,
  zoomPercent,
  zoomTo,
  type OpeningView,
  type Viewport,
} from "./viewport";

const CANVAS = { width: 1100, height: 800 };
const TALL = { x: 0, y: 0, width: 1000, height: 5000 };
const WIDE = { x: -500, y: 100, width: 2200, height: 3000 };

/** Where a flow point lands on screen. */
const screenOf = (view: Viewport, point: { x: number; y: number }) => ({
  x: point.x * view.zoom + view.x,
  y: point.y * view.zoom + view.y,
});

function expectView(actual: Viewport | null, expected: Viewport) {
  expect(actual).not.toBeNull();
  if (!actual) return;
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.zoom).toBeCloseTo(expected.zoom, 9);
}

const view = (mode: OpeningView["mode"], extra: Partial<OpeningView> = {}): OpeningView => ({
  mode,
  customPercent: 70,
  savedViewport: null,
  ...extra,
});

describe("zoom limits", () => {
  it("clamps every zoom into 10%–200% and fits into at most 100%", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(5)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5, 1)).toBe(1);
    expect(clampZoom(0.5)).toBe(0.5);
  });

  it("compares the real zoom with the limits, not the rounded label", () => {
    expect(canZoomIn(2)).toBe(false);
    expect(canZoomIn(1.996)).toBe(true);
    expect(zoomPercent(1.996)).toBe(200);
    expect(canZoomOut(0.1)).toBe(false);
    expect(canZoomOut(0.104)).toBe(true);
    expect(zoomPercent(0.7)).toBe(70);
  });
});

describe("zooming about an anchor", () => {
  it("keeps the flow point under the anchor fixed (worked example)", () => {
    // (100, 50, 1) zoomed to 2 about (550, 400): x' = 550 − 450 × 2 = −350, y' = 400 − 350 × 2 = −300.
    const next = zoomTo({ x: 100, y: 50, zoom: 1 }, 2, { x: 550, y: 400 });
    expectView(next, { x: -350, y: -300, zoom: 2 });
    expect(screenOf(next, { x: 450, y: 350 })).toEqual({ x: 550, y: 400 });
  });

  it("keeps the pointer's flow point within 0.5 px for random zooms, and stays in range", () => {
    const random = seededRandom(7);
    for (let run = 0; run < 200; run += 1) {
      const start = { x: random.next() * 2000 - 1000, y: random.next() * 2000 - 1000, zoom: 0.1 + random.next() * 1.9 };
      const anchor = { x: random.next() * 1100, y: random.next() * 800 };
      const flow = { x: (anchor.x - start.x) / start.zoom, y: (anchor.y - start.y) / start.zoom };
      const next = zoomBy(start, random.next() < 0.5 ? 1.2 : 1 / 1.2, anchor);
      const landed = screenOf(next, flow);
      expect(Math.abs(landed.x - anchor.x)).toBeLessThan(0.5);
      expect(Math.abs(landed.y - anchor.y)).toBeLessThan(0.5);
      expect(next.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(next.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });

  it("does not move when the zoom is already at the limit", () => {
    expectView(zoomBy({ x: 10, y: 20, zoom: 2 }, 1.2, { x: 0, y: 0 }), { x: 10, y: 20, zoom: 2 });
  });
});

describe("fit to width, anchored at the top", () => {
  it("clamps a narrow, tall diagram at 100% and centres it (worked example 1)", () => {
    // zoom = 1100 / (1000 × 1.1) = 1; x = 550 − 500 = 50; y = T.
    expectView(fitWidth(CANVAS, TALL), { x: 50, y: TOP_INSET, zoom: 1 });
  });

  it("fits a wide diagram with negative coordinates (worked example 2)", () => {
    const next = fitWidth(CANVAS, WIDE);
    expect(next.zoom).toBeCloseTo(1100 / 2420, 9);
    // Diagram centre x = 600 lands on the canvas centre; the top edge lands on the inset.
    expect(screenOf(next, { x: 600, y: 100 }).x).toBeCloseTo(550, 6);
    expect(screenOf(next, { x: 600, y: 100 }).y).toBeCloseTo(TOP_INSET, 6);
    expectView(next, { x: 550 - 600 * (1100 / 2420), y: 60 - 100 * (1100 / 2420), zoom: 1100 / 2420 });
  });

  it("uses a pure screen-pixel top inset, whatever the zoom", () => {
    const inset = 120;
    const next = fitWidth(CANVAS, WIDE, { topInset: inset });
    expect(screenOf(next, { x: 0, y: WIDE.y }).y).toBeCloseTo(inset, 9);
  });

  it("is idempotent", () => {
    expect(fitWidth(CANVAS, WIDE)).toEqual(fitWidth(CANVAS, WIDE));
  });

  it("never goes below 10% for an extremely wide diagram", () => {
    expect(fitWidth(CANVAS, { x: 0, y: 0, width: 100_000, height: 10 }).zoom).toBe(MIN_ZOOM);
  });

  it("falls back to fit all when the diagram has no width", () => {
    expectView(fitWidth(CANVAS, { x: 40, y: 0, width: 0, height: 300 }), { x: 550 - 40, y: 400 - 150, zoom: 1 });
  });
});

describe("fit all", () => {
  it("frames the whole diagram with a 10% margin (worked example)", () => {
    // aw = 880, ah = 640; zoom = min(0.88, 1.28) = 0.88; x = 550 − 500 × 0.88 = 110; y = 400 − 250 × 0.88 = 180.
    expectView(fitAll(CANVAS, { x: 0, y: 0, width: 1000, height: 500 }), { x: 110, y: 180, zoom: 0.88 });
  });

  it("is limited by the height for a tall diagram", () => {
    // zoom = min(880 / 1000, 640 / 5000) = 0.128.
    const next = fitAll(CANVAS, TALL);
    expect(next.zoom).toBeCloseTo(0.128, 9);
    expect(screenOf(next, { x: 500, y: 2500 }).x).toBeCloseTo(550, 6);
    expect(screenOf(next, { x: 500, y: 2500 }).y).toBeCloseTo(400, 6);
  });

  it("opens a tiny diagram at actual size, centred", () => {
    expectView(fitAll(CANVAS, { x: 10, y: 10, width: 100, height: 40 }), { x: 550 - 60, y: 400 - 30, zoom: 1 });
  });

  it("clamps a single huge step at 10%", () => {
    expect(fitAll(CANVAS, { x: 0, y: 0, width: 50_000, height: 50_000 }).zoom).toBe(MIN_ZOOM);
  });

  it("adds the offset in screen pixels, unscaled by the zoom", () => {
    const plain = fitAll(CANVAS, TALL);
    const nudged = fitAll(CANVAS, TALL, { offsetY: 20 });
    expect(nudged.y - plain.y).toBeCloseTo(20, 9);
    expect(fitAll(CANVAS, { x: 5, y: 5, width: 0, height: 0 }, { offsetY: 20 })).toEqual({ x: 545, y: 415, zoom: 1 });
  });
});

describe("top-anchored zoom (custom zoom and 100%)", () => {
  it("centres horizontally at the chosen zoom and anchors the top (custom 70%)", () => {
    // x = 550 − 500 × 0.7 = 200; y = 60 − 0 × 0.7.
    expectView(topAnchored(CANVAS, TALL, 0.7), { x: 200, y: 60, zoom: 0.7 });
  });

  it("shows 100% centred with the top edge at the inset", () => {
    // Centre x = 600: x = 550 − 600 = −50; y = 60 − 100 = −40.
    expectView(topAnchored(CANVAS, WIDE, 1), { x: -50, y: -40, zoom: 1 });
  });

  it("clamps a custom zoom into the range", () => {
    expect(topAnchored(CANVAS, TALL, 3).zoom).toBe(MAX_ZOOM);
  });
});

describe("the opening view", () => {
  it("dispatches on the mode", () => {
    expectView(openingViewport(view("fitWidth"), CANVAS, TALL), fitWidth(CANVAS, TALL));
    expectView(openingViewport(view("fitAll"), CANVAS, TALL), fitAll(CANVAS, TALL));
    expectView(openingViewport(view("custom", { customPercent: 70 }), CANVAS, TALL), { x: 200, y: 60, zoom: 0.7 });
    expectView(openingViewport(view("custom", { customPercent: 100 }), CANVAS, WIDE), { x: -50, y: -40, zoom: 1 });
  });

  it("uses a saved view verbatim apart from clamping its zoom", () => {
    const saved = { x: 12.5, y: -30, zoom: 0.75 };
    expectView(openingViewport(view("saved", { savedViewport: saved }), CANVAS, TALL), saved);
    expectView(openingViewport(view("saved", { savedViewport: { x: 1, y: 2, zoom: 9 } }), CANVAS, TALL), {
      x: 1,
      y: 2,
      zoom: 2,
    });
    expect(restoreViewport({ x: 0, y: 0, zoom: 0.01 }).zoom).toBe(MIN_ZOOM);
  });

  it("falls back to fit width when a saved view has no viewport", () => {
    expectView(openingViewport(view("saved"), CANVAS, TALL), fitWidth(CANVAS, TALL));
  });

  it("opens an empty diagram at the origin, unless a view was saved", () => {
    expect(openingViewport(view("fitAll"), CANVAS, null)).toEqual(HOME);
    expect(openingViewport(view("saved", { savedViewport: { x: 3, y: 4, zoom: 1 } }), CANVAS, null)).toEqual({
      x: 3,
      y: 4,
      zoom: 1,
    });
  });

  it("waits while the canvas has no size", () => {
    expect(openingViewport(view("fitWidth"), { width: 0, height: 800 }, TALL)).toBeNull();
    expect(openingViewport(view("fitWidth"), { width: 800, height: 0 }, TALL)).toBeNull();
  });
});

describe("helpers", () => {
  it("centres a point at a zoom", () => {
    expect(centreOn(CANVAS, { x: 100, y: 100 }, 0.5)).toEqual({ x: 500, y: 350, zoom: 0.5 });
  });
});
