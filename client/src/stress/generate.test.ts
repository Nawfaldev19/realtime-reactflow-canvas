import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../document/serialize";
import { cellKind, cellRoute, generateStressDiagram, isStressSize, STRESS_GRID, STRESS_SIZES } from "./generate";

describe("stress diagrams", () => {
  it.each(STRESS_SIZES)("has exactly %i nodes, with connectors and groups", (size) => {
    const { document, counts } = generateStressDiagram(size);
    expect(document.nodes).toHaveLength(size);
    expect(counts.nodes).toBe(size);
    expect(counts.edges).toBe(document.edges.length);
    expect(counts.edges).toBeGreaterThan(size);
    expect(counts.groups).toBe(document.nodes.filter((node) => node.kind === "group").length);
    expect(counts.groups).toBeGreaterThan(size / 20);
  });

  it("is deterministic, id for id", () => {
    expect(generateStressDiagram(500)).toEqual(generateStressDiagram(500));
  });

  it("loads without repairs and survives a save round trip unchanged", () => {
    const { document } = generateStressDiagram(1000);
    const { state, report } = parseDocument(document);
    expect(report).toEqual({ droppedNodes: 0, droppedEdges: 0, reparented: [], detached: [] });
    expect(Object.keys(state.nodes)).toHaveLength(1000);
    expect(Object.keys(state.edges)).toHaveLength(document.edges.length);
    const saved = serializeDocument(state);
    expect(new Set(saved.nodes.map((node) => node.id))).toEqual(new Set(document.nodes.map((node) => node.id)));
    expect(saved.edges).toEqual(document.edges);
  });

  it("puts parents first, keeps children inside their group, and connects only existing nodes", () => {
    const { document } = generateStressDiagram(500);
    const seen = new Map(document.nodes.map((node, index) => [node.id, { node, index }]));
    for (const [index, node] of document.nodes.entries()) {
      if (node.parentId === null) continue;
      const parent = seen.get(node.parentId);
      expect(parent?.node.kind).toBe("group");
      expect(parent?.index).toBeLessThan(index);
      expect(node.position.x + node.size.width).toBeLessThanOrEqual(parent?.node.size.width ?? 0);
      expect(node.position.y + node.size.height).toBeLessThanOrEqual(parent?.node.size.height ?? 0);
    }
    for (const edge of document.edges) {
      expect(seen.has(edge.source)).toBe(true);
      expect(seen.has(edge.target)).toBe(true);
      expect(edge.source).not.toBe(edge.target);
    }
  });

  it("centres each node in its grid cell", () => {
    const { document } = generateStressDiagram(500);
    // Cell 0 is a start/end pill (180 × 56); cell 1 a step (180 × 64).
    expect(document.nodes[0]).toMatchObject({ kind: "start-end", position: { x: 40, y: 57 }, data: { text: "Start" } });
    expect(document.nodes[1]).toMatchObject({ kind: "step", position: { x: STRESS_GRID.cellWidth + 40, y: 53 } });
    // Cell 9 is the first group, followed by its two steps in group coordinates.
    const group = document.nodes[9];
    expect(group).toMatchObject({
      kind: "group",
      position: { x: 9 * STRESS_GRID.cellWidth + 10, y: 10 },
      data: { text: "Station 1" },
    });
    expect(document.nodes[10]).toMatchObject({ parentId: group?.id, position: { x: 12, y: 60 } });
    expect(document.nodes[11]).toMatchObject({ parentId: group?.id, position: { x: 128, y: 60 } });
  });

  it("labels the branches leaving a decision and varies the route styles", () => {
    const { document } = generateStressDiagram(500);
    const decision = document.nodes.find((node) => node.kind === "decision");
    const leaving = document.edges.filter((edge) => edge.source === decision?.id);
    expect(leaving.map((edge) => edge.label?.text)).toContain("yes");
    expect(new Set(document.edges.map((edge) => edge.route.style))).toEqual(new Set(["step", "spline", "polyline"]));
    const shapes = document.nodes.filter((node) => node.kind === "shape");
    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes[0]?.data).toHaveProperty("shape");
    const texts = document.nodes.map((node) => node.data.text);
    expect(texts).toContain("Fits part 3?");
    expect(texts.some((text) => typeof text === "string" && text.startsWith("Check the grain"))).toBe(true);
    expect(texts.some((text) => typeof text === "string" && text.startsWith("Checkpoint"))).toBe(true);
  });

  it("fills a group cell with a plain step when fewer than three nodes remain", () => {
    // Nine plain cells, then a group cell with only one node left.
    const { document, counts } = generateStressDiagram(10);
    expect(counts.groups).toBe(0);
    expect(document.nodes[9]?.kind).toBe("step");
  });

  it("picks kinds and routes by cell", () => {
    expect([cellKind(5), cellKind(3), cellKind(2), cellKind(13), cellKind(1)]).toEqual([
      "shape",
      "note",
      "decision",
      "start-end",
      "step",
    ]);
    expect([cellRoute(4), cellRoute(7), cellRoute(0)]).toEqual(["spline", "polyline", "step"]);
    expect(isStressSize(1000)).toBe(true);
    expect(isStressSize(999)).toBe(false);
  });
});
