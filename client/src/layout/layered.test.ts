import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import { bilayerCrossings, type Segment } from "./crossings";
import {
  breakCycles,
  buildHierarchy,
  components,
  countCrossings,
  indexEdges,
  isotonicFit,
  layeredLayout,
  layeredLayoutDetails,
  longestPathLayers,
  placeInOrder,
  reduceCrossings,
} from "./layered";
import type { FlatGraph, LayoutOptions } from "./types";

const TB: LayoutOptions = { direction: "TB", nodeSep: 80, rankSep: 100 };
const LR: LayoutOptions = { ...TB, direction: "LR" };

function graph(ids: string, edges: string, size = { width: 100, height: 40 }): FlatGraph {
  return {
    nodes: ids.split(" ").map((id) => ({ id, ...size })),
    edges: edges
      .split(" ")
      .filter(Boolean)
      .map((pair) => {
        const [source = "", target = ""] = pair.split(">");
        return { source, target };
      }),
  };
}

/** The O(E²) definition of crossings: two segments cross when their ends are in opposite orders. */
function bruteForce(segments: readonly Segment[]): number {
  let crossings = 0;
  segments.forEach((a, i) => {
    for (const b of segments.slice(i + 1)) if ((a.upper - b.upper) * (a.lower - b.lower) < 0) crossings += 1;
  });
  return crossings;
}

describe("bilayerCrossings", () => {
  it("counts hand-checked crossings", () => {
    expect(bilayerCrossings([], 0)).toBe(0);
    expect(
      bilayerCrossings(
        [
          { upper: 0, lower: 1 },
          { upper: 1, lower: 0 },
        ],
        2,
      ),
    ).toBe(1);
    // A complete bipartite K(2,2) in a fixed order crosses once; shared ends never count.
    expect(
      bilayerCrossings(
        [
          { upper: 0, lower: 0 },
          { upper: 0, lower: 1 },
          { upper: 1, lower: 0 },
          { upper: 1, lower: 1 },
        ],
        2,
      ),
    ).toBe(1);
    expect(
      bilayerCrossings(
        [
          { upper: 0, lower: 2 },
          { upper: 1, lower: 1 },
          { upper: 2, lower: 0 },
        ],
        3,
      ),
    ).toBe(3);
  });

  it("matches the brute-force count on random layers (property test)", () => {
    const random = seededRandom(11);
    for (let round = 0; round < 200; round += 1) {
      const upper = 1 + random.int(8);
      const lower = 1 + random.int(8);
      const segments = Array.from({ length: random.int(20) }, () => ({
        upper: random.int(upper),
        lower: random.int(lower),
      }));
      expect(bilayerCrossings(segments, lower)).toBe(bruteForce(segments));
    }
  });
});

describe("phases", () => {
  it("drops self-loops, repeats and edges to unknown nodes", () => {
    expect(indexEdges(graph("a b", "a>b a>b a>a b>zz a>b"))).toEqual([[0, 1]]);
  });

  it("breaks cycles by reversing back edges, keeping one edge per pair", () => {
    expect(
      breakCycles(3, [
        [0, 1],
        [1, 2],
        [2, 0],
      ]),
    ).toEqual([
      { from: 0, to: 1, reversed: false },
      { from: 1, to: 2, reversed: false },
      { from: 0, to: 2, reversed: true },
    ]);
    expect(
      breakCycles(2, [
        [0, 1],
        [1, 0],
      ]),
    ).toEqual([{ from: 0, to: 1, reversed: false }]);
  });

  it("layers by longest path from the sources", () => {
    const edges = breakCycles(4, [
      [0, 1],
      [1, 2],
      [0, 2],
      [3, 2],
    ]);
    expect(longestPathLayers(4, edges)).toEqual([0, 1, 2, 0]);
  });

  it("inserts one dummy per layer an edge crosses", () => {
    const edges = breakCycles(3, [
      [0, 1],
      [1, 2],
      [0, 2],
    ]);
    const hierarchy = buildHierarchy(3, edges, longestPathLayers(3, edges));
    expect(hierarchy.layerOf).toEqual([0, 1, 2, 1]);
    expect(hierarchy.links).toEqual([
      [0, 1],
      [1, 2],
      [0, 3],
      [3, 2],
    ]);
    expect(hierarchy.layerCount).toBe(3);
    expect(buildHierarchy(0, [], []).layerCount).toBe(0);
  });

  it("removes a crossing with barycenter sweeps", () => {
    // Layer 0: a b; layer 1: c d; a→d and b→c cross in the input order.
    const g = graph("a b c d", "a>d b>c");
    const edges = breakCycles(4, indexEdges(g));
    const hierarchy = buildHierarchy(4, edges, longestPathLayers(4, edges));
    expect(
      countCrossings(hierarchy, [
        [0, 1],
        [2, 3],
      ]),
    ).toBe(1);
    const best = reduceCrossings(hierarchy);
    expect(best.crossings).toBe(0);
    expect(best.order).toEqual([
      [0, 1],
      [3, 2],
    ]);
  });

  it("finds a crossing-free order for a planar layered graph that starts tangled", () => {
    const g = graph("r a b c x y z", "r>a r>b r>c a>z b>y c>x");
    const details = layeredLayoutDetails(g, TB);
    expect(details.crossings).toBe(0);
    expect(details.layers).toEqual([["r"], ["a", "b", "c"], ["z", "y", "x"]]);
  });

  it("fits a non-decreasing sequence by pooling violators", () => {
    expect(isotonicFit([1, 3, 2], [1, 1, 1])).toEqual([1, 2.5, 2.5]);
    expect(isotonicFit([4, 1, 1], [1, 1, 2])).toEqual([1.75, 1.75, 1.75]);
    expect(isotonicFit([], [])).toEqual([]);
    expect(placeInOrder([0, 0], [10], [1, 1])).toEqual([-5, 5]);
    expect(placeInOrder([0, 50, 20], [10, 10], [1, 1, 1])).toEqual([0, 30, 40]);
  });

  it("splits weakly connected parts in input order", () => {
    expect(
      components(5, [
        [3, 1],
        [4, 0],
      ]),
    ).toEqual([[0, 4], [1, 3], [2]]);
  });
});

describe("layeredLayout", () => {
  it("lays out a chain top to bottom with aligned centres", () => {
    const placement = layeredLayout(graph("a b c", "a>b b>c"), TB);
    expect(placement).toEqual({ a: { x: 0, y: 0 }, b: { x: 0, y: 140 }, c: { x: 0, y: 280 } });
  });

  it("centres a diamond's join under its fork, with rank and node separations", () => {
    const placement = layeredLayout(graph("a b c d", "a>b a>c b>d c>d"), TB);
    expect(placement.b).toEqual({ x: 0, y: 140 });
    expect(placement.c).toEqual({ x: 180, y: 140 });
    expect(placement.a?.x).toBe(90);
    expect(placement.d?.x).toBe(90);
    expect(placement.d?.y).toBe(280);
  });

  it("runs left to right", () => {
    const placement = layeredLayout(graph("a b c", "a>b b>c"), LR);
    expect(placement).toEqual({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 400, y: 0 } });
  });

  it("centres smaller nodes in their rank band", () => {
    const g: FlatGraph = {
      nodes: [
        { id: "a", width: 100, height: 100 },
        { id: "b", width: 100, height: 20 },
        { id: "c", width: 100, height: 40 },
      ],
      edges: [
        { source: "a", target: "c" },
        { source: "b", target: "c" },
      ],
    };
    const placement = layeredLayout(g, TB);
    expect(placement.b?.y).toBe(40);
    expect(placement.c?.y).toBe(200);
  });

  it("places disconnected parts side by side", () => {
    const placement = layeredLayout(graph("a b c d", "a>b c>d"), TB);
    expect(placement.c?.x).toBe(180);
    expect(placement.c?.y).toBe(0);
    const across = layeredLayout(graph("a b c d", "a>b c>d"), LR);
    expect(across.c).toEqual({ x: 0, y: 120 });
  });

  it("lays out a cycle with every forward edge pointing down", () => {
    const placement = layeredLayout(graph("a b c", "a>b b>c c>a"), TB);
    expect((placement.a?.y ?? 0) < (placement.b?.y ?? 0) && (placement.b?.y ?? 0) < (placement.c?.y ?? 0)).toBe(true);
  });

  it("is deterministic", () => {
    const g = graph("a b c d e f g", "a>b a>c b>d c>d d>e a>e f>g g>c");
    expect(layeredLayout(g, TB)).toEqual(layeredLayout(g, TB));
    expect(layeredLayoutDetails(g, LR)).toEqual(layeredLayoutDetails(g, LR));
  });

  it("points every edge of a random DAG down its ranks and never overlaps nodes (property test)", () => {
    const random = seededRandom(5);
    for (let round = 0; round < 40; round += 1) {
      const count = 3 + random.int(18);
      const nodes = Array.from({ length: count }, (_, at) => ({
        id: `n${String(at)}`,
        width: 40 + random.int(160),
        height: 30 + random.int(60),
      }));
      const edges = Array.from({ length: random.int(count * 2) }, () => {
        const a = random.int(count);
        const b = random.int(count);
        return { source: `n${String(Math.min(a, b))}`, target: `n${String(Math.max(a, b))}` };
      }).filter((edge) => edge.source !== edge.target);
      for (const options of [TB, LR]) {
        const placement = layeredLayout({ nodes, edges }, options);
        const along = (id: string) => (options.direction === "TB" ? placement[id]?.y : placement[id]?.x) ?? 0;
        for (const edge of edges) expect(along(edge.target)).toBeGreaterThan(along(edge.source));
        const boxes = nodes.map((node) => ({
          ...node,
          x: placement[node.id]?.x ?? Number.NaN,
          y: placement[node.id]?.y ?? Number.NaN,
        }));
        for (const [i, a] of boxes.entries()) {
          for (const b of boxes.slice(i + 1)) {
            const apart =
              a.x + a.width <= b.x + 1e-6 ||
              b.x + b.width <= a.x + 1e-6 ||
              a.y + a.height <= b.y + 1e-6 ||
              b.y + b.height <= a.y + 1e-6;
            expect(apart).toBe(true);
          }
        }
      }
    }
  });

  it("returns an empty placement for an empty graph", () => {
    expect(layeredLayout({ nodes: [], edges: [] }, TB)).toEqual({});
  });
});
