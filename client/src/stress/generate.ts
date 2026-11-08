import { DEFAULT_SIZES } from "../document/factory";
import {
  SCHEMA_VERSION,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramNode,
  type NodeKind,
  type RouteStyle,
  type Size,
} from "../document/types";
import { SHAPE_KINDS } from "../geometry/shapes";

// Deterministic stress diagrams for the performance work: the same size
// always produces the same document, id for id, so every benchmark run and
// every technique switch measures the same thing. Nodes sit in a grid of
// cells; every tenth cell is a group holding two small steps; neighbours in a
// row are connected, and every fourth column also connects downwards.

export const STRESS_SIZES = [500, 1000, 2000] as const;
export type StressSize = (typeof STRESS_SIZES)[number];

export const isStressSize = (value: number): value is StressSize => (STRESS_SIZES as readonly number[]).includes(value);

/** Grid geometry, in canvas units. */
export const STRESS_GRID = { columns: 20, cellWidth: 260, cellHeight: 170 } as const;

const GROUP_SIZE: Size = { width: 240, height: 150 };
const CHILD_SIZE: Size = { width: 100, height: 50 };
const CHILD_OFFSETS = [
  { x: 12, y: 60 },
  { x: 128, y: 60 },
] as const;

const VERBS = ["Measure", "Cut", "Sand", "Drill", "Glue", "Clamp", "Solder", "Wire", "Test", "Finish"] as const;

export interface StressDiagram {
  readonly document: DiagramDocument;
  readonly counts: { readonly nodes: number; readonly edges: number; readonly groups: number };
}

/** The kind of a plain (non-group) cell. */
export function cellKind(cell: number): NodeKind {
  if (cell % 17 === 5) return "shape";
  if (cell % 11 === 3) return "note";
  if (cell % 7 === 2) return "decision";
  if (cell % 13 === 0) return "start-end";
  return "step";
}

/** Route style of the connectors leaving a cell. */
export function cellRoute(cell: number): RouteStyle {
  if (cell % 9 === 4) return "spline";
  if (cell % 9 === 7) return "polyline";
  return "step";
}

const isGroupCell = (cell: number): boolean => cell % 10 === 9;

function textFor(kind: NodeKind, number: number): string {
  const verb = VERBS[number % VERBS.length] ?? "Build";
  switch (kind) {
    case "decision":
      return `Fits part ${String(number)}?`;
    case "note":
      return `Check the grain before step ${String(number)}`;
    case "start-end":
      return number === 1 ? "Start" : `Checkpoint ${String(number)}`;
    case "shape":
      return "";
    default:
      return `${verb} part ${String(number)}`;
  }
}

export function generateStressDiagram(size: number): StressDiagram {
  const nodes: DiagramNode[] = [];
  /** The top-level node of each cell, in cell order. */
  const cellNodes: string[] = [];
  const edges: DiagramEdge[] = [];
  const kinds = new Map<string, NodeKind>();
  let groups = 0;

  const addNode = (
    kind: NodeKind,
    position: { x: number; y: number },
    nodeSize: Size,
    parentId: string | null,
    data: Readonly<Record<string, unknown>>,
  ): string => {
    const number = nodes.length + 1;
    const id = `stress-node-${String(number)}`;
    nodes.push({ id, key: id, kind, number, position, size: nodeSize, parentId, z: number, style: {}, data });
    kinds.set(id, kind);
    return id;
  };
  const addEdge = (source: string, target: string, style: RouteStyle, label: string | null): void => {
    const id = `stress-edge-${String(edges.length + 1)}`;
    edges.push({
      id,
      key: id,
      kind: "connector",
      source,
      target,
      sourceSide: null,
      targetSide: null,
      route: { style, points: [] },
      label: label === null ? null : { text: label },
      style: {},
    });
  };

  for (let cell = 0; nodes.length < size; cell += 1) {
    const column = cell % STRESS_GRID.columns;
    const row = Math.floor(cell / STRESS_GRID.columns);
    const origin = { x: column * STRESS_GRID.cellWidth, y: row * STRESS_GRID.cellHeight };
    const centred = (box: Size) => ({
      x: origin.x + (STRESS_GRID.cellWidth - box.width) / 2,
      y: origin.y + (STRESS_GRID.cellHeight - box.height) / 2,
    });
    if (isGroupCell(cell) && size - nodes.length >= 3) {
      groups += 1;
      const group = addNode("group", centred(GROUP_SIZE), GROUP_SIZE, null, { text: `Station ${String(groups)}` });
      const [first, second] = CHILD_OFFSETS.map((offset) =>
        addNode("step", offset, CHILD_SIZE, group, { text: textFor("step", nodes.length + 1) }),
      );
      if (first !== undefined && second !== undefined) addEdge(first, second, "step", null);
      cellNodes.push(group);
      continue;
    }
    const kind = isGroupCell(cell) ? "step" : cellKind(cell);
    const nodeSize = DEFAULT_SIZES[kind];
    const number = nodes.length + 1;
    const data =
      kind === "shape" ? { text: "", shape: SHAPE_KINDS[cell % SHAPE_KINDS.length] } : { text: textFor(kind, number) };
    cellNodes.push(addNode(kind, centred(nodeSize), nodeSize, null, data));
  }

  cellNodes.forEach((source, cell) => {
    const column = cell % STRESS_GRID.columns;
    const right = cellNodes[cell + 1];
    const below = cellNodes[cell + STRESS_GRID.columns];
    const fromDecision = kinds.get(source) === "decision";
    if (column < STRESS_GRID.columns - 1 && right !== undefined)
      addEdge(source, right, cellRoute(cell), fromDecision ? "yes" : null);
    if (column % 4 === 0 && below !== undefined) addEdge(source, below, cellRoute(cell), fromDecision ? "no" : null);
  });

  return {
    document: { schemaVersion: SCHEMA_VERSION, nodes, edges, nextNumber: nodes.length + 1 },
    counts: { nodes: nodes.length, edges: edges.length, groups },
  };
}
