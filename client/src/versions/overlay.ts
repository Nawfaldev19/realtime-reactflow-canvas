import { absolutePosition } from "../document/operations";
import type { DiagramEdge, DiagramNode, DocumentState } from "../document/types";
import { matchKeys, type ChangeStatus, type DocumentDiff, type EntityDiff } from "./diff";

// The overlay compare: one read-only drawing holding both versions at once.
//
// It is the newer document plus everything that was removed since the older
// one, drawn where it used to be. Removed entities get a prefixed id, so they
// can never collide with a newer step that reuses the id. Their references are
// remapped through stable keys:
//
// - a removed step whose old group still exists (by key) is placed inside that
//   group, at its old absolute position (so the group having moved since does
//   not drag the ghost with it); if its group was removed too, it stays inside
//   the removed group; otherwise it is drawn at the top level;
// - a removed connector attaches to the newer step with the same key as its
//   old end, or to the removed step.
//
// Every id in the drawing has a status, which the canvas turns into a class
// name (render props, never DOM edits), so highlights survive re-renders and
// panning far away and back.

export const REMOVED_PREFIX = "removed-";

export interface OverlayView {
  readonly doc: DocumentState;
  readonly nodes: Readonly<Record<string, ChangeStatus>>;
  readonly edges: Readonly<Record<string, ChangeStatus>>;
  /** The diff entry behind each id of the drawing, for the diff card. */
  readonly entries: Readonly<Record<string, EntityDiff>>;
}

const removedId = (id: string) => `${REMOVED_PREFIX}${id}`;

export function overlayView(older: DocumentState, newer: DocumentState, diff: DocumentDiff): OverlayView {
  const newerByMatch = new Map([...matchKeys(newer.nodes)].map(([match, node]) => [match, node.id]));
  const olderMatch = new Map([...matchKeys(older.nodes)].map(([match, node]) => [node.id, match]));
  const removedNodes = new Set(diff.nodes.filter((entry) => entry.status === "removed").map((entry) => entry.olderId));

  /** The id an older step has in the drawing. */
  const drawnId = (olderId: string): string | null => {
    if (removedNodes.has(olderId)) return removedId(olderId);
    const match = olderMatch.get(olderId);
    return match === undefined ? null : (newerByMatch.get(match) ?? null);
  };

  const nodes: Record<string, DiagramNode> = { ...newer.nodes };
  const nodeStatus: Record<string, ChangeStatus> = { ...diff.newer.nodes };
  const entries: Record<string, EntityDiff> = {};
  for (const entry of diff.nodes) {
    if (entry.newerId !== null) entries[entry.newerId] = entry;
    if (entry.status !== "removed" || entry.olderId === null) continue;
    const old = older.nodes[entry.olderId];
    if (!old) continue;
    const id = removedId(old.id);
    nodes[id] = { ...old, id, ...placement(old, older, newer, drawnId) };
    nodeStatus[id] = "removed";
    entries[id] = entry;
  }

  const edges: Record<string, DiagramEdge> = { ...newer.edges };
  const edgeStatus: Record<string, ChangeStatus> = { ...diff.newer.edges };
  for (const entry of diff.edges) {
    if (entry.newerId !== null) entries[entry.newerId] = entry;
    if (entry.status !== "removed" || entry.olderId === null) continue;
    const old = older.edges[entry.olderId];
    const source = old && drawnId(old.source);
    const target = old && drawnId(old.target);
    if (!old || !source || !target) continue;
    const id = removedId(old.id);
    edges[id] = { ...old, id, source, target };
    edgeStatus[id] = "removed";
    entries[id] = entry;
  }

  return { doc: { ...newer, nodes, edges }, nodes: nodeStatus, edges: edgeStatus, entries };
}

/** Where a removed step is drawn: inside its old group when that group is still drawn, at its old absolute position. */
function placement(
  old: DiagramNode,
  older: DocumentState,
  newer: DocumentState,
  drawnId: (id: string) => string | null,
): Pick<DiagramNode, "parentId" | "position"> {
  const absolute = absolutePosition(older, old.id);
  if (old.parentId === null) return { parentId: null, position: absolute };
  const parent = drawnId(old.parentId);
  if (parent === null) return { parentId: null, position: absolute };
  if (parent.startsWith(REMOVED_PREFIX)) return { parentId: parent, position: old.position };
  if (newer.nodes[parent]?.kind !== "group") return { parentId: null, position: absolute };
  const origin = absolutePosition(newer, parent);
  return { parentId: parent, position: { x: absolute.x - origin.x, y: absolute.y - origin.y } };
}
