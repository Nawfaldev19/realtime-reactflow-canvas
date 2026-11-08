import { getSmoothStepPath, Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { SIDES, type Side } from "../document/types";
import { measurePath, pathData } from "../geometry/path";
import type { Box, Vec } from "../geometry/vector";
import { seededRandom } from "../test/random";
import { NORMALS, portPoint } from "./anchors";
import {
  autoRoute,
  baseVertices,
  checkRoute,
  collinear,
  connectStub,
  END_HANDLE_INSET,
  ensureOrthogonal,
  isOrthogonal,
  longestSegmentMidpoint,
  roundedPath,
  segmentCrossesBox,
  segmentHandles,
  simplifyVertices,
  STUB,
  visibleVertices,
  type OrthogonalEnd,
} from "./orthogonal";

const POSITIONS: Readonly<Record<Side, Position>> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/** All numbers in an SVG path, rounded to two decimals. */
const numbers = (d: string): number[] =>
  (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map((value) => Math.round(Number(value) * 100) / 100);

/** The path as a list of distinct points with collinear interior points removed (shape only). */
function shape(d: string): Vec[] {
  const values = numbers(d);
  let points: Vec[] = [];
  for (let index = 0; index + 1 < values.length; index += 2)
    points.push({ x: values[index] ?? 0, y: values[index + 1] ?? 0 });
  points = points.filter(
    (point, index) => index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y,
  );
  for (let changed = true; changed; ) {
    changed = false;
    for (let index = 1; index < points.length - 1; index += 1) {
      const [a, b, c] = [points[index - 1], points[index], points[index + 1]];
      if (a && b && c && collinear(a, b, c)) {
        points.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return points;
}

const end = (point: Vec, side: Side, box?: Box): OrthogonalEnd => ({ point, side, box: box ?? null });

describe("baseVertices", () => {
  it("routes right → left with the target to the right through two corners at the midpoint x", () => {
    const vertices = baseVertices(end({ x: 100, y: 50 }, "right"), end({ x: 300, y: 150 }, "left"));
    expect(vertices).toEqual([
      { x: 100, y: 50 },
      { x: 120, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 150 },
      { x: 280, y: 150 },
      { x: 300, y: 150 },
    ]);
  });

  it("degenerates to a straight line when the ports are aligned", () => {
    const vertices = baseVertices(end({ x: 50, y: 0 }, "bottom"), end({ x: 50, y: 200 }, "top"));
    expect(
      simplifyVertices(vertices).filter(
        (point, index, list) =>
          index > 0 && index < list.length - 1 && !collinear(list[index - 1] ?? point, point, list[index + 1] ?? point),
      ),
    ).toEqual([]);
    expect(roundedPath(vertices).every((segment) => segment.kind === "line")).toBe(true);
  });

  it("uses one corner for perpendicular sides and flips it so the route does not double back", () => {
    // right → top, target below-right: across, then down into the top.
    expect(baseVertices(end({ x: 100, y: 50 }, "right"), end({ x: 300, y: 200 }, "top"))[2]).toEqual({ x: 300, y: 50 });
    // right → top, target above-right: up first, then across and down.
    expect(baseVertices(end({ x: 100, y: 50 }, "right"), end({ x: 300, y: -200 }, "top"))[2]).toEqual({
      x: 120,
      y: -220,
    });
  });

  it("shortens the leading stub on the same side when the ports are within one stub of each other", () => {
    // Both on the right, the target sticks out 10 further: its stub shrinks to 10 so the corner never overlaps a stub.
    const vertices = baseVertices(end({ x: 100, y: 50 }, "right"), end({ x: 110, y: 30 }, "right"));
    expect(vertices).toEqual([
      { x: 100, y: 50 },
      { x: 120, y: 50 },
      { x: 120, y: 30 },
      { x: 120, y: 30 },
      { x: 110, y: 30 },
    ]);
    const leadingSource = baseVertices(end({ x: 100, y: 50 }, "left"), end({ x: 110, y: 30 }, "left"));
    expect(leadingSource[1]).toEqual({ x: 90, y: 50 });
  });

  it("matches the open-source smooth-step edge for every side pair (shape and rounded path)", () => {
    const targets: Vec[] = [
      { x: 300, y: 200 },
      { x: 300, y: -200 },
      { x: -300, y: 200 },
      { x: -300, y: -200 },
      { x: 10, y: 200 },
      { x: 300, y: 10 },
      { x: 5, y: 5 },
      { x: -15, y: 210 },
      { x: 0, y: 100 },
      { x: 8, y: -12 },
      { x: 100, y: 300 },
      { x: 400, y: 50 },
    ];
    let compared = 0;
    for (const sourceSide of SIDES) {
      for (const targetSide of SIDES) {
        for (const target of targets) {
          const source = { x: 100, y: 50 };
          const [library] = getSmoothStepPath({
            sourceX: source.x,
            sourceY: source.y,
            targetX: target.x,
            targetY: target.y,
            sourcePosition: POSITIONS[sourceSide],
            targetPosition: POSITIONS[targetSide],
            borderRadius: 5,
            offset: STUB,
          });
          const ours = pathData(roundedPath(baseVertices(end(source, sourceSide), end(target, targetSide))));
          expect(shape(ours)).toEqual(shape(library));
          compared += 1;
        }
      }
    }
    expect(compared).toBe(192);
  });

  it("produces only horizontal and vertical segments for all 16 side pairs (property)", () => {
    const random = seededRandom(11);
    for (let trial = 0; trial < 400; trial += 1) {
      const source = { x: random.next() * 600 - 300, y: random.next() * 600 - 300 };
      const target = { x: random.next() * 600 - 300, y: random.next() * 600 - 300 };
      const vertices = baseVertices(end(source, random.pick(SIDES)), end(target, random.pick(SIDES)));
      expect(isOrthogonal(vertices)).toBe(true);
      expect(vertices[0]).toEqual(source);
      expect(vertices.at(-1)).toEqual(target);
    }
  });
});

describe("roundedPath", () => {
  it("rounds corners with radius 5 using a quadratic through the corner", () => {
    const path = roundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(pathData(path)).toBe("M 0 0 L 95 0 Q 100 0 100 5 L 100 100");
  });

  it("caps the radius at half of each adjacent segment", () => {
    const path = roundedPath([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 100 },
      { x: 20, y: 100 },
    ]);
    expect(pathData(path)).toBe("M 0 0 L 4 0 Q 8 0 8 4 L 8 95 Q 8 100 13 100 L 20 100");
  });

  it("draws collinear and coincident vertices straight and returns nothing for fewer than two points", () => {
    expect(
      pathData(
        roundedPath([
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 0 },
          { x: 10, y: 0 },
        ]),
      ),
    ).toBe("M 0 0 L 5 0 L 10 0");
    expect(roundedPath([{ x: 1, y: 1 }])).toEqual([]);
    expect(roundedPath([])).toEqual([]);
  });

  it("never lets two corners overlap: the path is continuous and no longer than the polyline (property)", () => {
    const random = seededRandom(5);
    for (let trial = 0; trial < 100; trial += 1) {
      const vertices = baseVertices(
        end({ x: random.next() * 60, y: random.next() * 60 }, random.pick(SIDES)),
        end({ x: random.next() * 60, y: random.next() * 60 }, random.pick(SIDES)),
      );
      const path = roundedPath(vertices);
      path.forEach((segment, index) => {
        const next = path[index + 1];
        if (next) expect(next.from).toEqual(segment.to);
      });
      let polyline = 0;
      for (let index = 1; index < vertices.length; index += 1)
        polyline += Math.hypot(
          (vertices[index]?.x ?? 0) - (vertices[index - 1]?.x ?? 0),
          (vertices[index]?.y ?? 0) - (vertices[index - 1]?.y ?? 0),
        );
      expect(measurePath(path).total).toBeLessThanOrEqual(polyline + 1e-6);
    }
  });
});

describe("autoRoute", () => {
  const sourceBox: Box = { x: 0, y: 0, width: 100, height: 50 };

  it("keeps the base route when it is clear", () => {
    const targetBox: Box = { x: 300, y: 100, width: 100, height: 50 };
    const source = end(portPoint(sourceBox, "right"), "right", sourceBox);
    const target = end(portPoint(targetBox, "left"), "left", targetBox);
    expect(autoRoute(source, target)).toEqual(baseVertices(source, target));
  });

  it("goes around both steps instead of through them when the target is behind the source", () => {
    // Source right side, target to the left at the same height, entered on its left side.
    const targetBox: Box = { x: -300, y: 10, width: 100, height: 50 };
    const source = end(portPoint(sourceBox, "right"), "right", sourceBox);
    const target = end(portPoint(targetBox, "left"), "left", targetBox);
    expect(checkRoute(baseVertices(source, target), source, target).crossings).toBeGreaterThan(0);
    const route = autoRoute(source, target);
    expect(isOrthogonal(route)).toBe(true);
    expect(checkRoute(route, source, target)).toEqual({ crossings: 0, reversals: 0 });
    expect(route[1]).toEqual({ x: 120, y: 25 });
    expect(route.at(-2)).toEqual({ x: -320, y: 35 });
  });

  it("goes around when a top port must be reached from below", () => {
    const targetBox: Box = { x: 10, y: -200, width: 100, height: 50 };
    const source = end(portPoint(sourceBox, "bottom"), "bottom", sourceBox);
    const target = end(portPoint(targetBox, "top"), "top", targetBox);
    const route = autoRoute(source, target);
    expect(checkRoute(route, source, target)).toEqual({ crossings: 0, reversals: 0 });
    expect(isOrthogonal(route)).toBe(true);
  });

  it("(property) never enters either box except along a stub, for all 16 side pairs", () => {
    const random = seededRandom(23);
    let checked = 0;
    for (let trial = 0; trial < 600; trial += 1) {
      const a: Box = {
        x: random.next() * 400,
        y: random.next() * 400,
        width: 40 + random.next() * 160,
        height: 30 + random.next() * 90,
      };
      const b: Box = {
        x: random.next() * 400,
        y: random.next() * 400,
        width: 40 + random.next() * 160,
        height: 30 + random.next() * 90,
      };
      // Leave at least room for two stubs and a corridor between the boxes.
      const gapX = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
      const gapY = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
      if (Math.max(gapX, gapY) < 2 * STUB + 5) continue;
      const sourceSide = random.pick(SIDES);
      const targetSide = random.pick(SIDES);
      const source = end(portPoint(a, sourceSide), sourceSide, a);
      const target = end(portPoint(b, targetSide), targetSide, b);
      const route = autoRoute(source, target);
      expect(isOrthogonal(route)).toBe(true);
      expect(route[0]).toEqual(source.point);
      expect(route.at(-1)).toEqual(target.point);
      // The first segment is the stub: straight out along the normal (shortened only when both ports share a side).
      const stub = route[1] ?? source.point;
      const out = (stub.x - source.point.x) * NORMALS[sourceSide].x + (stub.y - source.point.y) * NORMALS[sourceSide].y;
      expect(out).toBeGreaterThanOrEqual(sourceSide === targetSide ? 1 : STUB);
      expect(out).toBeLessThanOrEqual(STUB + 1e-9);
      expect(checkRoute(route, source, target)).toEqual({ crossings: 0, reversals: 0 });
      checked += 1;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("stays orthogonal even when the steps overlap and the ports face away", () => {
    const a: Box = { x: 0, y: 0, width: 100, height: 100 };
    const b: Box = { x: 50, y: 50, width: 100, height: 100 };
    for (const sourceSide of SIDES) {
      for (const targetSide of SIDES) {
        const route = autoRoute(
          end(portPoint(a, sourceSide), sourceSide, a),
          end(portPoint(b, targetSide), targetSide, b),
        );
        expect(isOrthogonal(route)).toBe(true);
      }
    }
  });
});

describe("connectStub", () => {
  it("joins a stub to a free vertex without entering the step or turning back", () => {
    const box: Box = { x: 0, y: 0, width: 100, height: 50 };
    const start = end(portPoint(box, "right"), "right", box);
    const corners = connectStub(start, { x: -60, y: 200 });
    const chain = [start.point, { x: 120, y: 25 }, ...corners, { x: -60, y: 200 }];
    expect(isOrthogonal(chain)).toBe(true);
    for (let index = 1; index < chain.length - 1; index += 1)
      expect(segmentCrossesBox(chain[index] ?? box, chain[index + 1] ?? box, box)).toBe(false);
    expect(corners).toEqual([{ x: 120, y: 200 }]);
  });

  it("returns no corners when the vertex is straight ahead", () => {
    expect(connectStub(end({ x: 0, y: 0 }, "bottom"), { x: 0, y: 100 })).toEqual([]);
  });
});

describe("helpers", () => {
  it("finds the longest middle segment, ignoring the stubs", () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 300 },
      { x: 60, y: 300 },
      { x: 60, y: 320 },
    ];
    expect(longestSegmentMidpoint(vertices)).toEqual({ x: 20, y: 150 });
    expect(
      longestSegmentMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toEqual({ x: 5, y: 0 });
    expect(longestSegmentMidpoint([])).toEqual({ x: 0, y: 0 });
  });

  it("places segment handles at midpoints, 15 from the step on the first and last movable segments", () => {
    const vertices = baseVertices(end({ x: 100, y: 50 }, "right"), end({ x: 300, y: 150 }, "left"));
    expect(segmentHandles(vertices)).toEqual([
      { index: 1, axis: "y", position: { x: 120 + END_HANDLE_INSET, y: 50 } },
      { index: 2, axis: "x", position: { x: 200, y: 100 } },
      { index: 3, axis: "y", position: { x: 280 - END_HANDLE_INSET, y: 150 } },
    ]);
  });

  it("puts a single movable segment's handle at its midpoint and skips zero-length segments", () => {
    expect(
      segmentHandles([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 180, y: 0 },
        { x: 200, y: 0 },
      ]),
    ).toEqual([{ index: 1, axis: "y", position: { x: 100, y: 0 } }]);
    expect(
      segmentHandles([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 40 },
        { x: 40, y: 40 },
        { x: 60, y: 40 },
      ]),
    ).toEqual([
      { index: 2, axis: "x", position: { x: 20, y: 20 } },
      { index: 3, axis: "y", position: { x: 30, y: 40 } },
    ]);
  });

  it("simplifies duplicates and collinear points but keeps the anchors and stubs", () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 40, y: 60 },
      { x: 60, y: 60 },
      { x: 80, y: 60 },
    ];
    expect(simplifyVertices(vertices)).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
      { x: 60, y: 60 },
      { x: 80, y: 60 },
    ]);
  });

  it("inserts elbows into diagonal segments, continuing the previous direction", () => {
    expect(
      ensureOrthogonal([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 30, y: 40 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 },
    ]);
    expect(
      ensureOrthogonal([
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 30, y: 40 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 0, y: 40 },
      { x: 30, y: 40 },
    ]);
    expect(
      ensureOrthogonal([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ]);
    expect(ensureOrthogonal([])).toEqual([]);
  });

  it("tests segments against box interiors, not borders", () => {
    const box: Box = { x: 0, y: 0, width: 100, height: 50 };
    expect(segmentCrossesBox({ x: -10, y: 25 }, { x: 50, y: 25 }, box)).toBe(true);
    expect(segmentCrossesBox({ x: -10, y: 0 }, { x: 150, y: 0 }, box)).toBe(false);
    expect(segmentCrossesBox({ x: 120, y: -10 }, { x: 120, y: 60 }, box)).toBe(false);
    expect(segmentCrossesBox({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0, width: 0.5, height: 0.5 })).toBe(false);
  });

  it("judges routes by how they look: collinear back-and-forth is not a reversal, leaving the wrong way is", () => {
    const source = end({ x: 100, y: 25 }, "right");
    const target = end({ x: 300, y: 200 }, "left");
    expect(
      checkRoute(
        [
          { x: 100, y: 25 },
          { x: 120, y: 25 },
          { x: 110, y: 25 },
          { x: 110, y: 200 },
          { x: 280, y: 200 },
          { x: 300, y: 200 },
        ],
        source,
        target,
      ).reversals,
    ).toBe(0);
    expect(
      checkRoute(
        [
          { x: 100, y: 25 },
          { x: 90, y: 25 },
          { x: 90, y: 200 },
          { x: 300, y: 200 },
        ],
        source,
        target,
      ).reversals,
    ).toBe(1);
    expect(
      checkRoute(
        [
          { x: 100, y: 25 },
          { x: 120, y: 25 },
          { x: 120, y: 200 },
          { x: 320, y: 200 },
          { x: 300, y: 200 },
        ],
        source,
        target,
      ).reversals,
    ).toBe(0);
    expect(
      checkRoute(
        [
          { x: 100, y: 25 },
          { x: 120, y: 25 },
          { x: 120, y: 180 },
          { x: 300, y: 180 },
          { x: 300, y: 200 },
        ],
        source,
        target,
      ).reversals,
    ).toBe(1);
    expect(checkRoute([{ x: 100, y: 25 }], source, target)).toEqual({ crossings: 0, reversals: 0 });
  });

  it("removes duplicates and spikes from the visible route", () => {
    expect(
      visibleVertices([
        { x: 0, y: 0 },
        { x: 0, y: 20 },
        { x: 0, y: 20 },
        { x: 0, y: 0 },
        { x: 0, y: 40 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
    ]);
    expect(
      visibleVertices([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("draws close, aligned ports with overlapping stubs as a straight line without a detour", () => {
    // Two steps 20 apart, bottom port straight above the top port: the stubs overlap.
    const upper: Box = { x: 0, y: 0, width: 100, height: 60 };
    const lower: Box = { x: 0, y: 80, width: 100, height: 60 };
    const source = end(portPoint(upper, "bottom"), "bottom", upper);
    const target = end(portPoint(lower, "top"), "top", lower);
    const route = autoRoute(source, target);
    expect(visibleVertices(route)).toEqual([
      { x: 50, y: 60 },
      { x: 50, y: 80 },
    ]);
  });
});
