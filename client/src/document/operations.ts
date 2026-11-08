import type { DiagramEdge, DiagramLayout, DiagramNode, DocumentState, NodeData } from "./types";

// Every change to a diagram is an operation. The editor applies its own
// operations immediately; autosave keeps the ones not yet saved so they can be
// replayed on top of a newer server copy after a revision conflict; the
// collaboration layer sends the same operations to peers; undo
// (document/history.ts) records what each one changed. One pipeline, one set
// of rules.

export type NodeFields = Partial<Omit<DiagramNode, "id">>;
export type EdgeFields = Partial<Omit<DiagramEdge, "id">>;

export type Operation =
  | { readonly type: "node.add"; readonly node: DiagramNode }
  | { readonly type: "node.update"; readonly id: string; readonly fields: NodeFields }
  | { readonly type: "node.remove"; readonly id: string }
  | { readonly type: "edge.add"; readonly edge: DiagramEdge }
  | { readonly type: "edge.update"; readonly id: string; readonly fields: EdgeFields }
  | { readonly type: "edge.remove"; readonly id: string }
  /** Switches between manual positioning (null) and an automatic layout with the manual snapshot it keeps. */
  | { readonly type: "layout.set"; readonly layout: DiagramLayout | null }
  | { readonly type: "batch"; readonly ops: readonly Operation[] };

export type BatchOperation = Extract<Operation, { type: "batch" }>;

export interface ApplyResult {
  /** The same object as the input when nothing changed. */
  readonly state: DocumentState;
  /** Leaf operations that could not apply (for example, an update to a node removed elsewhere). */
  readonly skipped: number;
}

/** Structural equality for the plain JSON values a document holds. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bRecord = b as Record<string, unknown>;
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => key in bRecord && jsonEqual((a as Record<string, unknown>)[key], bRecord[key]));
}

function isGroup(state: DocumentState, id: string | null | undefined): boolean {
  return id != null && state.nodes[id]?.kind === "group";
}

/** True when making `parentId` the parent of `id` would put `id` inside itself. */
function wouldCycle(state: DocumentState, id: string, parentId: string): boolean {
  for (let current: string | null = parentId; current !== null; current = state.nodes[current]?.parentId ?? null) {
    if (current === id) return true;
  }
  return false;
}

/** Merges data per top-level key; an `undefined` value removes the key. */
function mergeData(current: NodeData, patch: NodeData): NodeData {
  const merged = { ...current, ...patch };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
}

function updateNode(state: DocumentState, id: string, fields: NodeFields): DocumentState | null {
  const node = state.nodes[id];
  if (!node) return null;
  if (fields.parentId != null && (!isGroup(state, fields.parentId) || wouldCycle(state, id, fields.parentId)))
    return null;

  const next: DiagramNode = {
    ...node,
    ...fields,
    id,
    data: fields.data ? mergeData(node.data, fields.data) : node.data,
  };
  if (jsonEqual(node, next)) return state;
  return { ...state, nodes: { ...state.nodes, [id]: next } };
}

function removeNode(state: DocumentState, id: string): DocumentState {
  if (!state.nodes[id]) return state;
  // Defensive cascade: whatever produced the operation, the result never holds
  // a dangling edge or an orphaned child. deleteNodes() lists these explicitly.
  const doomed = new Set([id, ...descendantsOf(state, id)]);
  const nodes: Record<string, DiagramNode> = {};
  for (const [nodeId, node] of Object.entries(state.nodes)) if (!doomed.has(nodeId)) nodes[nodeId] = node;
  const edges: Record<string, DiagramEdge> = {};
  for (const [edgeId, edge] of Object.entries(state.edges)) {
    if (!doomed.has(edge.source) && !doomed.has(edge.target)) edges[edgeId] = edge;
  }
  return { ...state, nodes, edges };
}

function applyLeaf(state: DocumentState, op: Exclude<Operation, { type: "batch" }>): DocumentState | null {
  switch (op.type) {
    case "node.add": {
      const { node } = op;
      if (state.nodes[node.id]) return null;
      if (node.parentId !== null && !isGroup(state, node.parentId)) return null;
      return {
        ...state,
        nodes: { ...state.nodes, [node.id]: node },
        nextNumber: Math.max(state.nextNumber, node.number + 1),
      };
    }
    case "node.update":
      return updateNode(state, op.id, op.fields);
    case "node.remove":
      return removeNode(state, op.id);
    case "edge.add": {
      const { edge } = op;
      if (state.edges[edge.id] || !state.nodes[edge.source] || !state.nodes[edge.target]) return null;
      return { ...state, edges: { ...state.edges, [edge.id]: edge } };
    }
    case "edge.update": {
      const edge = state.edges[op.id];
      if (!edge) return null;
      const next: DiagramEdge = { ...edge, ...op.fields, id: op.id };
      if (!state.nodes[next.source] || !state.nodes[next.target]) return null;
      if (jsonEqual(edge, next)) return state;
      return { ...state, edges: { ...state.edges, [op.id]: next } };
    }
    case "edge.remove": {
      if (!state.edges[op.id]) return state;
      return { ...state, edges: Object.fromEntries(Object.entries(state.edges).filter(([id]) => id !== op.id)) };
    }
    case "layout.set":
      return jsonEqual(state.layout ?? null, op.layout) ? state : { ...state, layout: op.layout };
  }
}

/**
 * Applies an operation and reports how many leaf operations were skipped.
 * Operations that cannot apply are skipped instead of throwing, so replaying
 * local changes over a newer copy degrades gracefully. A batch applies its
 * operations in order as one change.
 */
export function applyOperation(state: DocumentState, op: Operation): ApplyResult {
  if (op.type === "batch") {
    return op.ops.reduce<ApplyResult>(
      (result, inner) => {
        const next = applyOperation(result.state, inner);
        return { state: next.state, skipped: result.skipped + next.skipped };
      },
      { state, skipped: 0 },
    );
  }
  const next = applyLeaf(state, op);
  return next === null ? { state, skipped: 1 } : { state: next, skipped: 0 };
}

/** Replays operations in order; used to rebase unsaved local changes. */
export function applyAll(state: DocumentState, ops: readonly Operation[]): ApplyResult {
  return applyOperation(state, { type: "batch", ops });
}

/** Every node nested (at any depth) inside the given group. */
export function descendantsOf(state: DocumentState, groupId: string): string[] {
  const children = new Map<string, string[]>();
  for (const node of Object.values(state.nodes)) {
    if (node.parentId === null) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node.id);
    children.set(node.parentId, siblings);
  }
  const result: string[] = [];
  const queue = [...(children.get(groupId) ?? [])];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    result.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

/**
 * One batch that deletes nodes completely: attached edges first, then nested
 * children (deepest first), then the nodes themselves. Children of a deleted
 * group are deleted with it.
 */
export function deleteNodes(state: DocumentState, ids: readonly string[]): BatchOperation {
  const doomed = new Set<string>();
  for (const id of ids) {
    if (!state.nodes[id]) continue;
    doomed.add(id);
    for (const child of descendantsOf(state, id)) doomed.add(child);
  }
  const edgeOps: Operation[] = Object.values(state.edges)
    .filter((edge) => doomed.has(edge.source) || doomed.has(edge.target))
    .map((edge) => ({ type: "edge.remove", id: edge.id }));
  const nodeOps: Operation[] = [...doomed].reverse().map((id) => ({ type: "node.remove", id }));
  return { type: "batch", ops: [...edgeOps, ...nodeOps] };
}

/** The absolute (canvas) position of a node, adding parent offsets recursively. */
export function absolutePosition(state: DocumentState, id: string): { x: number; y: number } {
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  for (
    let node = state.nodes[id];
    node && !seen.has(node.id);
    node = node.parentId ? state.nodes[node.parentId] : undefined
  ) {
    seen.add(node.id);
    x += node.position.x;
    y += node.position.y;
  }
  return { x, y };
}
