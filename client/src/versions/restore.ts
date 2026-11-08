import { randomId, type IdFactory } from "../document/factory";
import { jsonEqual, type EdgeFields, type NodeFields, type Operation } from "../document/operations";
import type { DiagramEdge, DiagramLayout, DiagramNode, DocumentState, HandPlacedLayout } from "../document/types";

// Restoring a version is a new operation, not a reload. The builder compares
// the current document with the version and emits one batch that turns the
// first into the second. The editor applies it like any edit, so:
//
// - it is one entry in this person's undo history (one Ctrl+Z undoes it);
// - while collaborating it is submitted, ordered and broadcast like any
//   operation, so everyone sees the restore at once; with collaboration off
//   autosave stores it with the revision check;
// - a collaborator's concurrent edit to something the version does not touch
//   survives, because only differing fields are written.
//
// Ids: entities are matched by stable identity key, so a version whose ids
// differ from the current ones (a copied diagram, re-keyed data) restores
// onto the current steps instead of deleting and re-adding them. Every
// reference in the version is rewritten through the resulting id map: each
// child's parent group, each connector's ends, and the ids keying the saved
// manual arrangement. An added step keeps its version id unless that id is
// taken, and then gets a fresh one.
//
// Order (applyOperation checks each step against the state so far):
// 1. updates to matched steps, except their group;
// 2. added steps, at the top level for now;
// 3. group changes, outer groups first, so a parent is always final before its
//    children join it and no step can end up inside itself;
// 4. connector updates and additions (their ends all exist by now);
// 5. removed connectors, then removed steps, children first, so removing a
//    group never cascades over a step the version keeps;
// 6. the layout setting.
// The node counter is never rewound, so step numbers are never reused.

interface Identified {
  readonly id: string;
  readonly key: string;
}

/** Maps every entity of `target` to the id it gets in the restored document. */
function idMap<T extends Identified>(
  current: Readonly<Record<string, T>>,
  target: Readonly<Record<string, T>>,
  newId: IdFactory,
): Map<string, string> {
  const byKey = new Map<string, T[]>();
  for (const entity of Object.values(current)) byKey.set(entity.key, [...(byKey.get(entity.key) ?? []), entity]);
  const claimed = new Set<string>();
  const map = new Map<string, string>();
  const unmatched: T[] = [];
  for (const entity of Object.values(target)) {
    const candidates = (byKey.get(entity.key) ?? []).filter((candidate) => !claimed.has(candidate.id));
    const match = candidates.find((candidate) => candidate.id === entity.id) ?? candidates[0];
    if (match) {
      claimed.add(match.id);
      map.set(entity.id, match.id);
    } else {
      unmatched.push(entity);
    }
  }
  for (const entity of unmatched) {
    const free = !(entity.id in current) && ![...map.values()].includes(entity.id);
    map.set(entity.id, free ? entity.id : newId());
  }
  return map;
}

/** Target depth of each node (0 at the top level). */
function depthOf(target: DocumentState, id: string): number {
  let depth = 0;
  const seen = new Set<string>([id]);
  for (
    let parent = target.nodes[id]?.parentId ?? null;
    parent !== null && !seen.has(parent);
    parent = target.nodes[parent]?.parentId ?? null
  ) {
    seen.add(parent);
    depth += 1;
  }
  return depth;
}

/** A data patch that makes `current` equal `target`: changed keys, and removed keys set to undefined. */
function dataPatch(current: DiagramNode["data"], target: DiagramNode["data"]): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  let changed = false;
  for (const key of new Set([...Object.keys(current), ...Object.keys(target)])) {
    if (jsonEqual(current[key], target[key])) continue;
    patch[key] = target[key];
    changed = true;
  }
  return changed ? patch : null;
}

const NODE_FIELDS = ["kind", "position", "size", "z", "style"] as const;
const EDGE_FIELDS = ["kind", "source", "target", "sourceSide", "targetSide", "route", "label", "style"] as const;

function nodeUpdate(current: DiagramNode, target: DiagramNode): NodeFields | null {
  const fields: Record<string, unknown> = {};
  for (const field of NODE_FIELDS) if (!jsonEqual(current[field], target[field])) fields[field] = target[field];
  const data = dataPatch(current.data, target.data);
  if (data) fields.data = data;
  return Object.keys(fields).length > 0 ? fields : null;
}

function edgeUpdate(current: DiagramEdge, target: DiagramEdge): EdgeFields | null {
  const fields: Record<string, unknown> = {};
  for (const field of EDGE_FIELDS) if (!jsonEqual(current[field], target[field])) fields[field] = target[field];
  return Object.keys(fields).length > 0 ? fields : null;
}

function remapLayout(
  layout: DiagramLayout | null | undefined,
  nodes: Map<string, string>,
  edges: Map<string, string>,
): DiagramLayout | null {
  if (!layout) return null;
  const rekey = <T>(entries: Readonly<Record<string, T>>, map: Map<string, string>): Record<string, T> => {
    const result: Record<string, T> = {};
    for (const [id, value] of Object.entries(entries)) {
      const mapped = map.get(id);
      if (mapped !== undefined) result[mapped] = value;
    }
    return result;
  };
  const manual: HandPlacedLayout = {
    nodes: rekey(layout.manual.nodes, nodes),
    edges: rekey(layout.manual.edges, edges),
  };
  return { ...layout, manual };
}

/** Children before their parents, in the current document. */
function removalOrder(current: DocumentState, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => depthOf(current, b) - depthOf(current, a));
}

export interface RestoreOptions {
  readonly newId?: IdFactory;
}

/**
 * The one operation that makes `current` show what `target` shows, or null
 * when they already match. `target` is the version's document as loaded
 * (parseDocument), with its own ids.
 */
export function restoreOperation(
  current: DocumentState,
  target: DocumentState,
  { newId = randomId }: RestoreOptions = {},
): Operation | null {
  const nodeIds = idMap(current.nodes, target.nodes, newId);
  const edgeIds = idMap(current.edges, target.edges, newId);
  const mapped = (map: Map<string, string>, id: string) => map.get(id) ?? id;

  const finalParent = (node: DiagramNode): string | null =>
    node.parentId !== null && node.parentId in target.nodes ? mapped(nodeIds, node.parentId) : null;
  const kept = new Set<string>();
  const updates: Operation[] = [];
  const additions: Operation[] = [];
  const takenNumbers = new Set<number>();
  const added: DiagramNode[] = [];
  for (const node of Object.values(target.nodes)) {
    const id = mapped(nodeIds, node.id);
    const existing = current.nodes[id];
    if (existing) {
      kept.add(id);
      takenNumbers.add(existing.number);
      const fields = nodeUpdate(existing, node);
      if (fields) updates.push({ type: "node.update", id, fields });
    } else {
      added.push(node);
    }
  }
  let nextNumber = Math.max(current.nextNumber, ...Object.values(target.nodes).map((node) => node.number + 1));
  for (const node of added) {
    const number = takenNumbers.has(node.number) ? nextNumber++ : node.number;
    takenNumbers.add(number);
    additions.push({ type: "node.add", node: { ...node, id: mapped(nodeIds, node.id), number, parentId: null } });
  }

  const regroup: Operation[] = Object.values(target.nodes)
    .map((node) => ({ id: mapped(nodeIds, node.id), parentId: finalParent(node), depth: depthOf(target, node.id) }))
    .filter(({ id, parentId }) => (kept.has(id) ? current.nodes[id]?.parentId !== parentId : parentId !== null))
    .sort((a, b) => a.depth - b.depth)
    .map(({ id, parentId }) => ({ type: "node.update", id, fields: { parentId } }));

  const edgeOps: Operation[] = [];
  const keptEdges = new Set<string>();
  for (const edge of Object.values(target.edges)) {
    const id = mapped(edgeIds, edge.id);
    const restored: DiagramEdge = {
      ...edge,
      id,
      source: mapped(nodeIds, edge.source),
      target: mapped(nodeIds, edge.target),
    };
    const existing = current.edges[id];
    if (existing) {
      keptEdges.add(id);
      const fields = edgeUpdate(existing, restored);
      if (fields) edgeOps.push({ type: "edge.update", id, fields });
    } else {
      edgeOps.push({ type: "edge.add", edge: restored });
    }
  }

  const edgeRemovals: Operation[] = Object.keys(current.edges)
    .filter((id) => !keptEdges.has(id))
    .map((id) => ({ type: "edge.remove", id }));
  const nodeRemovals: Operation[] = removalOrder(
    current,
    Object.keys(current.nodes).filter((id) => !kept.has(id)),
  ).map((id) => ({ type: "node.remove", id }));

  const layout = remapLayout(target.layout, nodeIds, edgeIds);
  const layoutOps: Operation[] = jsonEqual(current.layout ?? null, layout) ? [] : [{ type: "layout.set", layout }];

  const ops = [...updates, ...additions, ...regroup, ...edgeOps, ...edgeRemovals, ...nodeRemovals, ...layoutOps];
  return ops.length === 0 ? null : { type: "batch", ops };
}
