import type { LayoutDirection } from "../document/types";

// The input and output every layout engine shares: a flat directed graph of
// boxes in, top-left corners out. Groups are handled one level up
// (compound.ts), so an engine never sees nesting.

export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface LayoutEdge {
  readonly source: string;
  readonly target: string;
}

export interface FlatGraph {
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
}

export interface LayoutOptions {
  readonly direction: LayoutDirection;
  /** Space between neighbouring nodes in one rank. */
  readonly nodeSep: number;
  /** Space between ranks. */
  readonly rankSep: number;
}

/** Default separations: 80 between nodes, 100 between ranks (room for connector labels between ranks). */
export const DEFAULT_LAYOUT_OPTIONS: Omit<LayoutOptions, "direction"> = { nodeSep: 80, rankSep: 100 };

export interface Corner {
  readonly x: number;
  readonly y: number;
}

/** Top-left corners keyed by node id; the layout's bounding box starts at (0, 0). */
export type Placement = Readonly<Record<string, Corner>>;

export type FlatEngine = (graph: FlatGraph, options: LayoutOptions) => Placement;

/** Shifts a placement so its bounding box starts at (0, 0). */
export function normalizePlacement(graph: FlatGraph, placement: Readonly<Record<string, Corner>>): Placement {
  const placed = graph.nodes.filter((node) => placement[node.id] !== undefined);
  if (placed.length === 0) return {};
  const minX = Math.min(...placed.map((node) => (placement[node.id] as Corner).x));
  const minY = Math.min(...placed.map((node) => (placement[node.id] as Corner).y));
  return Object.fromEntries(
    placed.map((node) => [
      node.id,
      { x: (placement[node.id] as Corner).x - minX, y: (placement[node.id] as Corner).y - minY },
    ]),
  );
}
