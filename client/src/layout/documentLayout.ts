import { jsonEqual, type Operation } from "../document/operations";
import type {
  DiagramLayout,
  DocumentState,
  LayoutDirection,
  LayoutEngineName,
  HandPlacedLayout,
  Side,
} from "../document/types";
import type { CompoundResult, LayoutTree, TreeNode } from "./compound";

// Automatic layout against the document: the input tree, the one operation
// that applies a result, and the manual snapshot with its restore.
//
// The first automatic layout stores the author's own arrangement (every
// node's position and size, every connector's sides and route points) inside
// the document's `layout` field; switching engine or direction keeps that
// snapshot; "Manual" writes it back and clears the field. Applying a layout
// resets connector control points and turns the ports to face along the
// ranks (bottom → top, or right → left), because hand-placed points belong to
// the old arrangement. Each of these is a single operation, so one undo
// returns to the state before it.

const bySequence = (a: { number: number; id: string }, b: { number: number; id: string }) =>
  a.number - b.number || (a.id < b.id ? -1 : 1);

/** Every node as a tree of groups, in numbering order, with every connector. */
export function layoutTreeOf(state: DocumentState): LayoutTree {
  const children = new Map<string | null, Array<{ id: string; number: number }>>();
  for (const node of Object.values(state.nodes)) {
    const parent = node.parentId !== null && state.nodes[node.parentId] ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const build = (parent: string | null): TreeNode[] =>
    [...(children.get(parent) ?? [])].sort(bySequence).map(({ id }) => {
      const node = state.nodes[id] as (typeof state.nodes)[string];
      return {
        id,
        width: node.size.width,
        height: node.size.height,
        children: node.kind === "group" ? build(id) : null,
      };
    });
  return {
    roots: build(null),
    edges: Object.values(state.edges).map((edge) => ({ source: edge.source, target: edge.target })),
  };
}

/** The author's arrangement: what "Manual" restores. */
export function takeSnapshot(state: DocumentState): HandPlacedLayout {
  return {
    nodes: Object.fromEntries(Object.values(state.nodes).map((node) => [node.id, { ...node.position, ...node.size }])),
    edges: Object.fromEntries(
      Object.values(state.edges).map((edge) => [
        edge.id,
        { sourceSide: edge.sourceSide, targetSide: edge.targetSide, points: edge.route.points },
      ]),
    ),
  };
}

export const RANK_SIDES: Readonly<Record<LayoutDirection, { readonly source: Side; readonly target: Side }>> = {
  TB: { source: "bottom", target: "top" },
  LR: { source: "right", target: "left" },
};

/**
 * One operation that moves every node the result placed (nodes removed since
 * the layout started are skipped; nodes added since keep their place), resizes
 * groups to fit, resets connector routes and records the layout. The top
 * level keeps the top-left corner of the current arrangement.
 */
export function layoutOperation(
  state: DocumentState,
  result: CompoundResult,
  engine: LayoutEngineName,
  direction: LayoutDirection,
): Operation {
  const topLevel = Object.values(state.nodes).filter((node) => node.parentId === null);
  const origin =
    topLevel.length === 0
      ? { x: 0, y: 0 }
      : {
          x: Math.min(...topLevel.map((node) => node.position.x)),
          y: Math.min(...topLevel.map((node) => node.position.y)),
        };
  const ops: Operation[] = [];
  for (const [id, corner] of Object.entries(result.positions)) {
    const node = state.nodes[id];
    if (!node) continue;
    const position =
      node.parentId === null
        ? { x: Math.round(origin.x + corner.x), y: Math.round(origin.y + corner.y) }
        : { x: Math.round(corner.x), y: Math.round(corner.y) };
    const size = result.sizes[id];
    ops.push({
      type: "node.update",
      id,
      fields: {
        position,
        ...(size ? { size: { width: Math.round(size.width), height: Math.round(size.height) } } : {}),
      },
    });
  }
  const sides = RANK_SIDES[direction];
  for (const edge of Object.values(state.edges)) {
    ops.push({
      type: "edge.update",
      id: edge.id,
      fields: {
        route: { style: edge.route.style, points: [] },
        ...(edge.kind === "connector" ? { sourceSide: sides.source, targetSide: sides.target } : {}),
      },
    });
  }
  const layout: DiagramLayout = { engine, direction, manual: state.layout?.manual ?? takeSnapshot(state) };
  ops.push({ type: "layout.set", layout });
  return { type: "batch", ops };
}

/** Writes the manual snapshot back (for nodes and connectors that still exist) and returns to manual mode; null in manual mode. */
export function restoreManualOperation(state: DocumentState): Operation | null {
  const manual = state.layout?.manual;
  if (!manual) return null;
  const ops: Operation[] = [];
  for (const [id, placement] of Object.entries(manual.nodes)) {
    const node = state.nodes[id];
    if (!node) continue;
    const position = { x: placement.x, y: placement.y };
    const size = { width: placement.width, height: placement.height };
    if (!jsonEqual(node.position, position) || !jsonEqual(node.size, size))
      ops.push({ type: "node.update", id, fields: { position, size } });
  }
  for (const [id, placement] of Object.entries(manual.edges)) {
    const edge = state.edges[id];
    if (!edge) continue;
    ops.push({
      type: "edge.update",
      id,
      fields: {
        sourceSide: placement.sourceSide,
        targetSide: placement.targetSide,
        route: { style: edge.route.style, points: placement.points },
      },
    });
  }
  ops.push({ type: "layout.set", layout: null });
  return { type: "batch", ops };
}
