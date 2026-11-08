import { applyOperation, type EdgeFields, type Operation } from "../../document/operations";
import { connectRefusal } from "../../document/connections";
import { MAX_ROUTE_POINTS } from "../../document/connectorData";
import { createEdge, createNode, DEFAULT_SIZES } from "../../document/factory";
import type { DocumentState, Point, Route, Side } from "../../document/types";
import { recordSketchPoint, sketchSpacing } from "../../routing/sketch";
import { documentEnds, sketchPoints } from "../connectorGeometry";
import { isConnectable, single, withoutKeys, type SliceContext } from "./shared";
import type { ConnectorDefaults, EditorActions } from "./types";

// Connectors: drawing a connection from a port (with its sketch), the ghost
// step of a drop on empty canvas, route points and styles, reconnecting an
// end, and label editing.

export type ConnectorSlice = Pick<
  EditorActions,
  | "connect"
  | "setConnectorDefaults"
  | "startConnection"
  | "setSketching"
  | "recordSketch"
  | "endConnection"
  | "connectMany"
  | "openDrop"
  | "cancelDrop"
  | "completeDrop"
  | "commitRoute"
  | "updateEdges"
  | "setRouteStyle"
  | "undoRouteStyle"
  | "dismissRouteNotice"
  | "reconnect"
  | "startLabelEdit"
  | "stopLabelEdit"
>;

/**
 * One `edge.add` per source that may connect to `target`, applied in turn so
 * each sees the previous ones. The sketch shapes the first connector only.
 */
function connectFrom(
  doc: DocumentState,
  defaults: ConnectorDefaults,
  sources: readonly string[],
  target: string,
  sides: { sourceSide: Side | null; targetSide: Side | null },
  sketch: readonly Point[],
): { ops: Operation[]; created: string[] } {
  const ops: Operation[] = [];
  const created: string[] = [];
  let state = doc;
  for (const source of sources) {
    if (connectRefusal(state, source, target) !== null) continue;
    const ends = { kind: defaults.kind, source, target, ...sides };
    const points =
      created.length === 0 && defaults.kind === "connector"
        ? sketchPoints(defaults.style, documentEnds(state, ends), sketch)
        : [];
    const edge = createEdge(source, target, { kind: defaults.kind, style: defaults.style, ...sides, points });
    const op: Operation = { type: "edge.add", edge };
    state = applyOperation(state, op).state;
    ops.push(op);
    created.push(edge.id);
  }
  return { ops, created };
}

export function connectorSlice({ set, get }: SliceContext): ConnectorSlice {
  return {
    connect: (source, target, sourceSide = null, targetSide = null) =>
      get().connectMany([source], target, sourceSide, targetSide).length > 0,

    setConnectorDefaults: (defaults) => {
      set({ connectorDefaults: { ...get().connectorDefaults, ...defaults } });
    },

    startConnection: (source, side) => {
      const { doc, selectedNodeIds, canEdit } = get();
      if (!canEdit || !doc.nodes[source]) return;
      const others = selectedNodeIds.includes(source)
        ? selectedNodeIds.filter((id) => id !== source && isConnectable(doc, id))
        : [];
      set({ connection: { sources: [source, ...others], side, sketching: false, sketch: [] }, pendingDrop: null });
    },

    setSketching: (sketching) => {
      const { connection } = get();
      if (connection && connection.sketching !== sketching) set({ connection: { ...connection, sketching } });
    },

    recordSketch: (pointer, origin) => {
      const { connection, connectorDefaults } = get();
      if (!connection?.sketching) return;
      const { style } = connectorDefaults;
      const sketch = recordSketchPoint(connection.sketch, origin, pointer, {
        spacing: sketchSpacing(style),
        orthogonal: style === "step",
      });
      if (sketch !== connection.sketch) set({ connection: { ...connection, sketch } });
    },

    endConnection: () => {
      if (get().connection) set({ connection: null });
    },

    connectMany: (sources, target, sourceSide, targetSide, sketch = []) => {
      const { doc, apply, connectorDefaults } = get();
      const { ops, created } = connectFrom(doc, connectorDefaults, sources, target, { sourceSide, targetSide }, sketch);
      const op = single(ops);
      if (!op || !apply(op)) return [];
      set({ selectedNodeIds: [], selectedEdgeIds: created });
      return created;
    },

    openDrop: (position, screen) => {
      const { connection, canEdit } = get();
      if (!connection || !canEdit) return;
      set({
        connection: null,
        pendingDrop: {
          position,
          screen,
          sources: connection.sources,
          side: connection.side,
          sketch: connection.sketch,
        },
      });
    },

    cancelDrop: () => {
      if (get().pendingDrop) set({ pendingDrop: null });
    },

    completeDrop: (kind, options = {}) => {
      const { pendingDrop, doc, apply, connectorDefaults } = get();
      if (!pendingDrop) return null;
      set({ pendingDrop: null });
      const size = DEFAULT_SIZES[kind];
      const at = {
        x: Math.round(pendingDrop.position.x - size.width / 2),
        y: Math.round(pendingDrop.position.y - size.height / 2),
      };
      const node = createNode(doc, kind, at, options);
      const add: Operation = { type: "node.add", node };
      const sides = { sourceSide: pendingDrop.side, targetSide: null };
      const state = applyOperation(doc, add).state;
      const { ops } = connectFrom(state, connectorDefaults, pendingDrop.sources, node.id, sides, pendingDrop.sketch);
      if (!apply({ type: "batch", ops: [add, ...ops] })) return null;
      set({ selectedNodeIds: [node.id], selectedEdgeIds: [] });
      return node.id;
    },

    commitRoute: (edgeId, points) => {
      const { doc, apply } = get();
      const edge = doc.edges[edgeId];
      if (!edge) return false;
      const route = { style: edge.route.style, points: points.slice(0, MAX_ROUTE_POINTS) };
      return apply({ type: "edge.update", id: edgeId, fields: { route } });
    },

    updateEdges: (ids, fieldsFor) => {
      const { doc, apply } = get();
      const ops: Operation[] = [];
      for (const id of ids) {
        const edge = doc.edges[id];
        const fields = edge ? fieldsFor(edge) : null;
        if (fields) ops.push({ type: "edge.update", id, fields });
      }
      const op = single(ops);
      return op ? apply(op) : false;
    },

    setRouteStyle: (ids, style) => {
      const { doc, updateEdges } = get();
      const previous: Record<string, Route> = {};
      for (const id of ids) {
        const edge = doc.edges[id];
        if (edge && edge.route.style !== style && edge.route.points.length > 0) previous[id] = edge.route;
      }
      const changed = updateEdges(ids, (edge) =>
        edge.route.style === style ? null : { route: { style, points: [] } },
      );
      set({ routeNotice: changed && Object.keys(previous).length > 0 ? { previous } : null });
      return changed;
    },

    undoRouteStyle: () => {
      const { routeNotice, updateEdges } = get();
      if (!routeNotice) return;
      set({ routeNotice: null });
      updateEdges(Object.keys(routeNotice.previous), (edge) => {
        const route = routeNotice.previous[edge.id];
        return route ? { route } : null;
      });
    },

    dismissRouteNotice: () => {
      if (get().routeNotice) set({ routeNotice: null });
    },

    reconnect: (edgeId, end, nodeId, side) => {
      const { doc, apply } = get();
      const edge = doc.edges[edgeId];
      if (!edge) return false;
      const source = end === "source" ? nodeId : edge.source;
      const target = end === "target" ? nodeId : edge.target;
      const others: DocumentState = { ...doc, edges: withoutKeys(doc.edges, [edgeId]) };
      if (connectRefusal(others, source, target) !== null) return false;
      const fields: EdgeFields = {
        source,
        target,
        ...(end === "source" ? { sourceSide: side } : { targetSide: side }),
        // Free routes keep their points; an orthogonal route is rebuilt for the new end.
        ...(edge.route.style === "step" ? { route: { style: "step" as const, points: [] } } : {}),
      };
      return apply({ type: "edge.update", id: edgeId, fields });
    },

    startLabelEdit: (edgeId, mode) => {
      const { doc, canEdit } = get();
      if (!canEdit || !doc.edges[edgeId]) return;
      set({ labelEditing: { edgeId, mode }, selectedNodeIds: [], selectedEdgeIds: [edgeId] });
    },

    stopLabelEdit: () => {
      if (get().labelEditing) set({ labelEditing: null });
    },
  };
}
