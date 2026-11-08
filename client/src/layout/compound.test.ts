import { describe, expect, it } from "vitest";
import { GROUP_INSET, layoutCompound, type LayoutTree, type TreeNode } from "./compound";
import { layeredLayout } from "./layered";
import type { LayoutOptions } from "./types";

const TB: LayoutOptions = { direction: "TB", nodeSep: 80, rankSep: 100 };
const leaf = (id: string, width = 100, height = 40): TreeNode => ({ id, width, height, children: null });

describe("layoutCompound", () => {
  it("lays out a group's children inside it and sizes the group to fit", () => {
    const tree: LayoutTree = {
      roots: [leaf("x"), { id: "g", width: 50, height: 50, children: [leaf("a"), leaf("b")] }],
      edges: [
        { source: "a", target: "b" },
        { source: "x", target: "a" },
      ],
    };
    const { positions, sizes } = layoutCompound(tree, layeredLayout, TB);
    expect(positions.a).toEqual({ x: GROUP_INSET.side, y: GROUP_INSET.top });
    expect(positions.b).toEqual({ x: GROUP_INSET.side, y: GROUP_INSET.top + 140 });
    expect(sizes.g).toEqual({ width: 100 + GROUP_INSET.side * 2, height: 180 + GROUP_INSET.top + GROUP_INSET.bottom });
    // x → a is lifted to x → g, so the group goes below x.
    expect(positions.x?.y).toBe(0);
    expect(positions.g?.y).toBe(140);
  });

  it("handles three levels of nesting and keeps empty groups at their size", () => {
    const tree: LayoutTree = {
      roots: [
        {
          id: "outer",
          width: 10,
          height: 10,
          children: [
            { id: "inner", width: 10, height: 10, children: [leaf("deep")] },
            { id: "empty", width: 70, height: 60, children: [] },
          ],
        },
      ],
      edges: [{ source: "deep", target: "empty" }],
    };
    const { positions, sizes } = layoutCompound(tree, layeredLayout, TB);
    expect(sizes.inner).toEqual({ width: 150, height: 110 });
    expect(sizes.empty).toBeUndefined();
    expect(positions.deep).toEqual({ x: 25, y: 45 });
    // deep → empty is lifted to inner → empty inside the outer group.
    expect(positions.inner?.y).toBe(45);
    expect(positions.empty?.y).toBe(45 + 110 + 100);
    expect(sizes.outer?.height).toBe(45 + 110 + 100 + 60 + 25);
  });

  it("ignores connectors to nodes outside the tree", () => {
    const { positions } = layoutCompound(
      { roots: [leaf("a")], edges: [{ source: "a", target: "ghost" }] },
      layeredLayout,
      TB,
    );
    expect(positions).toEqual({ a: { x: 0, y: 0 } });
  });
});
