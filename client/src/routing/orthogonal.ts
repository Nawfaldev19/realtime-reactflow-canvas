import type { Side } from "../document/types";
import type { Path, PathSegment } from "../geometry/path";
import { distance, type Box, type Vec } from "../geometry/vector";
import { isHorizontalSide, NORMALS } from "./anchors";

// Automatic orthogonal ("step") routing.
//
// Adapted from the React Flow smooth-step edge (MIT): the base router
// reproduces its point generation and corner rounding, re-implemented from a
// written description and checked against the library's output in the unit
// tests (see docs/REFERENCES.md). Our addition: when the base route would
// cross back through the source or target step, or leave or enter a step the
// wrong way, a small search over "channel" coordinates around the two boxes
// picks the cheapest clear orthogonal route instead.

/** Length of the straight stub that leaves each port perpendicular to its side. */
export const STUB = 20;
/** Corner radius; smaller where a segment is shorter than twice this. */
export const CORNER_RADIUS = 5;
/** Coordinates closer than this are treated as equal. */
export const EPSILON = 0.01;

export interface OrthogonalEnd {
  readonly point: Vec;
  readonly side: Side;
  /** The step's box, used to keep the route out of it. */
  readonly box?: Box | null | undefined;
}

type Axis = "x" | "y";
const otherAxis = (axis: Axis): Axis => (axis === "x" ? "y" : "x");
const at = (point: Vec, axis: Axis): number => point[axis];
const withAxis = (point: Vec, axis: Axis, value: number): Vec =>
  axis === "x" ? { x: value, y: point.y } : { x: point.x, y: value };
const moved = (point: Vec, direction: Vec, length: number): Vec => ({
  x: point.x + direction.x * length,
  y: point.y + direction.y * length,
});

export const sameXY = (a: Vec, b: Vec): boolean => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

/** True when every segment is horizontal or vertical. */
export function isOrthogonal(vertices: readonly Vec[]): boolean {
  for (let index = 1; index < vertices.length; index += 1) {
    const a = vertices[index - 1];
    const b = vertices[index];
    if (a && b && Math.abs(a.x - b.x) >= EPSILON && Math.abs(a.y - b.y) >= EPSILON) return false;
  }
  return true;
}

/** True when b lies on the straight line through a and c along one axis (or the three share a point). */
export function collinear(a: Vec, b: Vec, c: Vec): boolean {
  return (
    (Math.abs(a.x - b.x) < EPSILON && Math.abs(b.x - c.x) < EPSILON) ||
    (Math.abs(a.y - b.y) < EPSILON && Math.abs(b.y - c.y) < EPSILON)
  );
}

/**
 * The base route: S, S′, one or two corners, T′, T.
 *
 * - Stubs S′ = S + 20·n_source and T′ = T + 20·n_target.
 * - The primary axis is x for a left/right source side, otherwise y; the
 *   travel sign σ is +1 when S′ is before T′ on it.
 * - Opposite sides take two corners through the midpoint M of S and T.
 * - Same or perpendicular sides take one corner, flipped for perpendicular
 *   sides when the default would double back; on the same side a leading
 *   stub that would overlap the corner is shortened.
 */
export function baseVertices(source: OrthogonalEnd, target: OrthogonalEnd, offset = STUB): Vec[] {
  const S = source.point;
  const T = target.point;
  const nS = NORMALS[source.side];
  const nT = NORMALS[target.side];
  const axis: Axis = isHorizontalSide(source.side) ? "x" : "y";
  const secondary = otherAxis(axis);
  let sourceStub = moved(S, nS, offset);
  let targetStub = moved(T, nT, offset);

  if (source.side === target.side) {
    const gap = Math.abs(at(S, axis) - at(T, axis));
    if (gap > EPSILON && gap <= offset) {
      const shift = Math.min(offset - 1, offset - gap);
      // The leading stub is the one that sticks out further along the shared normal.
      if (at(S, axis) * at(nS, axis) > at(T, axis) * at(nS, axis)) sourceStub = moved(S, nS, offset - shift);
      else targetStub = moved(T, nT, offset - shift);
    }
  }

  const sigma = at(sourceStub, axis) < at(targetStub, axis) ? 1 : -1;
  const agrees = at(nS, axis) === sigma;
  const M = { x: (S.x + T.x) / 2, y: (S.y + T.y) / 2 };
  let corners: Vec[];

  if (at(nS, axis) === -at(nT, axis) && at(nT, axis) !== 0) {
    // Opposite sides: a middle leg at the midpoint, across or along the primary axis.
    const across = agrees === (axis === "x");
    corners = across
      ? [
          { x: M.x, y: sourceStub.y },
          { x: M.x, y: targetStub.y },
        ]
      : [
          { x: sourceStub.x, y: M.y },
          { x: targetStub.x, y: M.y },
        ];
  } else {
    const a = { x: sourceStub.x, y: targetStub.y };
    const b = { x: targetStub.x, y: sourceStub.y };
    let choice = (axis === "x") === agrees ? b : a;
    // Perpendicular sides: when the source already heads toward the target, flip to the
    // other corner if the default would make the route double back into the target's stub.
    if (source.side !== target.side && agrees) {
      const k = at(nS, axis) === at(nT, secondary);
      const s = at(sourceStub, secondary);
      const t = at(targetStub, secondary);
      const primary = at(nS, axis);
      const flip =
        (primary === 1 && ((!k && s > t) || (k && s < t))) || (primary === -1 && ((!k && s < t) || (k && s > t)));
      if (flip) choice = choice === a ? b : a;
    }
    corners = [choice];
  }
  return [S, sourceStub, ...corners, targetStub, T];
}

/**
 * Rounds every corner: a line to the point r before the corner, then a
 * quadratic curve with the corner as control point to the point r after it,
 * with r = min(|AB|/2, |BC|/2, radius). Collinear vertices are straight.
 */
export function roundedPath(vertices: readonly Vec[], radius = CORNER_RADIUS): Path {
  const first = vertices[0];
  if (!first || vertices.length < 2) return [];
  const segments: PathSegment[] = [];
  let pen = first;
  const lineTo = (to: Vec) => {
    if (!sameXY(pen, to)) segments.push({ kind: "line", from: pen, to });
    pen = to;
  };
  for (let index = 1; index < vertices.length - 1; index += 1) {
    const a = vertices[index - 1] ?? pen;
    const b = vertices[index] ?? pen;
    const c = vertices[index + 1] ?? b;
    const ab = distance(a, b);
    const bc = distance(b, c);
    if (ab < EPSILON || bc < EPSILON || collinear(a, b, c)) {
      lineTo(b);
      continue;
    }
    const r = Math.min(ab / 2, bc / 2, radius);
    const before = { x: b.x + ((a.x - b.x) * r) / ab, y: b.y + ((a.y - b.y) * r) / ab };
    const after = { x: b.x + ((c.x - b.x) * r) / bc, y: b.y + ((c.y - b.y) * r) / bc };
    lineTo(before);
    segments.push({ kind: "quad", from: before, control: b, to: after });
    pen = after;
  }
  lineTo(vertices[vertices.length - 1] ?? pen);
  return segments;
}

/** Removes duplicate and collinear vertices, never touching the anchors and the two stub ends. */
export function simplifyVertices<T extends Vec>(vertices: readonly T[]): T[] {
  let current = [...vertices];
  for (let changed = true; changed; ) {
    changed = false;
    for (let index = 2; index < current.length - 2; index += 1) {
      const a = current[index - 1];
      const b = current[index];
      const c = current[index + 1];
      if (a && b && c && (sameXY(a, b) || sameXY(b, c) || collinear(a, b, c))) {
        current = [...current.slice(0, index), ...current.slice(index + 1)];
        changed = true;
        break;
      }
    }
  }
  return current;
}

/** Inserts an elbow into every diagonal segment, continuing the direction of the segment before it. */
export function ensureOrthogonal(vertices: readonly Vec[]): Vec[] {
  const first = vertices[0];
  if (!first) return [];
  const result: Vec[] = [first];
  for (let index = 1; index < vertices.length; index += 1) {
    const a = result[result.length - 1] ?? first;
    const b = vertices[index] ?? a;
    if (Math.abs(a.x - b.x) >= EPSILON && Math.abs(a.y - b.y) >= EPSILON) {
      const before = result[result.length - 2];
      const arrivedHorizontally = before ? Math.abs(before.y - a.y) < EPSILON : true;
      result.push(arrivedHorizontally ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
    }
    result.push(b);
  }
  return result;
}

/** Whether an axis-aligned segment passes through the inside of a box (touching its border does not count). */
export function segmentCrossesBox(a: Vec, b: Vec, box: Box, inset = 0.5): boolean {
  const left = box.x + inset;
  const right = box.x + box.width - inset;
  const top = box.y + inset;
  const bottom = box.y + box.height - inset;
  if (left >= right || top >= bottom) return false;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return maxX > left && minX < right && maxY > top && minY < bottom;
}

const bends = (vertices: readonly Vec[]): number => {
  let count = 0;
  for (let index = 1; index < vertices.length - 1; index += 1) {
    const a = vertices[index - 1];
    const b = vertices[index];
    const c = vertices[index + 1];
    if (a && b && c && !sameXY(a, b) && !sameXY(b, c) && !collinear(a, b, c)) count += 1;
  }
  return count;
};

const totalLength = (vertices: readonly Vec[]): number =>
  vertices.reduce((sum, point, index) => sum + (index === 0 ? 0 : distance(vertices[index - 1] ?? point, point)), 0);

/** Penalty weights: a crossing is never preferred over a clear route, and a reversal along a stub is next worst. */
const CROSSING = 1e6;
const REVERSAL = 1e5;
const BEND = 30;

/**
 * The route as it looks: duplicates dropped and "spikes" (a vertex where the
 * route runs straight back over itself) removed. A route whose stubs overlap
 * between two close, aligned ports looks like a straight line, and is one.
 */
export function visibleVertices(vertices: readonly Vec[]): Vec[] {
  let current = vertices.filter((point, index) => index === 0 || !sameXY(point, vertices[index - 1] ?? point));
  for (let changed = true; changed; ) {
    changed = false;
    for (let index = 1; index < current.length - 1; index += 1) {
      const a = current[index - 1];
      const b = current[index];
      const c = current[index + 1];
      if (!a || !b || !c) continue;
      const turnsBack = collinear(a, b, c) && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0;
      if (sameXY(a, b) || turnsBack) {
        current = [...current.slice(0, index), ...current.slice(index + 1)];
        changed = true;
        break;
      }
    }
  }
  return current;
}

const direction = (from: Vec, to: Vec): Vec => ({ x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) });

/** 1 when a visible route does not leave along `side`'s normal (it starts sideways or back into the step). */
function badExit(visible: readonly Vec[], side: Side): number {
  const [first, second] = visible;
  if (!first || !second) return 0;
  const leaving = direction(first, second);
  const normal = NORMALS[side];
  return leaving.x * normal.x + leaving.y * normal.y > 0 ? 0 : 1;
}

/** Segments `from`…`to − 1` that pass through any of the boxes. */
function crossingsOf(vertices: readonly Vec[], boxes: readonly Box[], from: number, to: number): number {
  let crossings = 0;
  for (let index = from; index < to; index += 1) {
    const a = vertices[index];
    const b = vertices[index + 1];
    if (!a || !b) continue;
    for (const box of boxes) if (segmentCrossesBox(a, b, box)) crossings += 1;
  }
  return crossings;
}

const boxesOf = (...ends: readonly OrthogonalEnd[]): Box[] =>
  ends.map((end) => end.box).filter((box): box is Box => Boolean(box));

export interface RouteCheck {
  /** Segments that pass through the source or target box (other than the one leaving or entering it). */
  readonly crossings: number;
  /** Ends where the route does not leave or enter along the port's normal. */
  readonly reversals: number;
}

/**
 * Problems with a full route S, S′, …, T′, T, judged on how it looks: every
 * segment except the first (which leaves the source) is tested against the
 * source box, every segment except the last against the target box, and
 * the route must leave and enter along the port normals.
 */
export function checkRoute(vertices: readonly Vec[], source: OrthogonalEnd, target: OrthogonalEnd): RouteCheck {
  const visible = visibleVertices(vertices);
  const last = visible.length - 1;
  const crossings = crossingsOf(visible, boxesOf(source), 1, last) + crossingsOf(visible, boxesOf(target), 0, last - 1);
  return { crossings, reversals: badExit(visible, source.side) + badExit([...visible].reverse(), target.side) };
}

function cost(vertices: readonly Vec[], source: OrthogonalEnd, target: OrthogonalEnd): number {
  const { crossings, reversals } = checkRoute(vertices, source, target);
  return crossings * CROSSING + reversals * REVERSAL + bends(vertices) * BEND + totalLength(vertices);
}

/** Coordinates a detour may run along: the two route ends, their midpoint, just outside each box, and the gap between the boxes. */
function channels(axis: Axis, from: Vec, to: Vec, boxes: readonly Box[], offset: number): number[] {
  const values = new Set<number>([at(from, axis), at(to, axis), (at(from, axis) + at(to, axis)) / 2]);
  const start = (box: Box) => (axis === "x" ? box.x : box.y);
  const end = (box: Box) => start(box) + (axis === "x" ? box.width : box.height);
  for (const box of boxes) {
    values.add(start(box) - offset);
    values.add(end(box) + offset);
  }
  const [first, second] = boxes;
  if (first && second) {
    if (end(first) < start(second)) values.add((end(first) + start(second)) / 2);
    if (end(second) < start(first)) values.add((end(second) + start(first)) / 2);
  }
  return [...values];
}

/** Every corner sequence from `from` to `to` with up to three corners along the channel coordinates. */
function candidateCorners(from: Vec, to: Vec, xs: readonly number[], ys: readonly number[]): Vec[][] {
  const result: Vec[][] = [[{ x: from.x, y: to.y }], [{ x: to.x, y: from.y }]];
  for (const x of xs)
    result.push([
      { x, y: from.y },
      { x, y: to.y },
    ]);
  for (const y of ys)
    result.push([
      { x: from.x, y },
      { x: to.x, y },
    ]);
  for (const x of xs) {
    for (const y of ys) {
      result.push([
        { x, y: from.y },
        { x, y },
        { x: to.x, y },
      ]);
      result.push([
        { x: from.x, y },
        { x, y },
        { x, y: to.y },
      ]);
    }
  }
  return result;
}

/** The option with the lowest score; the earliest wins ties, so the preferred shape is listed first. */
function cheapest<T>(options: readonly T[], score: (option: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = Infinity;
  for (const option of options) {
    const value = score(option);
    if (value < bestScore - 1e-9) {
      best = option;
      bestScore = value;
    }
  }
  return best;
}

/**
 * The automatic orthogonal route as a vertex list S, S′, …, T′, T. The base
 * route is used whenever it is clear; otherwise the clear detour with the
 * fewest bends and the shortest length.
 */
export function autoRoute(source: OrthogonalEnd, target: OrthogonalEnd, offset = STUB): Vec[] {
  const base = baseVertices(source, target, offset);
  const check = checkRoute(base, source, target);
  if (check.crossings === 0 && check.reversals === 0) return base;
  const boxes = boxesOf(source, target);
  const sourceStub = base[1] ?? source.point;
  const targetStub = base[base.length - 2] ?? target.point;
  const xs = channels("x", sourceStub, targetStub, boxes, offset);
  const ys = channels("y", sourceStub, targetStub, boxes, offset);
  const options = [
    base,
    ...candidateCorners(sourceStub, targetStub, xs, ys).map((corners) =>
      simplifyVertices([source.point, sourceStub, ...corners, targetStub, target.point]),
    ),
  ];
  return cheapest(options, (option) => cost(option, source, target)) ?? base;
}

/**
 * The corners that connect the stub of `end` to a free vertex `to`, with up
 * to three corners, keeping out of the step and never turning back along
 * the stub. Used when one end of an edited route has to be re-routed.
 */
export function connectStub(end: OrthogonalEnd, to: Vec, offset = STUB): Vec[] {
  const stub = moved(end.point, NORMALS[end.side], offset);
  const boxes = boxesOf(end);
  const xs = channels("x", stub, to, boxes, offset);
  const ys = channels("y", stub, to, boxes, offset);
  // Doubling `to` makes it a protected end, so simplification only drops redundant corners.
  const options = candidateCorners(stub, to, xs, ys).map((corners) =>
    simplifyVertices([end.point, stub, ...corners, to, to]).slice(0, -1),
  );
  const score = (option: readonly Vec[]) => {
    const visible = visibleVertices(option);
    return (
      crossingsOf(visible, boxes, 1, visible.length - 1) * CROSSING +
      badExit(visible, end.side) * REVERSAL +
      bends(option) * BEND +
      totalLength(option)
    );
  };
  return (cheapest(options, score) ?? [end.point, stub, to]).slice(2, -1);
}

/** The midpoint of the longest segment, ignoring the two end stubs (the default label anchor). */
export function longestSegmentMidpoint(vertices: readonly Vec[]): Vec {
  let best: Vec | null = null;
  let bestLength = -1;
  const from = vertices.length > 3 ? 1 : 0;
  const to = vertices.length > 3 ? vertices.length - 2 : vertices.length - 1;
  for (let index = from; index < to; index += 1) {
    const a = vertices[index];
    const b = vertices[index + 1];
    if (!a || !b) continue;
    const length = distance(a, b);
    if (length > bestLength) {
      bestLength = length;
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best ?? vertices[0] ?? { x: 0, y: 0 };
}

export interface SegmentHandle {
  /** The segment runs from vertex `index` to vertex `index + 1` of the full route. */
  readonly index: number;
  /** The axis the segment may move along: "x" for a vertical segment, "y" for a horizontal one. */
  readonly axis: Axis;
  readonly position: Vec;
}

/** Handles are this far from the step on the first and last movable segments, when those are long enough. */
export const END_HANDLE_INSET = 15;

/**
 * One handle per movable segment (every segment except the two stubs and
 * zero-length ones): at the midpoint, or 15 units from the step end on the
 * first and last movable segments when they are longer than 30.
 */
export function segmentHandles(vertices: readonly Vec[]): SegmentHandle[] {
  const handles: SegmentHandle[] = [];
  const first = 1;
  const last = vertices.length - 3;
  for (let index = first; index <= last; index += 1) {
    const a = vertices[index];
    const b = vertices[index + 1];
    if (!a || !b) continue;
    const length = distance(a, b);
    if (length < EPSILON) continue;
    const axis: Axis = Math.abs(a.y - b.y) < EPSILON ? "y" : "x";
    let position = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (first !== last && length > END_HANDLE_INSET * 2) {
      if (index === first)
        position = {
          x: a.x + ((b.x - a.x) * END_HANDLE_INSET) / length,
          y: a.y + ((b.y - a.y) * END_HANDLE_INSET) / length,
        };
      else if (index === last)
        position = {
          x: b.x + ((a.x - b.x) * END_HANDLE_INSET) / length,
          y: b.y + ((a.y - b.y) * END_HANDLE_INSET) / length,
        };
    }
    handles.push({ index, axis, position });
  }
  return handles;
}

export { withAxis, otherAxis, type Axis };
