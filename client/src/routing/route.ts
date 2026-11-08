import type { RoutePoint, RouteStyle, Side } from "../document/types";
import type { Path } from "../geometry/path";
import { floatingAnchor, sideOfPoint, type Outline } from "../geometry/outline";
import { containsPoint, midpoint, type Box, type Vec } from "../geometry/vector";
import { longestSegmentMidpoint, roundedPath } from "./orthogonal";
import { catmullRomPath, handleAwareGhosts, splineMidpoints } from "./spline";
import { stepRoute, type Vertex } from "./stepEdit";

// One entry point that turns a connector's ends, style and stored points
// into drawable geometry. The connection preview, the final connector and
// the tests all call it, so what you see while dragging is what you get.

export interface RouteEnd {
  readonly point: Vec;
  readonly side: Side;
  readonly box: Box | null;
}

export interface RouteRequest {
  readonly style: RouteStyle;
  readonly source: RouteEnd;
  readonly target: RouteEnd;
  readonly points: readonly RoutePoint[];
}

export interface RouteGeometry {
  readonly path: Path;
  /** Step routes: the full vertex list S, S′, …, T′, T (re-attached to the current anchors). */
  readonly vertices: readonly Vertex[] | null;
  /** Free routes: one "add point" position per piece (points.length + 1 of them). */
  readonly addHandles: readonly Vec[];
  /** Where the label sits when it has no stored position (step routes: the longest middle segment). */
  readonly labelAnchor: Vec | null;
}

const polylinePath = (points: readonly Vec[]): Path =>
  points.slice(1).map((to, index) => ({ kind: "line" as const, from: points[index] ?? to, to }));

/** The route geometry for any connector style. */
export function computeRoute({ style, source, target, points }: RouteRequest): RouteGeometry {
  const through: Vec[] = [source.point, ...points, target.point];
  switch (style) {
    case "polyline":
      return {
        path: polylinePath(through),
        vertices: null,
        addHandles: through.slice(1).map((to, index) => midpoint(through[index] ?? to, to)),
        labelAnchor: null,
      };
    case "spline":
      return { path: catmullRomPath(through), vertices: null, addHandles: splineMidpoints(through), labelAnchor: null };
    case "bezier": {
      const ghosts = handleAwareGhosts(through, source.side, target.side);
      return {
        path: catmullRomPath(through, ghosts),
        vertices: null,
        addHandles: splineMidpoints(through, ghosts),
        labelAnchor: null,
      };
    }
    case "step": {
      const vertices = stepRoute(source, target, points);
      return { path: roundedPath(vertices), vertices, addHandles: [], labelAnchor: longestSegmentMidpoint(vertices) };
    }
  }
}

export interface FloatingEnds {
  readonly source: Vec;
  readonly target: Vec;
  readonly sourceSide: Side;
  readonly targetSide: Side;
}

/**
 * A floating connector touches each outline where the line between the two
 * centres crosses it. While the steps overlap so much that each centre lies
 * inside the other step, the last valid ends are kept.
 */
export function floatingEnds(
  source: Box,
  sourceOutline: Outline,
  target: Box,
  targetOutline: Outline,
  previous: FloatingEnds | null = null,
): FloatingEnds {
  const sourceCentre = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCentre = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  if (previous && containsPoint(source, targetCentre) && containsPoint(target, sourceCentre)) return previous;
  const s = floatingAnchor(source, sourceOutline, targetCentre, previous?.source ?? null);
  const t = floatingAnchor(target, targetOutline, sourceCentre, previous?.target ?? null);
  return { source: s, target: t, sourceSide: sideOfPoint(source, s), targetSide: sideOfPoint(target, t) };
}
