import { KIND_TRAITS } from "./nodeKinds";
import type { DiagramEdge, DiagramNode, DocumentState, NodeKind } from "./types";

// Find in diagram. The search reads the document, never the page, so a step
// that is scrolled out of view (or not rendered at all) is still found.
//
// A small index holds one entry per piece of text: node text by category,
// plus connector labels. It is rebuilt incrementally: an entry is reused while
// its node or connector object is unchanged, so typing in one step re-reads
// only that step. Matching is a plain, case-insensitive substring search on
// case-folded text. The query is never turned into a regular expression, so
// characters like "(" or "*" are just characters, and highlights are returned
// as text segments for the view to render, never as HTML.

export const SEARCH_CATEGORIES = ["steps", "notes", "groups", "connectors"] as const;
export type SearchResultKind = (typeof SEARCH_CATEGORIES)[number];
export type CategoryFilter = SearchResultKind | "all";

export const CATEGORY_LABELS: Readonly<Record<SearchResultKind, string>> = {
  steps: "Steps",
  notes: "Notes",
  groups: "Groups",
  connectors: "Connector labels",
};

const NODE_CATEGORY: Readonly<Record<NodeKind, SearchResultKind | null>> = {
  step: "steps",
  decision: "steps",
  "start-end": "steps",
  shape: "steps",
  note: "notes",
  label: "notes",
  group: "groups",
  line: null,
  sketch: null,
};

export interface SearchEntry {
  /** The node, or for connector labels the connector. */
  readonly targetId: string;
  readonly target: "node" | "edge";
  readonly category: SearchResultKind;
  readonly text: string;
  readonly folded: string;
  /** "Step 12", "Note 3"…, or the connector's ends. */
  readonly badge: string;
}

/**
 * Lower-cases one UTF-16 unit at a time, keeping any unit whose lower-case
 * form is longer (like "İ"), so positions in the folded text are positions in
 * the original and highlights never drift.
 */
export function foldCase(text: string): string {
  let folded = "";
  for (let at = 0; at < text.length; at += 1) {
    const unit = text.charAt(at);
    const lower = unit.toLowerCase();
    folded += lower.length === 1 ? lower : unit;
  }
  return folded;
}

const badgeOf = (node: DiagramNode) => `${KIND_TRAITS[node.kind].label} ${String(node.number)}`;

function nodeEntry(node: DiagramNode): SearchEntry | null {
  const category = NODE_CATEGORY[node.kind];
  const text = typeof node.data.text === "string" ? node.data.text : "";
  if (category === null || text.trim() === "") return null;
  return { targetId: node.id, target: "node", category, text, folded: foldCase(text), badge: badgeOf(node) };
}

function edgeEntry(edge: DiagramEdge, state: DocumentState): SearchEntry | null {
  const text = edge.label?.text ?? "";
  if (text.trim() === "") return null;
  const source = state.nodes[edge.source];
  const target = state.nodes[edge.target];
  const badge = source && target ? `${String(source.number)} → ${String(target.number)}` : "Connector";
  return { targetId: edge.id, target: "edge", category: "connectors", text, folded: foldCase(text), badge };
}

/** An index builder that reuses entries for unchanged nodes and connectors. */
export function createSearchIndex() {
  let nodeCache = new Map<string, { node: DiagramNode; entry: SearchEntry | null }>();
  let edgeCache = new Map<string, { edge: DiagramEdge; badgeKey: string; entry: SearchEntry | null }>();
  return (state: DocumentState): SearchEntry[] => {
    const entries: SearchEntry[] = [];
    const nextNodes = new Map<string, { node: DiagramNode; entry: SearchEntry | null }>();
    for (const node of Object.values(state.nodes)) {
      const cached = nodeCache.get(node.id);
      const entry = cached?.node === node ? cached.entry : nodeEntry(node);
      nextNodes.set(node.id, { node, entry });
      if (entry) entries.push(entry);
    }
    const nextEdges = new Map<string, { edge: DiagramEdge; badgeKey: string; entry: SearchEntry | null }>();
    for (const edge of Object.values(state.edges)) {
      const badgeKey = `${String(state.nodes[edge.source]?.number)}:${String(state.nodes[edge.target]?.number)}`;
      const cached = edgeCache.get(edge.id);
      const entry = cached?.edge === edge && cached.badgeKey === badgeKey ? cached.entry : edgeEntry(edge, state);
      nextEdges.set(edge.id, { edge, badgeKey, entry });
      if (entry) entries.push(entry);
    }
    nodeCache = nextNodes;
    edgeCache = nextEdges;
    return entries;
  };
}

/** Characters of context kept on each side of a match. */
export const EXCERPT_CONTEXT = 20;

export interface Excerpt {
  readonly before: string;
  readonly match: string;
  readonly after: string;
  /** Text was cut before `before` or after `after`. */
  readonly cutStart: boolean;
  readonly cutEnd: boolean;
}

export interface SearchHit {
  readonly entry: SearchEntry;
  readonly excerpt: Excerpt;
}

export interface SearchOutcome {
  readonly hits: readonly SearchHit[];
  /** Matches per category, independent of the chosen filter; "all" is their sum. */
  readonly counts: Readonly<Record<CategoryFilter, number>>;
}

function excerptOf(text: string, start: number, length: number): Excerpt {
  const from = Math.max(0, start - EXCERPT_CONTEXT);
  const to = Math.min(text.length, start + length + EXCERPT_CONTEXT);
  const flat = (part: string) => part.replace(/\s+/g, " ");
  return {
    before: flat(text.slice(from, start)),
    match: flat(text.slice(start, start + length)),
    after: flat(text.slice(start + length, to)),
    cutStart: from > 0,
    cutEnd: to < text.length,
  };
}

const zeroCounts = (): Record<CategoryFilter, number> => ({ all: 0, steps: 0, notes: 0, groups: 0, connectors: 0 });

/** One hit per matching entry (its first match), in document order, filtered to `filter`. An empty query finds nothing. */
export function searchEntries(
  entries: readonly SearchEntry[],
  query: string,
  filter: CategoryFilter = "all",
): SearchOutcome {
  const needle = foldCase(query.trim());
  const counts = zeroCounts();
  if (needle === "") return { hits: [], counts };
  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const at = entry.folded.indexOf(needle);
    if (at < 0) continue;
    counts[entry.category] += 1;
    counts.all += 1;
    if (filter === "all" || filter === entry.category)
      hits.push({ entry, excerpt: excerptOf(entry.text, at, needle.length) });
  }
  return { hits, counts };
}
