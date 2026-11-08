import { describe, expect, it } from "vitest";
import { SIDES, type RoutePoint, type Side } from "../document/types";
import type { Box, Vec } from "../geometry/vector";
import { seededRandom } from "../test/random";
import { closestSides, portPoint } from "./anchors";
import {
  autoRoute,
  isOrthogonal,
  segmentCrossesBox,
  segmentHandles,
  simplifyVertices,
  STUB,
  type OrthogonalEnd,
} from "./orthogonal";
import {
  autoVertices,
  dragSegment,
  finishSegmentDrag,
  nudgeSegment,
  reattachEnd,
  removeSegmentEdit,
  routeThrough,
  SOURCE_VERTEX,
  startSegmentDrag,
  stepRoute,
  TARGET_VERTEX,
  toStored,
  type Vertex,
} from "./stepEdit";

const SOURCE_BOX: Box = { x: 0, y: 0, width: 100, height: 50 };
const TARGET_BOX: Box = { x: 300, y: 110, width: 100, height: 50 };

const endOf = (box: Box, side: Side): OrthogonalEnd => ({ point: portPoint(box, side), side, box });
const source = endOf(SOURCE_BOX, "right");
const target = endOf(TARGET_BOX, "left");
const xy = (vertices: readonly Vec[]) => vertices.map(({ x, y }) => ({ x, y }));

describe("autoVertices and toStored", () => {
  it("names the anchors and gives the inner vertices unique ids", () => {
    const vertices = autoVertices(source, target);
    expect(vertices[0]?.id).toBe(SOURCE_VERTEX);
    expect(vertices.at(-1)?.id).toBe(TARGET_VERTEX);
    expect(new Set(vertices.map((vertex) => vertex.id)).size).toBe(vertices.length);
    expect(xy(vertices)).toEqual(autoRoute(source, target));
  });

  it("stores the inner vertices with the axis their segment moves along", () => {
    const stored = toStored(autoVertices(source, target));
    expect(stored.map(({ x, y, axis }) => ({ x, y, axis }))).toEqual([
      { x: 120, y: 25, axis: "y" },
      { x: 200, y: 25, axis: "x" },
      { x: 200, y: 135, axis: "y" },
      { x: 280, y: 135, axis: "y" },
    ]);
  });
});

describe("segment drag", () => {
  it("moves a middle segment along its one allowed axis", () => {
    const full = autoVertices(source, target);
    const drag = startSegmentDrag(full, 2);
    expect(drag.axis).toBe("x");
    expect(drag.vertices).toHaveLength(full.length);
    const moved = dragSegment(drag, 240);
    expect(xy(moved).slice(2, 4)).toEqual([
      { x: 240, y: 25 },
      { x: 240, y: 135 },
    ]);
    expect(isOrthogonal(moved)).toBe(true);
  });

  it("inserts exactly one bend when the first movable segment is dragged 50 units, so the stub stays", () => {
    const full = autoVertices(source, target);
    const drag = startSegmentDrag(full, 1);
    expect(drag.index).toBe(2);
    const moved = dragSegment(drag, 25 + 50);
    expect(moved).toHaveLength(full.length + 1);
    expect(xy(moved).slice(0, 4)).toEqual([
      { x: 100, y: 25 },
      { x: 120, y: 25 },
      { x: 120, y: 75 },
      { x: 200, y: 75 },
    ]);
    expect(moved[1]?.id).toBe(full[1]?.id);
    expect(isOrthogonal(moved)).toBe(true);
    const stored = finishSegmentDrag(moved);
    expect(stored).toHaveLength(full.length - 1);
    expect(stored.filter((point) => point.userCreated)).toHaveLength(2);
  });

  it("inserts the bend at the target stub for the last movable segment", () => {
    const full = autoVertices(source, target);
    const drag = startSegmentDrag(full, 3);
    const moved = dragSegment(drag, 160);
    expect(xy(moved).slice(-3)).toEqual([
      { x: 280, y: 160 },
      { x: 280, y: 135 },
      { x: 300, y: 135 },
    ]);
  });

  it("inserts bends at both stubs when the only movable segment is dragged", () => {
    const straightTarget = endOf({ x: 300, y: 0, width: 100, height: 50 }, "left");
    const full = autoVertices(source, straightTarget);
    const simplified = simplifyVertices(full);
    const drag = startSegmentDrag(simplified, 1);
    const moved = dragSegment(drag, 80);
    expect(xy(moved)).toEqual([
      { x: 100, y: 25 },
      { x: 120, y: 25 },
      { x: 120, y: 80 },
      { x: 280, y: 80 },
      { x: 280, y: 25 },
      { x: 300, y: 25 },
    ]);
  });

  it("drops a bend that was dragged back into place", () => {
    const full = autoVertices(source, target);
    const drag = startSegmentDrag(full, 1);
    const stored = finishSegmentDrag(dragSegment(drag, 25));
    expect(stored.map(({ x, y }) => ({ x, y }))).toEqual(toStored(full).map(({ x, y }) => ({ x, y })));
  });

  it("nudges a segment by a fixed step", () => {
    const stored = nudgeSegment(autoVertices(source, target), 2, 5);
    expect(stored[1]).toMatchObject({ x: 205, y: 25 });
    expect(stored[2]).toMatchObject({ x: 205, y: 135 });
  });
});

describe("removing an edit", () => {
  it("returns exactly to the automatic route after deleting the only edit", () => {
    const auto = autoVertices(source, target);
    const edited = stepRoute(source, target, finishSegmentDrag(dragSegment(startSegmentDrag(auto, 1), 75)));
    const handle = segmentHandles(edited).find((entry) => entry.axis === "y" && Math.abs(entry.position.y - 75) < 1e-9);
    if (!handle) throw new Error("no handle on the dragged segment");
    expect(removeSegmentEdit(edited, handle.index, autoRoute(source, target))).toEqual([]);
    expect(xy(stepRoute(source, target, []))).toEqual(autoRoute(source, target));
  });

  it("returns to automatic after deleting a moved middle segment", () => {
    const auto = autoVertices(source, target);
    const edited = stepRoute(source, target, finishSegmentDrag(dragSegment(startSegmentDrag(auto, 2), 160)));
    expect(removeSegmentEdit(edited, 2, autoRoute(source, target))).toEqual([]);
  });

  it("keeps a route that is still more complex than the automatic one", () => {
    const auto = autoVertices(source, target);
    let stored: RoutePoint[] = finishSegmentDrag(dragSegment(startSegmentDrag(auto, 1), 75));
    let full = stepRoute(source, target, stored);
    stored = finishSegmentDrag(dragSegment(startSegmentDrag(full, full.length - 3), 150));
    full = stepRoute(source, target, stored);
    const result = removeSegmentEdit(full, 2, autoRoute(source, target));
    expect(result.length).toBeGreaterThan(0);
    expect(isOrthogonal([source.point, ...result, target.point])).toBe(true);
  });

  it("pulls a parallel neighbour onto a segment that touches a stub, or resets when nothing can merge", () => {
    const auto = autoVertices(source, target);
    const edited = stepRoute(source, target, finishSegmentDrag(dragSegment(startSegmentDrag(auto, 2), 160)));
    // Segment 1 starts at the source stub: the parallel segment 3 is pulled onto it.
    expect(removeSegmentEdit(edited, 1, autoRoute(source, target))).toEqual([]);
    const straight = simplifyVertices(autoVertices(source, endOf({ x: 300, y: 0, width: 100, height: 50 }, "left")));
    expect(removeSegmentEdit(straight, 1, straight)).toEqual([]);
    expect(removeSegmentEdit(straight, 9, straight)).toEqual(toStored(straight));
  });
});

describe("re-attachment", () => {
  it("follows a moved step: the stub and the second vertex adapt, the middle stays", () => {
    const stored = finishSegmentDrag(dragSegment(startSegmentDrag(autoVertices(source, target), 2), 240));
    const movedTarget = endOf({ ...TARGET_BOX, y: 200 }, "left");
    const route = stepRoute(source, movedTarget, stored);
    expect(isOrthogonal(route)).toBe(true);
    expect(xy(route)).toEqual([
      { x: 100, y: 25 },
      { x: 120, y: 25 },
      { x: 240, y: 25 },
      { x: 240, y: 225 },
      { x: 280, y: 225 },
      { x: 300, y: 225 },
    ]);
  });

  it("keeps a straight first leg level with the port", () => {
    const stored: RoutePoint[] = [
      { id: "a", x: 120, y: 25 },
      { id: "b", x: 160, y: 25 },
      { id: "c", x: 160, y: 135 },
      { id: "d", x: 280, y: 135 },
    ];
    const lifted = endOf({ ...SOURCE_BOX, y: -30 }, "right");
    const head = reattachEnd(stored, lifted);
    expect(xy(head).slice(0, 3)).toEqual([
      { x: 120, y: -5 },
      { x: 160, y: -5 },
      { x: 160, y: 135 },
    ]);
  });

  it("re-routes an end that would turn back through its step", () => {
    const stored: RoutePoint[] = [
      { id: "a", x: 120, y: 25 },
      { id: "b", x: 160, y: 25 },
      { id: "c", x: 160, y: 135 },
      { id: "d", x: 280, y: 135 },
    ];
    // The source moved far to the right: the old second vertex (x = 160) is now behind its new stub.
    const shifted: Box = { x: 200, y: 0, width: 100, height: 50 };
    const head = reattachEnd(stored, endOf(shifted, "right"));
    const chain = [portPoint(shifted, "right"), ...head];
    expect(isOrthogonal(chain)).toBe(true);
    for (let index = 1; index < chain.length - 1; index += 1)
      expect(segmentCrossesBox(chain[index] ?? shifted, chain[index + 1] ?? shifted, shifted)).toBe(false);
    expect(head[0]).toMatchObject({ id: "a", x: 320, y: 25 });
  });

  it("handles stubs only and falls back to the automatic route for short lists", () => {
    expect(reattachEnd([], source)).toEqual([]);
    expect(xy(reattachEnd([{ id: "a", x: 0, y: 0 }], source))).toEqual([{ x: 120, y: 25 }]);
    expect(xy(stepRoute(source, target, [{ id: "a", x: 0, y: 0 }]))).toEqual(autoRoute(source, target));
  });

  it("(property) any sequence of segment drags and step moves keeps the route orthogonal and attached", () => {
    const random = seededRandom(42);
    for (let run = 0; run < 60; run += 1) {
      let a: Box = { x: 0, y: 0, width: 120, height: 60 };
      let b: Box = { x: 400, y: 200, width: 120, height: 60 };
      let previous = closestSides({ source: a, target: b });
      let stored: RoutePoint[] = [];
      for (let step = 0; step < 25; step += 1) {
        const sides = closestSides({ source: a, target: b, previous });
        previous = sides;
        const s: OrthogonalEnd = { point: portPoint(a, sides.source), side: sides.source, box: a };
        const t: OrthogonalEnd = { point: portPoint(b, sides.target), side: sides.target, box: b };
        const full = stepRoute(s, t, stored);
        expect(isOrthogonal(full)).toBe(true);
        expect(full[0]).toMatchObject(s.point);
        expect(full.at(-1)).toMatchObject(t.point);
        const action = random.int(3);
        if (action === 0) {
          const handles = segmentHandles(full);
          const handle = handles[random.int(handles.length)];
          if (handle) {
            const drag = startSegmentDrag(full, handle.index);
            stored = finishSegmentDrag(dragSegment(drag, handle.position[handle.axis] + random.next() * 200 - 100));
          }
        } else if (action === 1) {
          b = { ...b, x: b.x + random.next() * 300 - 150, y: b.y + random.next() * 300 - 150 };
        } else {
          a = { ...a, x: a.x + random.next() * 200 - 100, y: a.y + random.next() * 200 - 100 };
        }
      }
    }
  });
});

describe("routeThrough", () => {
  it("builds an orthogonal route through sketched right-angle waypoints", () => {
    const waypoints = [
      { x: 160, y: 25 },
      { x: 160, y: 300 },
      { x: 250, y: 300 },
    ];
    const route = routeThrough(source, target, waypoints);
    expect(isOrthogonal(route)).toBe(true);
    expect(route[0]?.id).toBe(SOURCE_VERTEX);
    expect(route.at(-1)?.id).toBe(TARGET_VERTEX);
    const points = xy(route);
    for (const waypoint of waypoints.slice(1)) expect(points).toContainEqual(waypoint);
    expect(points.at(-2)).toEqual({ x: 280, y: 135 });
    expect(route.filter((vertex: Vertex) => vertex.userCreated).length).toBeGreaterThan(0);
  });

  it("works for every side pair", () => {
    for (const sourceSide of SIDES) {
      for (const targetSide of SIDES) {
        const route = routeThrough(endOf(SOURCE_BOX, sourceSide), endOf(TARGET_BOX, targetSide), [
          { x: 200, y: 80 },
          { x: 200, y: 140 },
        ]);
        expect(isOrthogonal(route)).toBe(true);
        expect(
          Math.hypot((route[1]?.x ?? 0) - (route[0]?.x ?? 0), (route[1]?.y ?? 0) - (route[0]?.y ?? 0)),
        ).toBeCloseTo(STUB, 9);
      }
    }
  });

  it("needs no final elbow when the last waypoint lines up with the target stub", () => {
    const route = routeThrough(source, target, [
      { x: 200, y: 25 },
      { x: 200, y: 135 },
    ]);
    expect(xy(route)).toEqual(autoRoute(source, target));
  });
});
