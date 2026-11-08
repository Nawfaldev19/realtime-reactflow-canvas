import { describe, expect, it } from "vitest";
import { dropTargetAt, dropZone, nodeAtPoint, type NodeHit } from "./connect";

const step = (id: string, x: number, y: number, rank = 1, connectable = true): NodeHit => ({
  id,
  box: { x, y, width: 100, height: 60 },
  rank,
  connectable,
});

describe("drop zones", () => {
  it("cover the central 70% of a step", () => {
    expect(dropZone({ x: 0, y: 0, width: 100, height: 60 })).toEqual({ x: 15, y: 9, width: 70, height: 42 });
  });

  it("connect anywhere inside the zone, but not near the edge", () => {
    const nodes = [step("a", 0, 0), step("b", 300, 0)];
    expect(dropTargetAt(nodes, { x: 316, y: 10 }, new Set(["a"]))).toBe("b");
    expect(dropTargetAt(nodes, { x: 384, y: 50 }, new Set(["a"]))).toBe("b");
    expect(dropTargetAt(nodes, { x: 305, y: 30 }, new Set(["a"]))).toBeNull();
    expect(dropTargetAt(nodes, { x: 200, y: 30 }, new Set(["a"]))).toBeNull();
  });

  it("never connects to a source or an unconnectable node, and prefers the front-most node", () => {
    const nodes = [step("group", 0, 0, -1), step("child", 20, 10, 5), step("note", 500, 0, 2, false)];
    expect(dropTargetAt(nodes, { x: 50, y: 30 }, new Set())).toBe("child");
    expect(dropTargetAt(nodes, { x: 50, y: 30 }, new Set(["child"]))).toBeNull();
    expect(dropTargetAt(nodes, { x: 550, y: 30 }, new Set())).toBeNull();
    // Inside the child's frame but outside its zone: nothing, not the group behind it.
    expect(dropTargetAt(nodes, { x: 22, y: 12 }, new Set())).toBeNull();
  });

  it("finds the node under a point", () => {
    expect(nodeAtPoint([step("a", 0, 0), step("b", 50, 0, 3)], { x: 60, y: 10 })?.id).toBe("b");
    expect(nodeAtPoint([step("a", 0, 0)], { x: 260, y: 10 })).toBeNull();
  });
});
