import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import { constrainViewport, PAN_PADDING, panExtent } from "./panBounds";

const CANVAS = { width: 1100, height: 800 };

describe("pan extent", () => {
  it("contains the bounds plus exactly the padding on each side", () => {
    expect(panExtent({ x: -100, y: 50, width: 400, height: 1000 })).toEqual([
      [-100 - PAN_PADDING, 50 - PAN_PADDING],
      [300 + PAN_PADDING, 1050 + PAN_PADDING],
    ]);
    expect(panExtent({ x: 0, y: 0, width: 10, height: 10 }, 5)).toEqual([
      [-5, -5],
      [15, 15],
    ]);
  });

  it("is unbounded for an empty diagram", () => {
    expect(panExtent(null)).toBeNull();
    expect(constrainViewport({ x: 99_999, y: 0, zoom: 1 }, null, CANVAS)).toEqual({ x: 99_999, y: 0, zoom: 1 });
  });
});

describe("constraining a viewport", () => {
  const extent = panExtent({ x: 0, y: 0, width: 2000, height: 3000 }, 800);

  it("stops the left edge of the view at the extent", () => {
    // Visible left would be −2000 / 1 ... clamp to −800: x = 800.
    expect(constrainViewport({ x: 2000, y: 0, zoom: 1 }, extent, CANVAS)).toEqual({ x: 800, y: 0, zoom: 1 });
  });

  it("stops the right and bottom edges at the extent", () => {
    // maxX = 2800 at zoom 0.5: the right edge (1100 − x) / 0.5 ≤ 2800 → x ≥ −300.
    const next = constrainViewport({ x: -5000, y: -9000, zoom: 0.5 }, extent, CANVAS);
    expect(next.x).toBeCloseTo(-300, 9);
    // maxY = 3800: (800 − y) / 0.5 ≤ 3800 → y ≥ −1100.
    expect(next.y).toBeCloseTo(-1100, 9);
  });

  it("leaves a view inside the extent alone", () => {
    expect(constrainViewport({ x: -100, y: -200, zoom: 1 }, extent, CANVAS)).toEqual({ x: -100, y: -200, zoom: 1 });
  });

  it("centres an extent that is smaller than the canvas", () => {
    // Extent width 3600 × 0.1 = 360 < 1100: centred, x = 550 − 1000 × 0.1.
    const next = constrainViewport({ x: 0, y: 0, zoom: 0.1 }, extent, CANVAS);
    expect(next.x).toBeCloseTo(550 - 100, 9);
    expect(next.y).toBeCloseTo(400 - 150, 9);
  });

  it("never lets the visible area leave a larger extent (property)", () => {
    const random = seededRandom(11);
    if (!extent) throw new Error("extent expected");
    const [[minX, minY], [maxX, maxY]] = extent;
    for (let run = 0; run < 300; run += 1) {
      const zoom = 0.4 + random.next() * 1.6;
      const next = constrainViewport(
        { x: random.next() * 20_000 - 10_000, y: random.next() * 20_000 - 10_000, zoom },
        extent,
        CANVAS,
      );
      expect(-next.x / zoom).toBeGreaterThanOrEqual(minX - 1e-6);
      expect((CANVAS.width - next.x) / zoom).toBeLessThanOrEqual(maxX + 1e-6);
      expect(-next.y / zoom).toBeGreaterThanOrEqual(minY - 1e-6);
      expect((CANVAS.height - next.y) / zoom).toBeLessThanOrEqual(maxY + 1e-6);
    }
  });
});
