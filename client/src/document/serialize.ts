import {
  EDGE_KINDS,
  LAYOUT_DIRECTIONS,
  LAYOUT_ENGINES,
  NODE_KINDS,
  ROUTE_STYLES,
  SCHEMA_VERSION,
  SIDES,
  TEXT_ALIGNMENTS,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramLayout,
  type DiagramNode,
  type DocumentState,
  type EdgeLabel,
  type EdgePlacement,
  type LayoutDirection,
  type LayoutEngineName,
  type NodePlacement,
  type Point,
  type Route,
  type RoutePoint,
  type Side,
  type Size,
  type Style,
  type TextAlignment,
} from "./types";

// Converting between the stored document and the in-memory state. Loading is
// defensive: the server validates every save, but documents may come from
// older builds or imports, so missing optional fields get defaults and broken
// references are repaired or dropped, with a report, instead of crashing.

export interface LoadReport {
  /** Entries that were not objects or had no usable id. */
  readonly droppedNodes: number;
  /** Edges whose endpoints do not exist. */
  readonly droppedEdges: number;
  /** Children whose parent was found through its stable key instead of its id. */
  readonly reparented: readonly string[];
  /** Children whose parent could not be found; moved to the top level at their absolute position. */
  readonly detached: readonly string[];
}

export interface LoadResult {
  readonly state: DocumentState;
  readonly report: LoadReport;
}

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

const DEFAULT_SIZE: Size = { width: 180, height: 64 };

function point(value: unknown): Point {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
    ? { x: value.x, y: value.y }
    : { x: 0, y: 0 };
}

function size(value: unknown): Size {
  if (!isRecord(value)) return DEFAULT_SIZE;
  const { width, height } = value;
  return isFiniteNumber(width) && isFiniteNumber(height) && width > 0 && height > 0 ? { width, height } : DEFAULT_SIZE;
}

function style(value: unknown): Style {
  if (!isRecord(value)) return {};
  const result: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" || typeof entry === "boolean" || isFiniteNumber(entry)) result[key] = entry;
  }
  return result;
}

function side(value: unknown): Side | null {
  return SIDES.includes(value as Side) ? (value as Side) : null;
}

function routePoints(value: unknown): RoutePoint[] {
  return (Array.isArray(value) ? value : [])
    .filter((entry): entry is Raw => isRecord(entry) && isId(entry.id))
    .map((entry) => ({
      ...point(entry),
      id: entry.id as string,
      ...(entry.userCreated === true ? { userCreated: true } : {}),
      ...(entry.axis === "x" || entry.axis === "y" ? { axis: entry.axis } : {}),
    }));
}

function route(value: unknown): Route {
  const raw = isRecord(value) ? value : {};
  return { style: oneOf(ROUTE_STYLES, raw.style, "step"), points: routePoints(raw.points) };
}

function placement(value: unknown): NodePlacement | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  return isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    width > 0 &&
    height > 0
    ? { x, y, width, height }
    : null;
}

function edgePlacement(value: unknown): EdgePlacement | null {
  if (!isRecord(value)) return null;
  return { sourceSide: side(value.sourceSide), targetSide: side(value.targetSide), points: routePoints(value.points) };
}

function entriesOf<T>(value: unknown, parse: (entry: unknown) => T | null): Record<string, T> {
  const result: Record<string, T> = {};
  if (!isRecord(value)) return result;
  for (const [id, entry] of Object.entries(value)) {
    const parsed = parse(entry);
    if (parsed !== null) result[id] = parsed;
  }
  return result;
}

/** The active automatic layout, or null (manual) when absent or unusable. */
function layout(value: unknown): DiagramLayout | null {
  if (
    !isRecord(value) ||
    !LAYOUT_ENGINES.includes(value.engine as LayoutEngineName) ||
    !LAYOUT_DIRECTIONS.includes(value.direction as LayoutDirection)
  )
    return null;
  const manual = isRecord(value.manual) ? value.manual : {};
  return {
    engine: value.engine as LayoutEngineName,
    direction: value.direction as LayoutDirection,
    manual: { nodes: entriesOf(manual.nodes, placement), edges: entriesOf(manual.edges, edgePlacement) },
  };
}

const LABEL_NUMBERS = ["fontSize", "maxWidth", "padding", "borderWidth"] as const;
const LABEL_FLAGS = ["bold", "italic", "underline", "border"] as const;
const LABEL_COLORS = ["color", "background", "borderColor"] as const;

/** Keeps the label's known keys with the right types; a missing or invalid `t` means automatic placement. */
function label(value: unknown): EdgeLabel | null {
  if (!isRecord(value) || typeof value.text !== "string") return null;
  const result: Record<string, unknown> = { text: value.text };
  if (isFiniteNumber(value.t)) result.t = Math.min(1, Math.max(0, value.t));
  for (const key of LABEL_NUMBERS) if (isFiniteNumber(value[key])) result[key] = value[key];
  for (const key of LABEL_FLAGS) if (typeof value[key] === "boolean") result[key] = value[key];
  for (const key of LABEL_COLORS) if (typeof value[key] === "string") result[key] = value[key];
  if (TEXT_ALIGNMENTS.includes(value.align as TextAlignment)) result.align = value.align;
  return result as unknown as EdgeLabel;
}

function parseNode(raw: Raw, index: number): DiagramNode {
  const id = raw.id as string;
  return {
    id,
    key: isId(raw.key) ? raw.key : id,
    kind: oneOf(NODE_KINDS, raw.kind, "step"),
    number: isFiniteNumber(raw.number) && raw.number > 0 ? Math.floor(raw.number) : index + 1,
    position: point(raw.position),
    size: size(raw.size),
    parentId: isId(raw.parentId) ? raw.parentId : null,
    z: isFiniteNumber(raw.z) ? Math.floor(raw.z) : index + 1,
    style: style(raw.style),
    data: isRecord(raw.data) ? raw.data : {},
  };
}

function parseEdge(raw: Raw): DiagramEdge {
  const id = raw.id as string;
  return {
    id,
    key: isId(raw.key) ? raw.key : id,
    kind: oneOf(EDGE_KINDS, raw.kind, "connector"),
    source: raw.source as string,
    target: raw.target as string,
    sourceSide: side(raw.sourceSide),
    targetSide: side(raw.targetSide),
    route: route(raw.route),
    label: label(raw.label),
    style: style(raw.style),
  };
}

/** Resolves stale node references through ids first, then stable keys. */
function aliasLookup(nodes: Map<string, DiagramNode>): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const node of nodes.values()) if (!aliases.has(node.key)) aliases.set(node.key, node.id);
  for (const node of nodes.values()) aliases.set(node.id, node.id);
  return aliases;
}

function repairParents(nodes: Map<string, DiagramNode>, aliases: Map<string, string>) {
  const reparented: string[] = [];
  const detached: string[] = [];
  const original = new Map(nodes);
  const absolute = (id: string): Point => {
    let x = 0;
    let y = 0;
    const seen = new Set<string>();
    for (
      let node = original.get(id);
      node && !seen.has(node.id);
      node = node.parentId ? original.get(aliases.get(node.parentId) ?? "") : undefined
    ) {
      seen.add(node.id);
      x += node.position.x;
      y += node.position.y;
    }
    return { x, y };
  };

  for (const node of original.values()) {
    if (node.parentId === null) continue;
    const resolved = aliases.get(node.parentId);
    const parent = resolved === undefined ? undefined : nodes.get(resolved);
    if (parent?.kind === "group" && !createsCycle(nodes, node.id, parent.id)) {
      if (parent.id !== node.parentId) {
        nodes.set(node.id, { ...node, parentId: parent.id });
        reparented.push(node.id);
      }
      continue;
    }
    // Never guess a parent: keep the node where it appears, at the top level.
    nodes.set(node.id, { ...node, parentId: null, position: absolute(node.id) });
    detached.push(node.id);
  }
  return { reparented, detached };
}

function createsCycle(nodes: Map<string, DiagramNode>, id: string, parentId: string): boolean {
  const seen = new Set<string>();
  for (
    let current: string | null = parentId;
    current !== null && !seen.has(current);
    current = nodes.get(current)?.parentId ?? null
  ) {
    if (current === id) return true;
    seen.add(current);
  }
  return false;
}

/** Parses any JSON value into a valid in-memory document, repairing what it can. */
export function parseDocument(value: unknown): LoadResult {
  const raw = isRecord(value) ? value : {};
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];

  const nodes = new Map<string, DiagramNode>();
  rawNodes.forEach((entry: unknown, index) => {
    if (isRecord(entry) && isId(entry.id) && !nodes.has(entry.id)) nodes.set(entry.id, parseNode(entry, index));
  });
  const aliases = aliasLookup(nodes);
  const { reparented, detached } = repairParents(nodes, aliases);

  const edges: Record<string, DiagramEdge> = {};
  let droppedEdges = 0;
  for (const entry of rawEdges) {
    if (!isRecord(entry) || !isId(entry.id) || entry.id in edges) {
      droppedEdges += 1;
      continue;
    }
    const source = aliases.get(entry.source as string);
    const target = aliases.get(entry.target as string);
    if (source === undefined || target === undefined) {
      droppedEdges += 1;
      continue;
    }
    edges[entry.id] = parseEdge({ ...entry, source, target });
  }

  const highest = Math.max(0, ...[...nodes.values()].map((node) => node.number));
  const nextNumber = isFiniteNumber(raw.nextNumber) ? Math.max(Math.floor(raw.nextNumber), highest + 1) : highest + 1;

  const active = layout(raw.layout);
  return {
    state: { nodes: Object.fromEntries(nodes), edges, nextNumber, ...(active ? { layout: active } : {}) },
    report: { droppedNodes: rawNodes.length - nodes.size, droppedEdges, reparented, detached },
  };
}

/**
 * Nodes ordered for storage and rendering: every parent before its children
 * (the canvas library requires it), and by stacking order within a level.
 */
export function orderedNodes(state: DocumentState): DiagramNode[] {
  const byParent = new Map<string | null, DiagramNode[]>();
  for (const node of Object.values(state.nodes)) {
    const parent = node.parentId !== null && state.nodes[node.parentId] ? node.parentId : null;
    const siblings = byParent.get(parent) ?? [];
    siblings.push(node);
    byParent.set(parent, siblings);
  }
  for (const siblings of byParent.values())
    siblings.sort((a, b) => a.z - b.z || a.number - b.number || (a.id < b.id ? -1 : 1));

  const result: DiagramNode[] = [];
  const queue = [...(byParent.get(null) ?? [])];
  for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
    result.push(node);
    queue.push(...(byParent.get(node.id) ?? []));
  }
  return result;
}

/** The stored form of a state. */
export function serializeDocument(state: DocumentState): DiagramDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    nodes: orderedNodes(state),
    edges: Object.values(state.edges),
    nextNumber: state.nextNumber,
    ...(state.layout ? { layout: state.layout } : {}),
  };
}
