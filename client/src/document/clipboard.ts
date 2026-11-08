import { randomId, type IdFactory } from "./factory";
import { absoluteBox, isAncestor } from "./groups";
import { absolutePosition, descendantsOf, type BatchOperation, type Operation } from "./operations";
import { orderedNodes, parseDocument } from "./serialize";
import type { DiagramEdge, DiagramNode, DocumentState, Point } from "./types";

// Copy, paste and duplicate.
//
// A copy holds the selected nodes, every node inside a selected group, and
// the connectors whose two ends are both copied. The copied top-level nodes
// are stored relative to the copy's top-left corner; nodes inside copied
// groups keep their group-relative positions and their parent link.
//
// Pasting gives every node and connector a new id (and a new identity key),
// remaps parent links and connector ends through an old → new table,
// continues the short numbers from the document counter, stacks the pasted
// nodes on top in their original order, and puts the copy's top-left corner
// at the paste point. Children land in the pasted copy of their group; the
// top-level nodes go into the group under the pointer, if any.

export const CLIPBOARD_VERSION = 1;
/** The custom clipboard type; the same JSON also goes out as plain text. */
export const CLIPBOARD_TYPE = "application/x-live-canvas+json";
const MARKER = "liveCanvas";

export interface ClipboardPayload {
  readonly version: typeof CLIPBOARD_VERSION;
  /** Parents before children; top-level nodes relative to the copy's top-left corner. */
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

/** What a copy of `ids` holds, or null when nothing is selected. */
export function copyPayload(state: DocumentState, ids: readonly string[]): ClipboardPayload | null {
  const included = new Set<string>();
  for (const id of ids) {
    if (!state.nodes[id]) continue;
    included.add(id);
    for (const child of descendantsOf(state, id)) included.add(child);
  }
  if (included.size === 0) return null;
  const tops = [...included].filter(
    (id) => ![...included].some((other) => other !== id && isAncestor(state, other, id)),
  );
  const boxes = tops.map((id) => absoluteBox(state, id)).filter((box) => box !== null);
  const originX = Math.min(...boxes.map((box) => box.x));
  const originY = Math.min(...boxes.map((box) => box.y));
  const topSet = new Set(tops);
  const nodes = orderedNodes(state)
    .filter((node) => included.has(node.id))
    .map((node) => {
      if (!topSet.has(node.id)) return node;
      const absolute = absolutePosition(state, node.id);
      return { ...node, parentId: null, position: { x: absolute.x - originX, y: absolute.y - originY } };
    });
  const edges = Object.values(state.edges).filter((edge) => included.has(edge.source) && included.has(edge.target));
  return { version: CLIPBOARD_VERSION, nodes, edges };
}

export function serializeClipboard(payload: ClipboardPayload): string {
  return JSON.stringify({ [MARKER]: payload.version, nodes: payload.nodes, edges: payload.edges });
}

/** Reads clipboard text; anything that is not one of our copies (or is malformed) gives null and is ignored. */
export function parseClipboard(text: string): ClipboardPayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || (raw as Record<string, unknown>)[MARKER] !== CLIPBOARD_VERSION)
    return null;
  // The document parser applies the same defensive rules as loading: defaults, dropped entries, repaired references.
  const { state } = parseDocument(raw);
  const nodes = orderedNodes(state);
  if (nodes.length === 0) return null;
  return { version: CLIPBOARD_VERSION, nodes, edges: Object.values(state.edges) };
}

export interface PasteResult {
  readonly op: BatchOperation;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
}

export interface PasteOptions {
  readonly newId?: IdFactory;
  /** The group the top-level nodes go into (the group under the pointer), or null for the top level. */
  readonly parentId?: string | null;
}

/** Pastes with the copy's top-left corner at `origin` (absolute canvas coordinates). */
export function pasteOperation(
  state: DocumentState,
  payload: ClipboardPayload,
  origin: Point,
  { newId = randomId, parentId = null }: PasteOptions = {},
): PasteResult {
  const ids = new Map(payload.nodes.map((node) => [node.id, newId()]));
  const parent = parentId !== null && state.nodes[parentId]?.kind === "group" ? parentId : null;
  const parentOrigin = parent === null ? { x: 0, y: 0 } : absolutePosition(state, parent);
  const topZ = Math.max(0, ...Object.values(state.nodes).map((node) => node.z));
  const stacking = [...payload.nodes].sort((a, b) => a.z - b.z || a.number - b.number);
  const zOf = new Map(stacking.map((node, at) => [node.id, topZ + 1 + at]));

  const nodeOps: Operation[] = payload.nodes.map((node, at) => {
    const id = ids.get(node.id) as string;
    const mappedParent = node.parentId === null ? undefined : ids.get(node.parentId);
    const pasted: DiagramNode =
      mappedParent === undefined
        ? {
            ...node,
            id,
            key: id,
            parentId: parent,
            position: {
              x: origin.x + node.position.x - parentOrigin.x,
              y: origin.y + node.position.y - parentOrigin.y,
            },
          }
        : { ...node, id, key: id, parentId: mappedParent };
    return { type: "node.add", node: { ...pasted, number: state.nextNumber + at, z: zOf.get(node.id) as number } };
  });
  const edgeIds: string[] = [];
  const edgeOps: Operation[] = [];
  for (const edge of payload.edges) {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    if (source === undefined || target === undefined) continue;
    const id = newId();
    edgeIds.push(id);
    edgeOps.push({ type: "edge.add", edge: { ...edge, id, key: id, source, target } });
  }
  return { op: { type: "batch", ops: [...nodeOps, ...edgeOps] }, nodeIds: [...ids.values()], edgeIds };
}

/** Where a duplicate goes: 50 units right and down of the original, in the original's parent when the selection shares one. */
export const DUPLICATE_OFFSET = 50;

export function duplicateTarget(
  state: DocumentState,
  ids: readonly string[],
): { origin: Point; parentId: string | null } | null {
  const nodes = ids.map((id) => state.nodes[id]).filter((node) => node !== undefined);
  const boxes = nodes.map((node) => absoluteBox(state, node.id)).filter((box) => box !== null);
  if (boxes.length === 0) return null;
  const parents = new Set(nodes.map((node) => node.parentId));
  const [shared = null] = parents.size === 1 ? parents : [null];
  return {
    origin: {
      x: Math.min(...boxes.map((box) => box.x)) + DUPLICATE_OFFSET,
      y: Math.min(...boxes.map((box) => box.y)) + DUPLICATE_OFFSET,
    },
    parentId: shared,
  };
}
