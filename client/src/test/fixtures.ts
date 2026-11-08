import type { DiagramEdge, DiagramNode, DocumentState } from "../document/types";

export function node(id: string, overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id,
    key: id,
    kind: "step",
    number: 1,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    parentId: null,
    z: 1,
    style: {},
    data: { text: id },
    ...overrides,
  };
}

export function edge(id: string, source: string, target: string, overrides: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id,
    key: id,
    kind: "connector",
    source,
    target,
    sourceSide: null,
    targetSide: null,
    route: { style: "step", points: [] },
    label: null,
    style: {},
    ...overrides,
  };
}

export function stateOf(nodes: DiagramNode[], edges: DiagramEdge[] = [], nextNumber?: number): DocumentState {
  return {
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
    edges: Object.fromEntries(edges.map((entry) => [entry.id, entry])),
    nextNumber: nextNumber ?? Math.max(0, ...nodes.map((entry) => entry.number)) + 1,
  };
}

/** A group "g" holding "a" and "b", a free node "c", and edges a→b and b→c. */
export function sampleState(): DocumentState {
  return stateOf(
    [
      node("g", { kind: "group", number: 1, position: { x: 100, y: 100 }, size: { width: 300, height: 200 } }),
      node("a", { number: 2, parentId: "g", position: { x: 20, y: 40 }, z: 2 }),
      node("b", { number: 3, parentId: "g", position: { x: 20, y: 120 }, z: 3 }),
      node("c", { number: 4, position: { x: 600, y: 100 }, z: 4 }),
    ],
    [edge("ab", "a", "b"), edge("bc", "b", "c")],
  );
}

/** A deterministic id factory: "id-1", "id-2", … */
export function sequentialIds(prefix = "id") {
  let counter = 0;
  return () => `${prefix}-${String((counter += 1))}`;
}
