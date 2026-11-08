import type { InternalNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { DiagramNode } from "../../document/types";
import { node } from "../../test/fixtures";
import { GHOST_NODE_ID, type CanvasNode } from "../flowAdapter";
import { endTargetAt, isEmptyCanvas, nearPort, nodeHits } from "./hits";

function internal(model: DiagramNode, x: number, y: number, z = 1, measured = true): InternalNode<CanvasNode> {
  return {
    id: model.id,
    position: { x, y },
    data: { node: model },
    width: 100,
    height: 60,
    measured: measured ? { width: 100, height: 60 } : {},
    internals: { positionAbsolute: { x, y }, z, userNode: {} },
  } as unknown as InternalNode<CanvasNode>;
}

const lookup = new Map<string, InternalNode<CanvasNode>>([
  ["a", internal(node("a"), 0, 0)],
  ["b", internal(node("b"), 300, 0, 2, false)],
  ["n", internal(node("n", { kind: "note" }), 0, 300)],
  [GHOST_NODE_ID, internal(node(GHOST_NODE_ID), 600, 0)],
]);

describe("hit tests on live nodes", () => {
  it("lists every real node with its box, rank and connectability", () => {
    expect(nodeHits(lookup)).toEqual([
      { id: "a", box: { x: 0, y: 0, width: 100, height: 60 }, rank: 1, connectable: true },
      { id: "b", box: { x: 300, y: 0, width: 100, height: 60 }, rank: 2, connectable: true },
      { id: "n", box: { x: 0, y: 300, width: 100, height: 60 }, rank: 1, connectable: false },
    ]);
  });

  it("finds the nearest port within a radius", () => {
    expect(nearPort(lookup, "b", { x: 395, y: 35 }, 30)).toBe("right");
    expect(nearPort(lookup, "b", { x: 350, y: 30 }, 10)).toBeNull();
    expect(nearPort(lookup, "missing", { x: 0, y: 0 }, 30)).toBeNull();
  });

  it("lands a dragged end on a port (30 screen px, scaled by zoom) or in a drop zone", () => {
    expect(endTargetAt(lookup, { x: 290, y: 30 }, 1, new Set(["a"]))).toEqual({ nodeId: "b", side: "left" });
    expect(endTargetAt(lookup, { x: 260, y: 30 }, 2, new Set(["a"]))).toBeNull();
    expect(endTargetAt(lookup, { x: 350, y: 30 }, 1, new Set(["a"]))).toEqual({ nodeId: "b", side: null });
    expect(endTargetAt(lookup, { x: 350, y: 30 }, 1, new Set(["b"]))).toBeNull();
    expect(endTargetAt(lookup, { x: 50, y: 300 }, 0, new Set())).toBeNull();
  });

  it("treats a node without any size as a point", () => {
    const bare = {
      ...internal(node("z"), 900, 900),
      width: undefined,
      height: undefined,
      measured: {},
    } as unknown as InternalNode<CanvasNode>;
    const only = new Map([["z", bare]]);
    expect(nodeHits(only)[0]?.box).toEqual({ x: 900, y: 900, width: 0, height: 0 });
    expect(nearPort(only, "z", { x: 900, y: 900 }, 5)).toBe("top");
  });

  it("tells empty canvas from a step", () => {
    expect(isEmptyCanvas(lookup, { x: 200, y: 200 })).toBe(true);
    expect(isEmptyCanvas(lookup, { x: 50, y: 30 })).toBe(false);
  });
});
