import { describe, expect, it } from "vitest";
import { node, sampleState } from "../test/fixtures";
import { seededRandom } from "../test/random";
import type { Point } from "../document/types";
import { absoluteCorner, overlayTransform, roundPoint, screenToFlow, type Viewport } from "./coordinates";

/** The canvas's own forward transform: screen = flow × zoom + pan + pane origin. */
const flowToScreen = (flow: Point, pane: Point, viewport: Viewport): Point => ({
  x: flow.x * viewport.zoom + viewport.x + pane.x,
  y: flow.y * viewport.zoom + viewport.y + pane.y,
});

describe("screen and canvas coordinates", () => {
  it("converts with flow = (screen − pane − pan) / zoom", () => {
    expect(screenToFlow({ x: 260, y: 140 }, { x: 60, y: 40 }, { x: 100, y: -20, zoom: 2 })).toEqual({ x: 50, y: 60 });
    expect(flowToScreen({ x: 50, y: 60 }, { x: 60, y: 40 }, { x: 100, y: -20, zoom: 2 })).toEqual({ x: 260, y: 140 });
  });

  it("puts a peer's cursor on the same canvas point for viewers with any pan and zoom (property)", () => {
    const random = seededRandom(5);
    for (let round = 0; round < 500; round += 1) {
      const flow = { x: random.next() * 2000 - 1000, y: random.next() * 2000 - 1000 };
      const sender = { x: random.next() * 800, y: random.next() * 800, zoom: 0.1 + random.next() * 1.9 };
      const viewer = { x: random.next() * 800, y: random.next() * 800, zoom: 0.1 + random.next() * 1.9 };
      const pane = { x: 40, y: 72 };
      const sent = screenToFlow(flowToScreen(flow, pane, sender), pane, sender);
      const shown = screenToFlow(flowToScreen(sent, { x: 0, y: 0 }, viewer), { x: 0, y: 0 }, viewer);

      expect(shown.x).toBeCloseTo(flow.x, 6);
      expect(shown.y).toBeCloseTo(flow.y, 6);
    }
  });

  it("counter-scales overlays so they keep their screen size at zoom 0.25, 1 and 3", () => {
    expect(overlayTransform({ x: 10, y: 20 }, 0.25)).toBe("translate(10px, 20px) scale(4)");
    expect(overlayTransform({ x: 10, y: 20 }, 1)).toBe("translate(10px, 20px) scale(1)");
    expect(overlayTransform({ x: 10.12345, y: -2 }, 3)).toBe("translate(10.123px, -2px) scale(0.333)");
    // An 18 px arrow inside the zoomed layer: 18 × (1 / zoom) × zoom = 18 screen pixels.
    for (const zoom of [0.25, 1, 3]) expect(18 * (1 / zoom) * zoom).toBeCloseTo(18, 10);
  });

  it("rounds sent points to a tenth of a unit", () => {
    expect(roundPoint({ x: 10.04, y: -3.06 })).toEqual({ x: 10, y: -3.1 });
  });
});

describe("absoluteCorner", () => {
  it("adds every ancestor group's position", () => {
    const state = sampleState();

    expect(absoluteCorner(state, "a")).toEqual({ x: 120, y: 140 });
    expect(absoluteCorner(state, "c")).toEqual({ x: 600, y: 100 });
    expect(absoluteCorner(state, "missing")).toBeNull();
  });

  it("follows nested groups and nodes being dragged right now", () => {
    const base = sampleState();
    const state = {
      ...base,
      nodes: {
        ...base.nodes,
        h: node("h", { kind: "group", parentId: "g", position: { x: 10, y: 10 } }),
        x: node("x", { parentId: "h", position: { x: 1, y: 2 } }),
      },
    };

    expect(absoluteCorner(state, "x")).toEqual({ x: 111, y: 112 });
    expect(absoluteCorner(state, "x", { g: { x: 300, y: 0 } })).toEqual({ x: 311, y: 12 });
    expect(absoluteCorner(state, "a", { a: { x: 0, y: 0 } })).toEqual({ x: 100, y: 100 });
  });

  it("stops at a parent cycle instead of looping", () => {
    const cyclic = {
      nodes: {
        p: node("p", { kind: "group", parentId: "q", position: { x: 1, y: 1 } }),
        q: node("q", { kind: "group", parentId: "p", position: { x: 2, y: 2 } }),
      },
      edges: {},
      nextNumber: 3,
    };

    expect(absoluteCorner(cyclic, "p")).toEqual({ x: 3, y: 3 });
  });
});
