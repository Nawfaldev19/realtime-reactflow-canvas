import type { RoutePoint } from "../document/types";
import type { Vec } from "../geometry/vector";
import { NORMALS } from "./anchors";
import { freshId } from "./ids";
import {
  autoRoute,
  connectStub,
  ensureOrthogonal,
  EPSILON,
  isOrthogonal,
  otherAxis,
  sameXY,
  segmentCrossesBox,
  simplifyVertices,
  STUB,
  withAxis,
  type Axis,
  type OrthogonalEnd,
} from "./orthogonal";

// Editing orthogonal routes by hand.
//
// Once a person edits a step connector, its route is stored as the vertex
// list from the source stub to the target stub inclusive (the anchors are
// always derived from the steps). Every render re-attaches the stored list
// to the current anchors, so the displayed route is never stale, and every
// edit starts from the displayed route.

export interface Vertex extends Vec {
  readonly id: string;
  readonly userCreated?: boolean;
}

export const SOURCE_VERTEX = "source";
export const TARGET_VERTEX = "target";

const anchorVertex = (id: string, point: Vec): Vertex => ({ id, x: point.x, y: point.y });

/** Gives generated vertices ids that are unique in the list. */
function withIds(points: readonly Vec[], seed: string): Vertex[] {
  const taken = new Set<string>();
  return points.map((point, index) => {
    const existing = (point as Partial<Vertex>).id;
    const id = existing !== undefined && !taken.has(existing) ? existing : freshId(`${seed}:${String(index)}`, taken);
    taken.add(id);
    return { ...point, id };
  });
}

/** The automatic route as vertices with ids. */
export function autoVertices(source: OrthogonalEnd, target: OrthogonalEnd): Vertex[] {
  const route = autoRoute(source, target);
  return [
    anchorVertex(SOURCE_VERTEX, source.point),
    ...withIds(route.slice(1, -1), "auto"),
    anchorVertex(TARGET_VERTEX, target.point),
  ];
}

function crossesEnd(points: readonly Vec[], end: OrthogonalEnd, count: number): boolean {
  if (!end.box) return false;
  for (let index = 0; index < Math.min(count, points.length - 1); index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (a && b && segmentCrossesBox(a, b, end.box)) return true;
  }
  return false;
}

/**
 * Re-attaches one end of a stored list (the list starts at that end's stub).
 *
 * - If the first segment turns (it runs across the stub's direction), the
 *   stub moves to the new anchor + 20·n and the second vertex follows along
 *   the normal, so the turn stays perpendicular to the stub.
 * - If the first segment continues straight, the stub moves and the second
 *   vertex keeps level with the port.
 * - If that makes the route turn back along the stub or cut through the
 *   step (for example after the automatic side changed), this end is
 *   re-routed from the stub to the nearest kept vertex.
 */
export function reattachEnd(points: readonly Vertex[], end: OrthogonalEnd): Vertex[] {
  const [first, second, ...rest] = points;
  const normal = NORMALS[end.side];
  const stub = { x: end.point.x + normal.x * STUB, y: end.point.y + normal.y * STUB };
  if (!first) return [];
  const stubVertex: Vertex = { ...first, x: stub.x, y: stub.y };
  if (!second) return [stubVertex];
  const along: Axis = normal.x !== 0 ? "x" : "y";
  const across = otherAxis(along);
  const turns = Math.abs(second[across] - first[across]) >= EPSILON;
  const adapted: Vertex = turns
    ? { ...second, ...withAxis(second, along, stub[along]) }
    : { ...second, ...withAxis(second, across, end.point[across]) };
  const candidate = [stubVertex, adapted, ...rest];

  const next = [adapted, ...rest].find((point) => !sameXY(point, stub));
  const reverses =
    next !== undefined &&
    (next.x - stub.x) * normal.x + (next.y - stub.y) * normal.y < -EPSILON &&
    Math.abs(next[across] - stub[across]) < EPSILON;
  if (!reverses && !crossesEnd(candidate, end, 2)) return candidate;

  const keep = rest.length > 0 ? rest : [second];
  const [nearest] = keep;
  if (!nearest) return candidate;
  const taken = new Set(points.map((point) => point.id));
  const corners = connectStub(end, nearest).map((corner, index) => {
    const id = freshId(`${first.id}:reroute:${String(index)}`, taken);
    taken.add(id);
    return { ...corner, id, userCreated: true } satisfies Vertex;
  });
  return [stubVertex, ...corners, ...keep];
}

const reversed = <T>(list: readonly T[]): T[] => [...list].reverse();

/**
 * The full route S, S′, …, T′, T for a stored list re-attached to the
 * current anchors, or the automatic route when nothing usable is stored.
 * The result is always orthogonal.
 */
export function stepRoute(source: OrthogonalEnd, target: OrthogonalEnd, stored: readonly RoutePoint[]): Vertex[] {
  if (stored.length < 2) return autoVertices(source, target);
  const head = reattachEnd(stored, source);
  const both = reversed(reattachEnd(reversed(head), target));
  const full = [anchorVertex(SOURCE_VERTEX, source.point), ...both, anchorVertex(TARGET_VERTEX, target.point)];
  if (isOrthogonal(full)) return full;
  const repaired = ensureOrthogonal(full);
  return [
    anchorVertex(SOURCE_VERTEX, source.point),
    ...withIds(repaired.slice(1, -1), "repair"),
    anchorVertex(TARGET_VERTEX, target.point),
  ];
}

/** The stored form of a full route: the vertices between the anchors, with the axis each one's segment may move along. */
export function toStored(full: readonly Vertex[]): RoutePoint[] {
  const inner = full.slice(1, -1);
  return inner.map((vertex, index) => {
    const next = full[index + 2];
    const axis: Axis = next && Math.abs(next.y - vertex.y) < EPSILON ? "y" : "x";
    return { id: vertex.id, x: vertex.x, y: vertex.y, axis, ...(vertex.userCreated ? { userCreated: true } : {}) };
  });
}

export interface SegmentDrag {
  /** The full route being edited, including any bend inserted at a stub. */
  readonly vertices: readonly Vertex[];
  /** The dragged segment runs from vertices[index] to vertices[index + 1]. */
  readonly index: number;
  readonly axis: Axis;
}

/**
 * Starts dragging segment `index` of a full route. A segment that starts at
 * the source stub (or ends at the target stub) first gets a copy of that
 * stub vertex, so the stub stays put and the moved vertex becomes a new
 * bend. This happens once per drag.
 */
export function startSegmentDrag(full: readonly Vertex[], index: number): SegmentDrag {
  const a = full[index];
  const b = full[index + 1];
  const axis: Axis = a && b && Math.abs(a.y - b.y) < EPSILON ? "y" : "x";
  const vertices = [...full];
  const taken = new Set(full.map((vertex) => vertex.id));
  let at = index;
  const bend = (vertex: Vertex, tag: string): Vertex => {
    const id = freshId(`${vertex.id}:${tag}`, taken);
    taken.add(id);
    return { ...vertex, id, userCreated: true };
  };
  const sourceStub = vertices[1];
  if (at === 1 && sourceStub) {
    vertices.splice(1, 1, sourceStub, bend(sourceStub, "source-bend"));
    at += 1;
  }
  const targetStub = vertices[vertices.length - 2];
  if (at + 1 === vertices.length - 2 && targetStub)
    vertices.splice(vertices.length - 2, 1, bend(targetStub, "target-bend"), targetStub);
  return { vertices, index: at, axis };
}

/** Moves the dragged segment so its coordinate on the allowed axis is `value`. */
export function dragSegment(drag: SegmentDrag, value: number): Vertex[] {
  return drag.vertices.map((vertex, index) =>
    index === drag.index || index === drag.index + 1
      ? { ...vertex, ...withAxis(vertex, drag.axis, value), userCreated: true }
      : vertex,
  );
}

/** The stored points after a drag: duplicate and collinear vertices are dropped. */
export function finishSegmentDrag(vertices: readonly Vertex[]): RoutePoint[] {
  return toStored(simplifyVertices(vertices));
}

/** Moves segment `index` by `delta` along its allowed axis in one step (keyboard nudging). */
export function nudgeSegment(full: readonly Vertex[], index: number, delta: number): RoutePoint[] {
  const drag = startSegmentDrag(full, index);
  const start = drag.vertices[drag.index];
  if (!start) return toStored(full);
  return finishSegmentDrag(dragSegment(drag, start[drag.axis] + delta));
}

/**
 * Removes the edit on segment `index` by merging it with a neighbour: the
 * segment moves onto the previous vertex's coordinate (collapsing the
 * segment before it), or a parallel neighbour is pulled onto it when the
 * segment touches a stub. Duplicate and collinear vertices are then removed,
 * and when the result is no more complex than the automatic route, the
 * connector returns to automatic routing (an empty list).
 */
export function removeSegmentEdit(full: readonly Vertex[], index: number, auto: readonly Vec[]): RoutePoint[] {
  const count = full.length;
  const fixed = (at: number) => at <= 1 || at >= count - 2;
  const movable = (segment: number) => segment >= 1 && segment + 1 < count && !fixed(segment) && !fixed(segment + 1);
  const a = full[index];
  const b = full[index + 1];
  if (!a || !b) return toStored(full);
  const axis: Axis = Math.abs(a.y - b.y) < EPSILON ? "y" : "x";
  const set = (vertices: Vertex[], segment: number, value: number) => {
    for (const at of [segment, segment + 1]) {
      const vertex = vertices[at];
      if (vertex) vertices[at] = { ...vertex, ...withAxis(vertex, axis, value) };
    }
  };
  const next = [...full];
  const previous = full[index - 1];
  const after = full[index + 1];
  const before = full[index];
  if (movable(index) && previous) set(next, index, previous[axis]);
  else if (movable(index + 2) && after) set(next, index + 2, after[axis]);
  else if (movable(index - 2) && before) set(next, index - 2, before[axis]);
  else return [];
  const simplified = simplifyVertices(next);
  return simplified.length <= simplifyVertices(auto).length ? [] : toStored(simplified);
}

/**
 * A full orthogonal route through sketched waypoints (already snapped to
 * right angles): stub, waypoints, stub, with an elbow wherever two
 * consecutive points are not aligned. The last elbow lines the final leg up
 * with the target stub.
 */
export function routeThrough(source: OrthogonalEnd, target: OrthogonalEnd, waypoints: readonly Vec[]): Vertex[] {
  const nS = NORMALS[source.side];
  const nT = NORMALS[target.side];
  const sourceStub = { x: source.point.x + nS.x * STUB, y: source.point.y + nS.y * STUB };
  const targetStub = { x: target.point.x + nT.x * STUB, y: target.point.y + nT.y * STUB };
  const marked = waypoints.map((point) => ({ x: point.x, y: point.y, userCreated: true }));
  const lastWaypoint = marked[marked.length - 1];
  const finalElbow =
    lastWaypoint &&
    Math.abs(lastWaypoint.x - targetStub.x) >= EPSILON &&
    Math.abs(lastWaypoint.y - targetStub.y) >= EPSILON
      ? [nT.x !== 0 ? { x: lastWaypoint.x, y: targetStub.y } : { x: targetStub.x, y: lastWaypoint.y }]
      : [];
  const chain = ensureOrthogonal([source.point, sourceStub, ...marked, ...finalElbow, targetStub, target.point]);
  const simplified = simplifyVertices(chain);
  return [
    anchorVertex(SOURCE_VERTEX, source.point),
    ...withIds(simplified.slice(1, -1), "sketch"),
    anchorVertex(TARGET_VERTEX, target.point),
  ];
}
