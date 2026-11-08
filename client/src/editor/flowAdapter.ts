import { Position, type Edge, type Node, type NodeHandle } from "@xyflow/react";
import { edgeLook, type EdgeLayer } from "../document/connectorData";
import { DEFAULT_SIZES } from "../document/factory";
import { KIND_TRAITS } from "../document/nodeKinds";
import { orderedNodes } from "../document/serialize";
import {
  SIDES,
  type DiagramEdge,
  type DiagramNode,
  type DocumentState,
  type Point,
  type Side,
  type Size,
} from "../document/types";
import { groupLayers } from "../document/zorder";
import { reuseList } from "../perf/guards";
import type { ConnectorDefaults, LiveFields, PendingDrop } from "./store";

// Maps the document onto the canvas library's node and edge objects. The
// document stays the source of truth; these objects are a view of it.
//
// Each mapper keeps the previous output per id and reuses it when nothing that
// feeds it changed, so the canvas only re-renders nodes that really changed
// (dragging one node does not create new objects for the others).
//
// Stacking (the canvas runs in manual z-index mode): groups get negative
// z-indices, below the edge layer at 0, ordered outer groups first; every
// other node uses its own stack order (1 and up), so edges draw above group
// backgrounds and below the nodes inside them. A node being dragged is lifted
// above everything until it is released. Connectors draw above steps by
// default ("normal" layer); "back" puts them below steps (still above group
// backgrounds), "front" above the normal ones, and a selected connector is
// raised to the top while selected.
//
// A connection dropped on empty canvas shows a ghost step and ghost
// connectors. They exist only here, never in the document.
//
// Performance: the ordered node list and the group layers are derived
// once per document, not once per frame; when no output object changed, the
// previous array itself is returned. Under visible-only rendering a node that
// was never mounted has no measured handles, so the library would skip its
// connectors; such nodes carry static side-centre handles until measured.

export type CanvasNodeData = { readonly node: DiagramNode } & Record<string, unknown>;
export type CanvasEdgeData = {
  readonly edge: DiagramEdge;
  /** The source or target step is selected (shows the route handles). */
  readonly endpointSelected: boolean;
  /** A transient connector to the ghost step of a pending drop. */
  readonly ghost: boolean;
} & Record<string, unknown>;
export type CanvasNode = Node<CanvasNodeData>;
export type CanvasEdge = Edge<CanvasEdgeData>;

export interface NodeView {
  readonly doc: DocumentState;
  readonly selected: readonly string[];
  readonly dragPositions: Readonly<Record<string, Point>>;
  readonly measured: Readonly<Record<string, Size>>;
  readonly canEdit: boolean;
  readonly live?: Readonly<Record<string, LiveFields>>;
  readonly editingNodeId?: string | null;
  /** Alt is held: children are not confined to their group. */
  readonly detachMode?: boolean;
  readonly pendingDrop?: PendingDrop | null;
  /** Visible-only rendering is active: unmeasured nodes need static handles. */
  readonly staticHandles?: boolean;
}

export interface MapperOptions {
  /** Reuse unchanged outputs, derived lists and the array itself (the `no-guards` flag turns this off). */
  readonly reuse?: boolean;
}

interface NodeCacheEntry {
  readonly node: DiagramNode;
  readonly selected: boolean;
  readonly position: Point | undefined;
  readonly measured: Size | undefined;
  readonly live: LiveFields | undefined;
  readonly editing: boolean;
  readonly confined: boolean;
  readonly zIndex: number;
  readonly canEdit: boolean;
  readonly staticHandles: boolean;
  readonly output: CanvasNode;
}

/** Added to the stack order of a node while it is dragged. */
export const DRAG_LIFT = 1_000_000;

/** Connector z-indices per layer; a selected connector is raised above all of them. */
export const EDGE_LAYER_Z: Readonly<Record<EdgeLayer, number>> = { back: 0, normal: 500_000, front: 600_000 };
export const SELECTED_EDGE_Z = 700_000;

export const GHOST_NODE_ID = "ghost-drop";

function ghostNode(drop: PendingDrop): DiagramNode {
  const size = DEFAULT_SIZES.step;
  return {
    id: GHOST_NODE_ID,
    key: GHOST_NODE_ID,
    kind: "step",
    number: 0,
    position: { x: drop.position.x - size.width / 2, y: drop.position.y - size.height / 2 },
    size,
    parentId: null,
    z: 0,
    style: {},
    data: { text: "" },
  };
}

const NO_LIVE: Readonly<Record<string, LiveFields>> = {};

function withLive(node: DiagramNode, live: LiveFields | undefined): DiagramNode {
  if (!live) return node;
  return { ...node, ...live, data: live.data ? { ...node.data, ...live.data } : node.data };
}

const SIDE_POSITIONS: Readonly<Record<Side, Position>> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/** One 1 × 1 handle at the centre of each side, the same ids the rendered ports use. */
export function sideHandles({ width, height }: Size): NodeHandle[] {
  const centre: Readonly<Record<Side, Point>> = {
    top: { x: width / 2, y: 0 },
    right: { x: width, y: height / 2 },
    bottom: { x: width / 2, y: height },
    left: { x: 0, y: height / 2 },
  };
  return SIDES.map((side) => ({
    id: side,
    type: "source",
    position: SIDE_POSITIONS[side],
    x: centre[side].x,
    y: centre[side].y,
    width: 1,
    height: 1,
  }));
}

/** Derived lists of one document, recomputed only when the document object changes. */
function derivedLists(reuse: boolean) {
  let last: {
    readonly doc: DocumentState;
    readonly ordered: readonly DiagramNode[];
    readonly groups: ReadonlyMap<string, number>;
  } | null = null;
  return (doc: DocumentState) => {
    if (reuse && last?.doc === doc) return last;
    last = { doc, ordered: orderedNodes(doc), groups: groupLayers(doc) };
    return last;
  };
}

export function createNodeMapper({ reuse = true }: MapperOptions = {}) {
  let cache = new Map<string, NodeCacheEntry>();
  let ghostCache: { readonly drop: PendingDrop; readonly output: CanvasNode } | null = null;
  let previousResult: readonly CanvasNode[] | null = null;
  const lists = derivedLists(reuse);

  return function toCanvasNodes({
    doc,
    selected,
    dragPositions,
    measured,
    canEdit,
    live = NO_LIVE,
    editingNodeId = null,
    detachMode = false,
    pendingDrop = null,
    staticHandles = false,
  }: NodeView): CanvasNode[] {
    const selectedSet = new Set(selected);
    const { ordered, groups } = lists(doc);
    const next = new Map<string, NodeCacheEntry>();
    const result = ordered.map((stored) => {
      const isSelected = selectedSet.has(stored.id);
      const position = dragPositions[stored.id];
      const size = measured[stored.id];
      const liveFields = live[stored.id];
      const editing = editingNodeId === stored.id;
      const confined = stored.parentId !== null && !detachMode;
      const zIndex = groups.get(stored.id) ?? Math.max(1, stored.z) + (position ? DRAG_LIFT : 0);
      const handles = staticHandles && !size && KIND_TRAITS[stored.kind].connectable;
      const previous = reuse ? cache.get(stored.id) : undefined;
      if (
        previous?.node === stored &&
        previous.selected === isSelected &&
        previous.position === position &&
        previous.measured === size &&
        previous.live === liveFields &&
        previous.editing === editing &&
        previous.confined === confined &&
        previous.zIndex === zIndex &&
        previous.canEdit === canEdit &&
        previous.staticHandles === handles
      ) {
        next.set(stored.id, previous);
        return previous.output;
      }
      const node = withLive(stored, liveFields);
      const output: CanvasNode = {
        id: node.id,
        type: node.kind,
        position: position ?? node.position,
        width: node.size.width,
        height: node.size.height,
        data: { node },
        selected: isSelected,
        draggable: canEdit && !editing,
        connectable: canEdit && KIND_TRAITS[node.kind].connectable,
        zIndex,
        ...(node.parentId ? { parentId: node.parentId } : {}),
        ...(confined ? { extent: "parent" as const } : {}),
        ...(size ? { measured: size } : {}),
        ...(handles ? { handles: sideHandles(node.size) } : {}),
      };
      next.set(stored.id, {
        node: stored,
        selected: isSelected,
        position,
        measured: size,
        live: liveFields,
        editing,
        confined,
        zIndex,
        canEdit,
        staticHandles: handles,
        output,
      });
      return output;
    });
    cache = next;
    if (pendingDrop) {
      // Kept while the drop is pending, so the canvas keeps its measured handles.
      if (ghostCache?.drop !== pendingDrop) {
        const ghost = ghostNode(pendingDrop);
        ghostCache = {
          drop: pendingDrop,
          output: {
            id: GHOST_NODE_ID,
            type: "ghost",
            position: ghost.position,
            width: ghost.size.width,
            height: ghost.size.height,
            measured: ghost.size,
            data: { node: ghost },
            selectable: false,
            draggable: false,
            connectable: false,
            focusable: false,
            zIndex: DRAG_LIFT,
          },
        };
      }
      result.push(ghostCache.output);
    }
    if (!reuse) return result;
    // The canvas library compares the array first: an unchanged list costs it nothing.
    previousResult = reuseList(previousResult, result);
    return previousResult as CanvasNode[];
  };
}

interface EdgeCacheEntry {
  readonly edge: DiagramEdge;
  readonly selected: boolean;
  readonly endpointSelected: boolean;
  readonly ariaLabel: string;
  readonly output: CanvasEdge;
}

/** How a node is named to assistive technology: its text, or its kind and number. */
function nodeName(node: DiagramNode | undefined): string {
  if (!node) return "a removed step";
  const text = typeof node.data.text === "string" ? node.data.text.trim() : "";
  return text || `${KIND_TRAITS[node.kind].label} ${String(node.number)}`;
}

export interface EdgeView {
  readonly doc: DocumentState;
  readonly selected: readonly string[];
  readonly selectedNodes?: readonly string[];
  readonly pendingDrop?: PendingDrop | null;
  readonly defaults?: ConnectorDefaults;
}

/** The canvas library needs a handle id on both ends; automatic sides are resolved by the connector itself. */
const DEFAULT_SOURCE_SIDE: Side = "bottom";
const DEFAULT_TARGET_SIDE: Side = "top";
const DEFAULT_CONNECTOR: ConnectorDefaults = { kind: "connector", style: "step" };
const NO_IDS: readonly string[] = [];

function ghostEdges(drop: PendingDrop, defaults: ConnectorDefaults): CanvasEdge[] {
  return drop.sources.map((source, index) => {
    const id = `ghost-edge-${String(index)}`;
    const points =
      index === 0 && defaults.style !== "step"
        ? drop.sketch.map((point, at) => ({ id: `ghost-point-${String(at)}`, x: point.x, y: point.y }))
        : [];
    const edge: DiagramEdge = {
      id,
      key: id,
      kind: defaults.kind,
      source,
      target: GHOST_NODE_ID,
      sourceSide: drop.side,
      targetSide: null,
      route: { style: defaults.style, points },
      label: null,
      style: {},
    };
    return {
      id,
      type: edge.kind,
      source,
      target: GHOST_NODE_ID,
      sourceHandle: drop.side ?? DEFAULT_SOURCE_SIDE,
      targetHandle: DEFAULT_TARGET_SIDE,
      data: { edge, endpointSelected: false, ghost: true },
      selectable: false,
      focusable: false,
      zIndex: SELECTED_EDGE_Z,
    };
  });
}

export function createEdgeMapper({ reuse = true }: MapperOptions = {}) {
  let cache = new Map<string, EdgeCacheEntry>();
  let previousResult: readonly CanvasEdge[] | null = null;

  return function toCanvasEdges({
    doc,
    selected,
    selectedNodes = NO_IDS,
    pendingDrop = null,
    defaults = DEFAULT_CONNECTOR,
  }: EdgeView): CanvasEdge[] {
    const selectedSet = new Set(selected);
    const selectedNodeSet = new Set(selectedNodes);
    const next = new Map<string, EdgeCacheEntry>();
    const result = Object.values(doc.edges).map((edge) => {
      const isSelected = selectedSet.has(edge.id);
      const endpointSelected = selectedNodeSet.has(edge.source) || selectedNodeSet.has(edge.target);
      const ariaLabel = `Connector from ${nodeName(doc.nodes[edge.source])} to ${nodeName(doc.nodes[edge.target])}`;
      const previous = reuse ? cache.get(edge.id) : undefined;
      if (
        previous?.edge === edge &&
        previous.selected === isSelected &&
        previous.endpointSelected === endpointSelected &&
        previous.ariaLabel === ariaLabel
      ) {
        next.set(edge.id, previous);
        return previous.output;
      }
      const output: CanvasEdge = {
        id: edge.id,
        type: edge.kind,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceSide ?? DEFAULT_SOURCE_SIDE,
        targetHandle: edge.targetSide ?? DEFAULT_TARGET_SIDE,
        data: { edge, endpointSelected, ghost: false },
        selected: isSelected,
        ariaLabel,
        zIndex: isSelected ? SELECTED_EDGE_Z : EDGE_LAYER_Z[edgeLook(edge).layer],
      };
      next.set(edge.id, { edge, selected: isSelected, endpointSelected, ariaLabel, output });
      return output;
    });
    cache = next;
    if (pendingDrop) return [...result, ...ghostEdges(pendingDrop, defaults)];
    if (!reuse) return result;
    previousResult = reuseList(previousResult, result);
    return previousResult as CanvasEdge[];
  };
}
