import { describe, expect, it } from "vitest";
import type { RoutePoint } from "../document/types";
import { pointIdBetween } from "./ids";
import {
  arrowOffset,
  insertPoint,
  movePoint,
  removePoint,
  routeHandles,
  snapToAnchors,
  SOURCE_POINT,
  TARGET_POINT,
} from "./pointEdit";

const P1: RoutePoint = { id: "p1", x: 100, y: 0, userCreated: true };
const P2: RoutePoint = { id: "p2", x: 200, y: 50, userCreated: true };

describe("routeHandles", () => {
  it("lists [add0, point1, add1, point2, add2] with ids derived from the neighbours", () => {
    const adds = [
      { x: 50, y: 0 },
      { x: 150, y: 25 },
      { x: 250, y: 25 },
    ];
    const handles = routeHandles([P1, P2], adds);
    expect(handles.map((handle) => handle.kind)).toEqual(["add", "point", "add", "point", "add"]);
    expect(handles[0]).toEqual({
      kind: "add",
      id: pointIdBetween(SOURCE_POINT, "p1"),
      insertAt: 0,
      position: { x: 50, y: 0 },
    });
    expect(handles[2]).toMatchObject({ id: pointIdBetween("p1", "p2"), insertAt: 1 });
    expect(handles[4]).toMatchObject({ id: pointIdBetween("p2", TARGET_POINT), insertAt: 2 });
    expect(handles[1]).toEqual({ kind: "point", id: "p1", index: 0, position: { x: 100, y: 0 } });
  });

  it("has a single add handle for a route without points, and skips missing positions", () => {
    expect(routeHandles([], [{ x: 1, y: 1 }])).toEqual([
      { kind: "add", id: pointIdBetween(SOURCE_POINT, TARGET_POINT), insertAt: 0, position: { x: 1, y: 1 } },
    ]);
    expect(routeHandles([P1], [])).toEqual([{ kind: "point", id: "p1", index: 0, position: { x: 100, y: 0 } }]);
  });

  it("keeps the handle id when the add handle turns into a point", () => {
    const [add] = routeHandles([], [{ x: 10, y: 10 }]);
    if (add?.kind !== "add") throw new Error("expected an add handle");
    const points = insertPoint([], add.insertAt, add.id, add.position);
    expect(routeHandles(points, []).map((handle) => handle.id)).toEqual([add.id]);
  });
});

describe("editing points", () => {
  it("inserts, moves and removes", () => {
    const inserted = insertPoint([P1, P2], 1, "new", { x: 150, y: 5 });
    expect(inserted.map((point) => point.id)).toEqual(["p1", "new", "p2"]);
    expect(inserted[1]).toEqual({ id: "new", x: 150, y: 5, userCreated: true });
    expect(movePoint(inserted, "new", { x: 1, y: 2 })[1]).toMatchObject({ x: 1, y: 2 });
    const unchanged = [P1];
    expect(movePoint(unchanged, "missing", { x: 0, y: 0 })).toBe(unchanged);
  });

  it("focuses the previous user point after a removal, or the connector when there is none", () => {
    expect(removePoint([P1, P2], "p2")).toEqual({ points: [P1], focus: "p1" });
    expect(removePoint([P1, P2], "p1")).toEqual({ points: [P2], focus: null });
    expect(removePoint([P1], "missing")).toEqual({ points: [P1], focus: null });
  });
});

describe("snapToAnchors", () => {
  const anchors = [
    { x: 100, y: 300 },
    { x: 400, y: 20 },
  ];

  it("snaps x = 104 to the source x = 100 at zoom 1", () => {
    expect(snapToAnchors({ x: 104, y: 150 }, anchors, 1)).toEqual({
      point: { x: 100, y: 150 },
      guideX: 100,
      guideY: null,
    });
  });

  it("measures the threshold in screen pixels: at zoom 0.5 it snaps from x = 112 but not x = 115", () => {
    expect(snapToAnchors({ x: 112, y: 150 }, anchors, 0.5).point.x).toBe(100);
    expect(snapToAnchors({ x: 115, y: 150 }, anchors, 0.5).point.x).toBe(115);
    expect(snapToAnchors({ x: 104, y: 150 }, anchors, 2).point.x).toBe(104);
  });

  it("uses the signed difference, so points on either side snap alike", () => {
    expect(snapToAnchors({ x: 95, y: 150 }, anchors, 1).point.x).toBe(100);
    expect(snapToAnchors({ x: 405, y: 150 }, anchors, 1).point.x).toBe(400);
  });

  it("applies x and y snaps together and picks the nearest anchor per axis", () => {
    expect(snapToAnchors({ x: 103, y: 23 }, anchors, 1)).toEqual({ point: { x: 100, y: 20 }, guideX: 100, guideY: 20 });
    expect(
      snapToAnchors(
        { x: 103, y: 23 },
        [
          { x: 98, y: 0 },
          { x: 104, y: 0 },
        ],
        1,
      ).point.x,
    ).toBe(104);
  });

  it("treats a non-positive zoom as 1", () => {
    expect(snapToAnchors({ x: 106, y: 0 }, anchors, 0).point.x).toBe(100);
  });
});

describe("arrowOffset", () => {
  it("nudges by 5, or by 1 with Alt, and ignores other keys", () => {
    expect(arrowOffset("ArrowLeft", false)).toEqual({ x: -5, y: 0 });
    expect(arrowOffset("ArrowDown", true)).toEqual({ x: 0, y: 1 });
    expect(arrowOffset("ArrowUp", false)).toEqual({ x: 0, y: -5 });
    expect(arrowOffset("ArrowRight", true)).toEqual({ x: 1, y: 0 });
    expect(arrowOffset("Enter", false)).toBeNull();
  });
});
