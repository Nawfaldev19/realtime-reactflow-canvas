import { describe, expect, it } from "vitest";
import { dagreLayout } from "./dagre";
import type { FlatGraph, LayoutOptions } from "./types";

const TB: LayoutOptions = { direction: "TB", nodeSep: 80, rankSep: 100 };

const chain: FlatGraph = {
  nodes: [
    { id: "a", width: 100, height: 40 },
    { id: "b", width: 100, height: 40 },
    { id: "c", width: 60, height: 20 },
  ],
  edges: [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "c", target: "c" },
    { source: "a", target: "missing" },
  ],
};

describe("dagreLayout", () => {
  it("returns top-left corners from dagre's centres, starting at the origin", () => {
    const placement = dagreLayout(chain, TB);
    expect(placement.a).toEqual({ x: 0, y: 0 });
    expect(placement.b).toEqual({ x: 0, y: 140 });
    // The smaller node is centred under the others: centre x 50 → left 20.
    expect(placement.c).toEqual({ x: 20, y: 280 });
  });

  it("runs left to right", () => {
    const placement = dagreLayout(chain, { ...TB, direction: "LR" });
    expect((placement.a?.x ?? 0) < (placement.b?.x ?? 0) && (placement.b?.x ?? 0) < (placement.c?.x ?? 0)).toBe(true);
    expect(placement.a?.y).toBe(placement.b?.y);
  });

  it("separates nodes in one rank by the node separation and is deterministic", () => {
    const fork: FlatGraph = {
      nodes: ["r", "x", "y"].map((id) => ({ id, width: 100, height: 40 })),
      edges: [
        { source: "r", target: "x" },
        { source: "r", target: "y" },
      ],
    };
    const placement = dagreLayout(fork, TB);
    expect(Math.abs((placement.y?.x ?? 0) - (placement.x?.x ?? 0))).toBe(180);
    expect(dagreLayout(fork, TB)).toEqual(placement);
  });

  it("returns an empty placement for an empty graph", () => {
    expect(dagreLayout({ nodes: [], edges: [] }, TB)).toEqual({});
  });
});
