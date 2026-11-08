import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import {
  centredOffset,
  cssPolygon,
  cylinderCap,
  horizontalSpan,
  isShapeKind,
  outlinePolygon,
  roundedPolygonPath,
  SHAPE_KINDS,
  shapePaths,
  sideAnchors,
  textPolygon,
  verticalSpan,
  wrapGuides,
} from "./shapes";
import { distance, type Vec } from "./vector";

/** Distance from a point to the nearest edge of a closed polygon. */
function distanceToOutline(polygon: readonly Vec[], point: Vec): number {
  let best = Infinity;
  polygon.forEach((a, index) => {
    const b = polygon[(index + 1) % polygon.length] ?? a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t =
      dx === 0 && dy === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, distance(point, { x: a.x + t * dx, y: a.y + t * dy }));
  });
  return best;
}

describe("outline vertices", () => {
  it("places the diamond at the side midpoints", () => {
    expect(outlinePolygon("diamond", 200, 100)).toEqual([
      { x: 100, y: 0 },
      { x: 200, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 50 },
    ]);
  });

  it("insets every vertex by half the stroke", () => {
    expect(outlinePolygon("diamond", 200, 100, 1)).toEqual([
      { x: 100, y: 1 },
      { x: 199, y: 50 },
      { x: 100, y: 99 },
      { x: 1, y: 50 },
    ]);
  });

  it("uses flat hexagon edges from 0.23w to 0.77w", () => {
    expect(outlinePolygon("hexagon", 100, 100).map((point) => [Math.round(point.x), point.y])).toEqual([
      [23, 0],
      [77, 0],
      [100, 50],
      [77, 100],
      [23, 100],
      [0, 50],
    ]);
  });

  it("samples the ellipse with 16 points per side, all on the ellipse", () => {
    const polygon = outlinePolygon("circle", 200, 100);
    expect(polygon).toHaveLength(64);
    for (const point of polygon) expect(((point.x - 100) / 100) ** 2 + ((point.y - 50) / 50) ** 2).toBeCloseTo(1, 9);
  });

  it("builds the cylinder from two half ellipses joined by straight sides", () => {
    expect(cylinderCap(100, 200)).toBe(24);
    expect(cylinderCap(40, 400)).toBe(10);
    const polygon = outlinePolygon("cylinder", 100, 200);
    expect(polygon[0]?.x).toBeCloseTo(0, 9);
    expect(polygon[0]?.y).toBeCloseTo(24, 9);
    expect(polygon.some((point) => Math.abs(point.y) < 1e-9 && Math.abs(point.x - 50) < 1e-9)).toBe(true);
    expect(polygon.at(-1)?.y).toBeCloseTo(176, 9);
  });

  it("recognizes shape kinds", () => {
    expect(SHAPE_KINDS.every(isShapeKind)).toBe(true);
    expect(isShapeKind("octagon")).toBe(false);
  });
});

describe("rounded corners", () => {
  it("replaces each corner with a quadratic curve 4px either side of the vertex", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(roundedPolygonPath(square)).toBe(
      "M 0 4 Q 0 0 4 0 L 96 0 Q 100 0 100 4 L 100 96 Q 100 100 96 100 L 4 100 Q 0 100 0 96 Z",
    );
  });

  it("shrinks the radius on short edges so corners never overlap", () => {
    const path = roundedPolygonPath([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 100 },
    ]);
    expect(path).toContain("Q 0 0 2 0");
    expect(path).toContain("Q 4 0 4 2");
  });

  it("tolerates repeated vertices and returns nothing for fewer than three points", () => {
    expect(
      roundedPolygonPath([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe("");
    expect(
      roundedPolygonPath([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toMatch(/^M .* Z$/);
  });
});

describe("shapePaths", () => {
  it("draws the ellipse with arcs inset by half the stroke", () => {
    expect(shapePaths("circle", 100, 50, 2)).toEqual({
      outline: "M 1 25 A 49 24 0 1 0 99 25 A 49 24 0 1 0 1 25 Z",
      detail: null,
    });
  });

  it("draws the cylinder body and the front rim of its top cap", () => {
    // Inner box 98 × 198, cap = min(198 × 0.12, 98 × 0.25) = 23.76.
    const { outline, detail } = shapePaths("cylinder", 100, 200, 2);
    expect(outline).toBe("M 1 24.76 A 49 23.76 0 0 1 99 24.76 L 99 175.24 A 49 23.76 0 0 1 1 175.24 Z");
    expect(detail).toBe("M 1 24.76 A 49 23.76 0 0 0 99 24.76");
  });

  it("draws straight-edged shapes as softened polygons", () => {
    for (const kind of ["diamond", "hexagon", "triangle", "parallelogram"] as const) {
      const { outline, detail } = shapePaths(kind, 120, 80);
      expect(outline).toMatch(/^M [\d. ]+ Q/);
      expect(detail).toBeNull();
    }
  });
});

describe("spans", () => {
  const diamond = outlinePolygon("diamond", 200, 100);

  it("finds where a horizontal line crosses the outline", () => {
    expect(horizontalSpan(diamond, 25)).toEqual([50, 150]);
    expect(horizontalSpan(diamond, 0)).toEqual([100, 100]);
    expect(horizontalSpan(diamond, -1)).toBeNull();
  });

  it("finds where a vertical line crosses the outline", () => {
    expect(verticalSpan(outlinePolygon("triangle", 100, 100), 50)).toEqual([0, 100]);
    expect(verticalSpan(diamond, 300)).toBeNull();
  });

  it("includes horizontal edges that lie on the line", () => {
    expect(horizontalSpan(outlinePolygon("hexagon", 100, 100), 0)).toEqual([23, 77]);
  });
});

describe("side anchors", () => {
  it("are the box side midpoints for the diamond", () => {
    expect(sideAnchors("diamond", 200, 100)).toEqual({
      top: { x: 100, y: 0 },
      right: { x: 200, y: 50 },
      bottom: { x: 100, y: 100 },
      left: { x: 0, y: 50 },
    });
  });

  it("move onto the slanted edges of the triangle and the parallelogram", () => {
    expect(sideAnchors("triangle", 100, 100)).toMatchObject({
      left: { x: 25, y: 50 },
      right: { x: 75, y: 50 },
      top: { x: 50, y: 0 },
    });
    expect(sideAnchors("parallelogram", 100, 100)).toMatchObject({ left: { x: 10, y: 50 }, right: { x: 90, y: 50 } });
  });

  it("every side midpoint lies within 1px of the outline for shapes that touch their box sides", () => {
    for (const kind of ["diamond", "hexagon", "circle", "cylinder"] as const) {
      for (const [w, h] of [
        [80, 60],
        [200, 100],
        [400, 400],
      ] as const) {
        const polygon = outlinePolygon(kind, w, h);
        for (const midpoint of [
          { x: w / 2, y: 0 },
          { x: w, y: h / 2 },
          { x: w / 2, y: h },
          { x: 0, y: h / 2 },
        ]) {
          expect(distanceToOutline(polygon, midpoint)).toBeLessThan(1);
        }
      }
    }
  });

  it("anchors always lie on the outline", () => {
    for (const kind of SHAPE_KINDS) {
      const polygon = outlinePolygon(kind, 160, 90);
      const { top, right, bottom, left } = sideAnchors(kind, 160, 90);
      for (const anchor of [top, right, bottom, left]) expect(distanceToOutline(polygon, anchor)).toBeLessThan(0.01);
    }
  });
});

describe("text wrap guides", () => {
  it("are dropped below 40px", () => {
    expect(wrapGuides("diamond", 39, 200)).toBeNull();
    expect(wrapGuides("diamond", 200, 39)).toBeNull();
  });

  it("cover the diamond's outside on each half, stepping across at the tips (hand-computed rows)", () => {
    const guides = wrapGuides("diamond", 200, 100, { padding: 0, rows: 4 });
    expect(guides?.left).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 25 },
      { x: 50, y: 25 },
      { x: 0, y: 50 },
      { x: 50, y: 75 },
      { x: 100, y: 75 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(guides?.right).toEqual([
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 25 },
      { x: 50, y: 25 },
      { x: 100, y: 50 },
      { x: 50, y: 75 },
      { x: 0, y: 75 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ]);
  });

  it("block the cylinder's top cap entirely", () => {
    const guides = wrapGuides("cylinder", 100, 200, { padding: 0, rows: 10 });
    const capRow = guides?.left.find((point) => point.y === 20);
    expect(capRow?.x).toBe(50);
    expect(textPolygon("cylinder", 100, 200)[0]).toEqual({ x: 0, y: 48 });
  });

  it("never let text outside the outline, at any height between sampled rows", () => {
    const random = seededRandom(7).next;
    const sizes: (readonly [number, number])[] = [
      [80, 60],
      [200, 100],
      [400, 400],
    ];
    for (const kind of SHAPE_KINDS) {
      for (const [w, h] of sizes) {
        const guides = wrapGuides(kind, w, h, { padding: 0 });
        if (!guides) throw new Error("expected guides");
        const polygon = textPolygon(kind, w, h);
        for (let sample = 0; sample < 200; sample += 1) {
          const y = random() * h;
          const left = interpolate(guides.left, y);
          const right = interpolate(guides.right, y) + w / 2;
          if (left >= right - 1e-9) continue;
          const span = horizontalSpan(polygon, y);
          if (!span) throw new Error(`${kind} ${String(w)}x${String(h)}: open row at ${String(y)} outside the shape`);
          // Guide points are rounded to 0.01px; allow a tenth of a pixel.
          expect(left).toBeGreaterThanOrEqual(span[0] - 0.1);
          expect(right).toBeLessThanOrEqual(span[1] + 0.1);
        }
      }
    }
  });

  it("formats a CSS polygon", () => {
    expect(
      cssPolygon([
        { x: 0, y: 0 },
        { x: 1.234, y: 5 },
      ]),
    ).toBe("polygon(0px 0px, 1.23px 5px)");
  });
});

/** The guide boundary at height y (the inner edge between consecutive rows). */
function interpolate(points: readonly Vec[], y: number): number {
  const inner = points.slice(1, -1);
  for (let index = 0; index < inner.length - 1; index += 1) {
    const a = inner[index];
    const b = inner[index + 1];
    if (!a || !b || y < a.y || y > b.y) continue;
    return b.y === a.y ? Math.max(a.x, b.x) : a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
  }
  return inner.at(-1)?.x ?? 0;
}

describe("centredOffset", () => {
  it("centres text vertically and never goes negative", () => {
    expect(centredOffset(100, 40)).toBe(30);
    expect(centredOffset(40, 100)).toBe(0);
  });
});
