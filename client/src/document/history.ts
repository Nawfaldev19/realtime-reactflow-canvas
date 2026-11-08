import { jsonEqual, type NodeFields, type EdgeFields, type Operation } from "./operations";
import type { DiagramEdge, DiagramLayout, DiagramNode, DocumentState } from "./types";

// Per-person undo and redo, built from what each local operation changed.
//
// An entry records, for every node and edge an operation touched, the entity
// before and after (null when it did not exist), plus the layout setting. It
// is found by comparing object references: applyOperation keeps the same
// object for everything it did not change, so the diff is one pass over the
// ids and costs nothing per unchanged entity.
//
// Undo does not write the old document back. It builds a new operation from
// the current document with a three-way rule per field (and per key of `data`
// and `style`): a field is restored only while it still holds the value this
// person's operation gave it. If someone else has changed that field since,
// their value stays. An entity a collaborator removed is skipped; an entity
// this person removed is added back unless it exists again. Redo is the same
// rule in the other direction. Selection and editing state never enter the
// history, and the node counter is never rewound (numbers are not reused).

export interface EntityChange<T> {
  readonly id: string;
  readonly before: T | null;
  readonly after: T | null;
}

export interface HistoryEntry {
  readonly nodes: readonly EntityChange<DiagramNode>[];
  readonly edges: readonly EntityChange<DiagramEdge>[];
  /** Present when the operation switched the layout mode or its snapshot. */
  readonly layout: { readonly before: DiagramLayout | null; readonly after: DiagramLayout | null } | null;
}

export interface History {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

/** How many steps undo goes back: deep enough for a long session, small enough to keep memory flat. */
export const HISTORY_LIMIT = 100;

function changesOf<T>(before: Readonly<Record<string, T>>, after: Readonly<Record<string, T>>): EntityChange<T>[] {
  const changes: EntityChange<T>[] = [];
  for (const [id, entity] of Object.entries(before)) {
    if (after[id] !== entity) changes.push({ id, before: entity, after: after[id] ?? null });
  }
  for (const [id, entity] of Object.entries(after)) {
    if (!(id in before)) changes.push({ id, before: null, after: entity });
  }
  return changes;
}

/** What changed between two states, or null when nothing a person can undo did. */
export function diffStates(before: DocumentState, after: DocumentState): HistoryEntry | null {
  const nodes = before.nodes === after.nodes ? [] : changesOf(before.nodes, after.nodes);
  const edges = before.edges === after.edges ? [] : changesOf(before.edges, after.edges);
  const layoutBefore = before.layout ?? null;
  const layoutAfter = after.layout ?? null;
  const layout = jsonEqual(layoutBefore, layoutAfter) ? null : { before: layoutBefore, after: layoutAfter };
  if (nodes.length === 0 && edges.length === 0 && layout === null) return null;
  return { nodes, edges, layout };
}

/** Adds an entry, dropping the oldest beyond the limit. A new edit clears the redo stack. */
export function recordEntry(history: History, entry: HistoryEntry, limit = HISTORY_LIMIT): History {
  const past = [...history.past, entry];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

type Bag = Readonly<Record<string, unknown>>;

/**
 * Three-way merge of one keyed object (data or style): keys still holding the
 * `from` value move to `to`; keys someone else changed are left alone. Returns
 * only the keys to change (undefined removes a key), or null when none do.
 */
function patchKeys(current: Bag, from: Bag, to: Bag): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  let changed = false;
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (jsonEqual(from[key], to[key]) || !jsonEqual(current[key], from[key])) continue;
    patch[key] = to[key];
    changed = true;
  }
  return changed ? patch : null;
}

/** A style with `patch` applied; style is stored as one field, so the result is the whole object. */
function patchedStyle(current: DiagramNode["style"], patch: Record<string, unknown>): DiagramNode["style"] {
  const merged: Record<string, unknown> = { ...current, ...patch };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as DiagramNode["style"];
}

const NODE_FIELDS = ["key", "kind", "number", "position", "size", "parentId", "z"] as const;
const EDGE_FIELDS = ["key", "kind", "source", "target", "sourceSide", "targetSide", "route", "label"] as const;

function nodeRevert(current: DiagramNode, from: DiagramNode, to: DiagramNode): NodeFields | null {
  const fields: Record<string, unknown> = {};
  for (const field of NODE_FIELDS) {
    if (!jsonEqual(from[field], to[field]) && jsonEqual(current[field], from[field])) fields[field] = to[field];
  }
  const data = patchKeys(current.data, from.data, to.data);
  if (data) fields.data = data;
  const style = patchKeys(current.style, from.style, to.style);
  if (style) fields.style = patchedStyle(current.style, style);
  return Object.keys(fields).length > 0 ? fields : null;
}

function edgeRevert(current: DiagramEdge, from: DiagramEdge, to: DiagramEdge): EdgeFields | null {
  const fields: Record<string, unknown> = {};
  for (const field of EDGE_FIELDS) {
    if (!jsonEqual(from[field], to[field]) && jsonEqual(current[field], from[field])) fields[field] = to[field];
  }
  const style = patchKeys(current.style, from.style, to.style);
  if (style) fields.style = patchedStyle(current.style, style);
  return Object.keys(fields).length > 0 ? fields : null;
}

/** Nodes to add back, ordered so every parent comes before its children. */
function parentsFirst(nodes: readonly DiagramNode[]): DiagramNode[] {
  const pending = new Map(nodes.map((node) => [node.id, node]));
  const ordered: DiagramNode[] = [];
  while (pending.size > 0) {
    const ready = [...pending.values()].filter((node) => node.parentId === null || !pending.has(node.parentId));
    // A parent cycle cannot come out of applyOperation; if one is ever stored, add the rest as they come.
    const batch = ready.length > 0 ? ready : [...pending.values()];
    for (const node of batch) {
      ordered.push(node);
      pending.delete(node.id);
    }
  }
  return ordered;
}

export type Direction = "undo" | "redo";

/**
 * The operation that moves `current` from an entry's "after" back to its
 * "before" (undo) or forward again (redo), touching only what still holds the
 * value this entry left. Null when nothing is left to change.
 *
 * Order matters: added nodes (parents first), then node updates (so children
 * leave a group before it is removed), then edges, then removed edges, then
 * removed nodes (children first).
 */
export function revertOperation(current: DocumentState, entry: HistoryEntry, direction: Direction): Operation | null {
  const pick = <T>(change: EntityChange<T>) =>
    direction === "undo" ? { from: change.after, to: change.before } : { from: change.before, to: change.after };
  const nodeAdds: DiagramNode[] = [];
  const nodeUpdates: Operation[] = [];
  const nodeRemovals: string[] = [];
  const edgeAdds: Operation[] = [];
  const edgeRemovals: Operation[] = [];

  for (const change of entry.nodes) {
    const { from, to } = pick(change);
    const now = current.nodes[change.id];
    if (from === null && to !== null) {
      if (!now) nodeAdds.push(to);
    } else if (from !== null && to === null) {
      if (now) nodeRemovals.push(change.id);
    } else if (from !== null && to !== null && now) {
      const fields = nodeRevert(now, from, to);
      if (fields) nodeUpdates.push({ type: "node.update", id: change.id, fields });
    }
  }
  for (const change of entry.edges) {
    const { from, to } = pick(change);
    const now = current.edges[change.id];
    if (from === null && to !== null) {
      if (!now) edgeAdds.push({ type: "edge.add", edge: to });
    } else if (from !== null && to === null) {
      if (now) edgeRemovals.push({ type: "edge.remove", id: change.id });
    } else if (from !== null && to !== null && now) {
      const fields = edgeRevert(now, from, to);
      if (fields) edgeAdds.push({ type: "edge.update", id: change.id, fields });
    }
  }

  const removals = removalOrder(current, nodeRemovals);
  const ops: Operation[] = [
    ...parentsFirst(nodeAdds).map((node): Operation => ({ type: "node.add", node })),
    ...nodeUpdates,
    ...edgeAdds,
    ...edgeRemovals,
    ...removals.map((id): Operation => ({ type: "node.remove", id })),
  ];
  if (entry.layout) {
    const from = direction === "undo" ? entry.layout.after : entry.layout.before;
    const to = direction === "undo" ? entry.layout.before : entry.layout.after;
    if (jsonEqual(current.layout ?? null, from)) ops.push({ type: "layout.set", layout: to });
  }
  if (ops.length === 0) return null;
  return ops.length === 1 && ops[0] ? ops[0] : { type: "batch", ops };
}

/** Children before their parents, so removing a group never cascades over a child that is being kept or moved. */
function removalOrder(state: DocumentState, ids: readonly string[]): string[] {
  const depth = (id: string) => {
    let level = 0;
    const seen = new Set<string>();
    for (
      let parent = state.nodes[id]?.parentId ?? null;
      parent !== null && !seen.has(parent);
      parent = state.nodes[parent]?.parentId ?? null
    ) {
      seen.add(parent);
      level += 1;
    }
    return level;
  };
  return [...ids].sort((a, b) => depth(b) - depth(a));
}

export interface StepResult {
  readonly history: History;
  /** The operation to apply, or null when every remaining entry was already reverted by others. */
  readonly op: Operation | null;
}

/**
 * Takes the newest entry off one stack and returns the operation for it.
 * Entries that no longer change anything (a collaborator already reverted or
 * removed everything they touched) are dropped, and the next one is tried.
 */
export function step(history: History, current: DocumentState, direction: Direction): StepResult {
  let { past, future } = history;
  for (;;) {
    const source = direction === "undo" ? past : future;
    const entry = source.at(-1);
    if (!entry) return { history: { past, future }, op: null };
    const rest = source.slice(0, -1);
    const op = revertOperation(current, entry, direction);
    if (direction === "undo") {
      past = rest;
      if (op) future = [...future, entry];
    } else {
      future = rest;
      if (op) past = [...past, entry];
    }
    if (op) return { history: { past, future }, op };
  }
}
