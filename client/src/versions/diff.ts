import { jsonEqual } from "../document/operations";
import { KIND_TRAITS } from "../document/nodeKinds";
import type { DiagramEdge, DiagramNode, DocumentState } from "../document/types";

// What changed between two versions of a diagram.
//
// Steps and connectors are matched by their stable identity key, never by id:
// ids are remapped whenever a version is copied (server/app/services/
// version_copy.rb), while the key is made once and kept forever. Matching by
// id would report every step of a copy as removed and added again.
//
// Each key is classified once:
// - only in the newer document: added;
// - only in the older one: removed;
// - in both: changed when anything a person can see differs (geometry, kind,
//   stacking, data or style), compared with key-order-independent deep
//   equality. References (a child's group, a connector's ends) are compared
//   through the keys they point at, so a copy that renamed every id still
//   counts as unchanged;
// - otherwise unchanged.
//
// A key used by more than one entity in the same document (only possible in
// hand-edited data) is matched by id for those entities, so nothing is
// silently paired with the wrong twin.

export type ChangeStatus = "added" | "removed" | "changed" | "unchanged";
export type ChangeKind = Exclude<ChangeStatus, "unchanged">;

/** Differences smaller than this (in canvas units) are rounding, not edits. */
export const GEOMETRY_TOLERANCE = 1e-6;

export interface FieldChange {
  /** The field that differs: "position", "size", "parent", "kind", "z", "data.text", "style.fill", "route", … */
  readonly field: string;
  /** A short sentence for the diff card ("Moved", "Fill: #ffffff → #fde68a"). */
  readonly description: string;
}

export interface EntityDiff {
  /** The matching key (the stable identity key, or key + id for duplicates). */
  readonly match: string;
  readonly status: ChangeStatus;
  readonly olderId: string | null;
  readonly newerId: string | null;
  /** For changed entities, what differs; empty otherwise. */
  readonly changes: readonly FieldChange[];
}

export type ChangeCounts = Readonly<Record<ChangeKind, number>>;

export interface SideStatus {
  readonly nodes: Readonly<Record<string, ChangeStatus>>;
  readonly edges: Readonly<Record<string, ChangeStatus>>;
}

export interface DocumentDiff {
  readonly nodes: readonly EntityDiff[];
  readonly edges: readonly EntityDiff[];
  readonly counts: { readonly nodes: ChangeCounts; readonly edges: ChangeCounts };
  /** The automatic layout was switched on, off or changed. */
  readonly layout: FieldChange | null;
  /** Nothing differs. */
  readonly identical: boolean;
  /** Status by id in the older document (removed, changed or unchanged). */
  readonly older: SideStatus;
  /** Status by id in the newer document (added, changed or unchanged). */
  readonly newer: SideStatus;
}

interface Identified {
  readonly id: string;
  readonly key: string;
}

/** Entities by matching key; keys used more than once in this document are qualified with the id. */
export function matchKeys<T extends Identified>(entities: Readonly<Record<string, T>>): Map<string, T> {
  const uses = new Map<string, number>();
  for (const entity of Object.values(entities)) uses.set(entity.key, (uses.get(entity.key) ?? 0) + 1);
  const result = new Map<string, T>();
  for (const entity of Object.values(entities))
    result.set((uses.get(entity.key) ?? 0) > 1 ? `${entity.key}\u0000${entity.id}` : entity.key, entity);
  return result;
}

/** The matching key of every entity, by id (the inverse of matchKeys). */
function matchById<T extends Identified>(matched: Map<string, T>): Map<string, string> {
  return new Map([...matched].map(([match, entity]) => [entity.id, match]));
}

const MAX_SHOWN = 32;

type Scalar = string | number | boolean | null | undefined;

const isScalar = (value: unknown): value is Scalar =>
  value === undefined || value === null || typeof value !== "object";

/** A plain value as it reads in a diff card. */
export function formatValue(value: Scalar): string {
  if (value === undefined || value === null) return "none";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_SHOWN ? `“${text.slice(0, MAX_SHOWN - 1)}…”` : `“${text}”`;
}

const near = (a: number, b: number) => Math.abs(a - b) <= GEOMETRY_TOLERANCE;

/** One entry per key of `data` or `style` whose value differs. */
function keyChanges(
  prefix: "data" | "style",
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const from = before[key];
    const to = after[key];
    if (jsonEqual(from, to)) continue;
    const description =
      prefix === "data" && key === "text"
        ? "Text changed"
        : isScalar(from) && isScalar(to)
          ? `${capitalize(key)}: ${formatValue(from)} → ${formatValue(to)}`
          : `${capitalize(key)} changed`;
    changes.push({ field: `${prefix}.${key}`, description });
  }
  return changes;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Lookup {
  readonly older: Map<string, string>;
  readonly newer: Map<string, string>;
}

function parentChange(older: DiagramNode, newer: DiagramNode, lookup: Lookup): FieldChange | null {
  const from = older.parentId === null ? null : (lookup.older.get(older.parentId) ?? `missing:${older.parentId}`);
  const to = newer.parentId === null ? null : (lookup.newer.get(newer.parentId) ?? `missing:${newer.parentId}`);
  if (from === to) return null;
  const description =
    from === null ? "Moved into a group" : to === null ? "Moved out of its group" : "Moved to another group";
  return { field: "parent", description };
}

/** What differs between two matched steps; empty when nothing does. */
export function nodeChanges(older: DiagramNode, newer: DiagramNode, lookup: Lookup): FieldChange[] {
  const changes: FieldChange[] = [];
  if (older.kind !== newer.kind)
    changes.push({
      field: "kind",
      description: `Kind: ${KIND_TRAITS[older.kind].label} → ${KIND_TRAITS[newer.kind].label}`,
    });
  const parent = parentChange(older, newer, lookup);
  if (parent) changes.push(parent);
  if (!near(older.position.x, newer.position.x) || !near(older.position.y, newer.position.y))
    changes.push({ field: "position", description: "Moved" });
  if (!near(older.size.width, newer.size.width) || !near(older.size.height, newer.size.height))
    changes.push({ field: "size", description: "Resized" });
  if (older.z !== newer.z) changes.push({ field: "z", description: "Stacking order changed" });
  return [...changes, ...keyChanges("data", older.data, newer.data), ...keyChanges("style", older.style, newer.style)];
}

function endChange(
  field: "source" | "target",
  older: DiagramEdge,
  newer: DiagramEdge,
  lookup: Lookup,
): FieldChange | null {
  const from = lookup.older.get(older[field]) ?? older[field];
  const to = lookup.newer.get(newer[field]) ?? newer[field];
  return from === to
    ? null
    : { field, description: field === "source" ? "Starts at another step" : "Ends at another step" };
}

/** What differs between two matched connectors; empty when nothing does. */
export function edgeChanges(older: DiagramEdge, newer: DiagramEdge, lookup: Lookup): FieldChange[] {
  const changes: FieldChange[] = [];
  if (older.kind !== newer.kind) changes.push({ field: "kind", description: `Kind: ${older.kind} → ${newer.kind}` });
  for (const field of ["source", "target"] as const) {
    const change = endChange(field, older, newer, lookup);
    if (change) changes.push(change);
  }
  if (older.sourceSide !== newer.sourceSide || older.targetSide !== newer.targetSide)
    changes.push({ field: "sides", description: "Attached to other sides" });
  if (older.route.style !== newer.route.style)
    changes.push({ field: "route.style", description: `Route: ${older.route.style} → ${newer.route.style}` });
  if (!jsonEqual(older.route.points, newer.route.points))
    changes.push({ field: "route.points", description: "Route points changed" });
  if (older.label?.text !== newer.label?.text) changes.push({ field: "label.text", description: "Label text changed" });
  else if (!jsonEqual(older.label, newer.label)) changes.push({ field: "label", description: "Label style changed" });
  return [...changes, ...keyChanges("style", older.style, newer.style)];
}

function layoutChange(older: DocumentState, newer: DocumentState): FieldChange | null {
  const describe = (state: DocumentState) =>
    state.layout ? `${state.layout.engine} ${state.layout.direction}` : "off";
  const from = describe(older);
  const to = describe(newer);
  return from === to ? null : { field: "layout", description: `Automatic layout: ${from} → ${to}` };
}

interface Classified {
  readonly entries: EntityDiff[];
  readonly counts: Record<ChangeKind, number>;
  readonly older: Record<string, ChangeStatus>;
  readonly newer: Record<string, ChangeStatus>;
}

function classify<T extends Identified>(
  olderEntities: Map<string, T>,
  newerEntities: Map<string, T>,
  changesOf: (older: T, newer: T) => FieldChange[],
): Classified {
  const result: Classified = { entries: [], counts: { added: 0, removed: 0, changed: 0 }, older: {}, newer: {} };
  const record = (entry: EntityDiff) => {
    result.entries.push(entry);
    if (entry.status !== "unchanged") result.counts[entry.status] += 1;
    if (entry.olderId !== null) result.older[entry.olderId] = entry.status;
    if (entry.newerId !== null) result.newer[entry.newerId] = entry.status;
  };
  for (const [match, older] of olderEntities) {
    const newer = newerEntities.get(match);
    if (!newer) {
      record({ match, status: "removed", olderId: older.id, newerId: null, changes: [] });
      continue;
    }
    const changes = changesOf(older, newer);
    record({
      match,
      status: changes.length > 0 ? "changed" : "unchanged",
      olderId: older.id,
      newerId: newer.id,
      changes,
    });
  }
  for (const [match, newer] of newerEntities) {
    if (!olderEntities.has(match)) record({ match, status: "added", olderId: null, newerId: newer.id, changes: [] });
  }
  return result;
}

/** Compares two documents (older first) by stable identity key. */
export function diffDocuments(older: DocumentState, newer: DocumentState): DocumentDiff {
  const olderNodes = matchKeys(older.nodes);
  const newerNodes = matchKeys(newer.nodes);
  const lookup: Lookup = { older: matchById(olderNodes), newer: matchById(newerNodes) };
  const nodes = classify(olderNodes, newerNodes, (a, b) => nodeChanges(a, b, lookup));
  const edges = classify(matchKeys(older.edges), matchKeys(newer.edges), (a, b) => edgeChanges(a, b, lookup));
  const layout = layoutChange(older, newer);
  const total = (counts: ChangeCounts) => counts.added + counts.removed + counts.changed;
  return {
    nodes: nodes.entries,
    edges: edges.entries,
    counts: { nodes: nodes.counts, edges: edges.counts },
    layout,
    identical: total(nodes.counts) + total(edges.counts) === 0 && layout === null,
    older: { nodes: nodes.older, edges: edges.older },
    newer: { nodes: nodes.newer, edges: edges.newer },
  };
}

/**
 * True when two documents show the same diagram: version de-duplication on
 * the client. (The server's VersionContent makes the same check by id.)
 */
export function sameContent(a: DocumentState, b: DocumentState): boolean {
  return a === b || diffDocuments(a, b).identical;
}
