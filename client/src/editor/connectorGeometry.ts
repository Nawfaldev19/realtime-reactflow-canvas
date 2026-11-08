import { MAX_ROUTE_POINTS } from "../document/connectorData";
import { absoluteBox } from "../document/groups";
import { randomId, type IdFactory } from "../document/factory";
import type { DiagramEdge, DiagramNode, DocumentState, RoutePoint, RouteStyle } from "../document/types";
import type { Box, Vec } from "../geometry/vector";
import { portPoint, resolveSides, type SidePair } from "../routing/anchors";
import { floatingEnds } from "../routing/route";
import type { RouteEnd } from "../routing/route";
import { outlineOf, portOffsetsOf } from "../routing/nodeGeometry";
import { routeThrough, toStored } from "../routing/stepEdit";

// Glue between the document and the routing modules: where a connector's
// ends are for given step boxes, and how a sketched route becomes stored
// route points. The connector component feeds it live boxes from the canvas
// (so routes follow a dragged step), the store feeds it document boxes.

export interface EndpointBox {
  readonly node: DiagramNode;
  /** Absolute box in canvas coordinates. */
  readonly box: Box;
}

export interface ConnectorEnds {
  readonly source: RouteEnd;
  readonly target: RouteEnd;
  readonly sides: SidePair;
}

type EdgeSides = Pick<DiagramEdge, "kind" | "sourceSide" | "targetSide">;

/**
 * Port anchors for an editable connector, or outline anchors for a floating
 * one. `previous` (the ends drawn last time) gives automatic sides their
 * hysteresis and lets a floating connector keep its ends while the steps overlap.
 */
export function connectorEnds(
  edge: EdgeSides,
  source: EndpointBox,
  target: EndpointBox,
  previous: ConnectorEnds | null = null,
): ConnectorEnds {
  const size = (entry: EndpointBox) => ({ width: entry.box.width, height: entry.box.height });
  if (edge.kind === "floating") {
    const last = previous && {
      source: previous.source.point,
      target: previous.target.point,
      sourceSide: previous.sides.source,
      targetSide: previous.sides.target,
    };
    const ends = floatingEnds(
      source.box,
      outlineOf(source.node, size(source)),
      target.box,
      outlineOf(target.node, size(target)),
      last,
    );
    return {
      source: { point: ends.source, side: ends.sourceSide, box: source.box },
      target: { point: ends.target, side: ends.targetSide, box: target.box },
      sides: { source: ends.sourceSide, target: ends.targetSide },
    };
  }
  const sourcePorts = portOffsetsOf(source.node, size(source));
  const targetPorts = portOffsetsOf(target.node, size(target));
  const sides = resolveSides(
    { source: edge.sourceSide, target: edge.targetSide },
    { source: source.box, target: target.box, sourcePorts, targetPorts, previous: previous?.sides ?? null },
  );
  return {
    source: { point: portPoint(source.box, sides.source, sourcePorts), side: sides.source, box: source.box },
    target: { point: portPoint(target.box, sides.target, targetPorts), side: sides.target, box: target.box },
    sides,
  };
}

/** The ends of a connector between two document nodes (null when either is missing). */
export function documentEnds(
  doc: DocumentState,
  edge: EdgeSides & Pick<DiagramEdge, "source" | "target">,
): ConnectorEnds | null {
  const sourceNode = doc.nodes[edge.source];
  const targetNode = doc.nodes[edge.target];
  const sourceBox = absoluteBox(doc, edge.source);
  const targetBox = absoluteBox(doc, edge.target);
  if (!sourceNode || !targetNode || !sourceBox || !targetBox) return null;
  return connectorEnds(edge, { node: sourceNode, box: sourceBox }, { node: targetNode, box: targetBox });
}

/**
 * Stored route points for a sketched route. Free styles keep the sketch as
 * user points; the step style turns the right-angle sketch into a full
 * orthogonal vertex list between the stubs.
 */
export function sketchPoints(
  style: RouteStyle,
  ends: ConnectorEnds | null,
  sketch: readonly Vec[],
  newId: IdFactory = randomId,
): RoutePoint[] {
  if (sketch.length === 0) return [];
  if (style === "step") {
    if (!ends) return [];
    return toStored(routeThrough(ends.source, ends.target, sketch)).slice(0, MAX_ROUTE_POINTS);
  }
  return sketch.slice(0, MAX_ROUTE_POINTS).map((point) => ({ id: newId(), x: point.x, y: point.y, userCreated: true }));
}
