import { absolutePosition } from "../document/operations";
import type { DiagramEdge, DocumentState } from "../document/types";

// The order in which the build-up animation reveals a diagram: reading order
// along the connectors.
//
// - Positions are absolute (children of groups converted), so steps inside a
//   group are compared with steps outside on equal terms; ties go to x, then id.
// - Roots are nodes that start a connector and have no incoming one, in
//   reading order; a diagram whose connected nodes all have an incoming
//   connector (a pure cycle) starts from its top-most connected node.
// - A breadth-first walk from the roots visits successors in reading order;
//   a visited set makes cycles terminate.
// - Groups are revealed as a block: reaching any node inside a group reveals
//   its outermost group first, then the contents in reading order (each
//   nested group before its own children).
// - Every revealed node is followed by the group of its outgoing connectors
//   (connectors whose two ends exist; others are skipped); a group's own
//   connectors follow its contents.
// - Whatever the walk did not reach (free notes and labels, separate parts)
//   follows in reading order, each part walked from its first node.
//
// The cost is O((n + e) log n) for the sorts; the walk itself is O(n + e).

export type RevealItem =
  | { readonly kind: "node"; readonly id: string }
  | { readonly kind: "connectors"; readonly source: string; readonly ids: readonly string[] };

interface Placed {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

const readingOrder = (a: Placed, b: Placed): number =>
  a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function revealOrder(doc: DocumentState): RevealItem[] {
  const placed = new Map<string, Placed>();
  for (const id of Object.keys(doc.nodes)) placed.set(id, { id, ...absolutePosition(doc, id) });
  const byReading = (ids: Iterable<string>): string[] =>
    [...ids]
      .map((id) => placed.get(id))
      .filter((entry): entry is Placed => entry !== undefined)
      .sort(readingOrder)
      .map((entry) => entry.id);

  const valid = Object.values(doc.edges).filter((edge) => placed.has(edge.source) && placed.has(edge.target));
  const outgoing = new Map<string, DiagramEdge[]>();
  const incoming = new Set<string>();
  const connected = new Set<string>();
  for (const edge of valid) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    if (edge.source !== edge.target) incoming.add(edge.target);
    connected.add(edge.source).add(edge.target);
  }
  const rank = new Map(byReading(placed.keys()).map((id, index) => [id, index]));
  const position = (id: string) => rank.get(id) ?? 0;
  for (const list of outgoing.values())
    list.sort((a, b) => position(a.target) - position(b.target) || (a.id < b.id ? -1 : 1));

  const children = new Map<string, string[]>();
  for (const node of Object.values(doc.nodes)) {
    if (node.parentId !== null && placed.has(node.parentId))
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  }
  const outermost = (id: string): string => {
    const seen = new Set<string>();
    let current = id;
    for (
      let parent = doc.nodes[current]?.parentId ?? null;
      parent !== null && placed.has(parent) && !seen.has(parent);
      parent = doc.nodes[current]?.parentId ?? null
    ) {
      seen.add(parent);
      current = parent;
    }
    return current;
  };

  const items: RevealItem[] = [];
  const emitted = new Set<string>();
  const queue: string[] = [];

  const emitNode = (id: string) => {
    if (emitted.has(id)) return;
    emitted.add(id);
    items.push({ kind: "node", id });
    for (const child of byReading(children.get(id) ?? [])) emitNode(child);
    const edges = outgoing.get(id) ?? [];
    if (edges.length > 0) items.push({ kind: "connectors", source: id, ids: edges.map((edge) => edge.id) });
    queue.push(...edges.map((edge) => edge.target));
  };

  const walk = (start: string) => {
    queue.push(start);
    for (let head = 0; head < queue.length; head += 1) {
      const id = queue[head];
      if (id !== undefined && !emitted.has(id)) emitNode(outermost(id));
    }
    queue.length = 0;
  };

  const roots = byReading([...connected].filter((id) => !incoming.has(id) && outgoing.has(id)));
  const [topmost] = byReading(connected);
  for (const root of roots.length > 0 ? roots : topmost === undefined ? [] : [topmost]) walk(root);
  for (const id of byReading(placed.keys())) if (!emitted.has(id)) walk(id);
  return items;
}
