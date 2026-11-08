import { distance, round2, type Vec } from "./vector";

// A small path model shared by every connector style: straight lines,
// quadratic corners (orthogonal routes) and cubic Béziers (splines). Routes
// are built as segment lists first and turned into SVG only at the end, so
// the same geometry can be measured, sampled and projected onto without the
// DOM (labels slide along it, hit areas are trimmed from it, tests check it).

export type PathSegment =
  | { readonly kind: "line"; readonly from: Vec; readonly to: Vec }
  | { readonly kind: "quad"; readonly from: Vec; readonly control: Vec; readonly to: Vec }
  | { readonly kind: "cubic"; readonly from: Vec; readonly c1: Vec; readonly c2: Vec; readonly to: Vec };

export type Path = readonly PathSegment[];

const n = (value: number) => String(round2(value));
const pair = (point: Vec) => `${n(point.x)} ${n(point.y)}`;

/** The SVG `d` attribute: one move-to, then one command per segment (a new move-to only where segments do not join). */
export function pathData(path: Path): string {
  let d = "";
  let pen: Vec | null = null;
  for (const segment of path) {
    if (!pen || distance(pen, segment.from) > 1e-6) d += `${d ? " " : ""}M ${pair(segment.from)}`;
    switch (segment.kind) {
      case "line":
        d += ` L ${pair(segment.to)}`;
        break;
      case "quad":
        d += ` Q ${pair(segment.control)} ${pair(segment.to)}`;
        break;
      case "cubic":
        d += ` C ${pair(segment.c1)} ${pair(segment.c2)} ${pair(segment.to)}`;
        break;
    }
    pen = segment.to;
  }
  return d;
}

/** The point at parameter t ∈ [0, 1] of one segment (Bernstein form). */
export function segmentPoint(segment: PathSegment, t: number): Vec {
  const u = 1 - t;
  switch (segment.kind) {
    case "line":
      return { x: segment.from.x * u + segment.to.x * t, y: segment.from.y * u + segment.to.y * t };
    case "quad": {
      const { from, control, to } = segment;
      return {
        x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
        y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
      };
    }
    case "cubic": {
      const { from, c1, c2, to } = segment;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const e = t * t * t;
      return { x: a * from.x + b * c1.x + c * c2.x + e * to.x, y: a * from.y + b * c1.y + c * c2.y + e * to.y };
    }
  }
}

/** Curves are measured as chords between this many even parameter steps (error well below 0.1 units for connector-sized curves). */
const CURVE_STEPS = 48;

interface SegmentTable {
  readonly segment: PathSegment;
  /** Distance from the start of the path to the start of this segment. */
  readonly start: number;
  readonly length: number;
  /** Arc length at each of the CURVE_STEPS + 1 parameter samples (lines: just [0, length]). */
  readonly arc: readonly number[];
}

export interface PathMeasure {
  readonly path: Path;
  readonly total: number;
  readonly tables: readonly SegmentTable[];
}

function tableFor(segment: PathSegment, start: number): SegmentTable {
  if (segment.kind === "line") {
    const length = distance(segment.from, segment.to);
    return { segment, start, length, arc: [0, length] };
  }
  const arc = [0];
  let previous = segment.from;
  let length = 0;
  for (let step = 1; step <= CURVE_STEPS; step += 1) {
    const point = segmentPoint(segment, step / CURVE_STEPS);
    length += distance(previous, point);
    arc.push(length);
    previous = point;
  }
  return { segment, start, length, arc };
}

/** Precomputes arc lengths, so length queries and projections are cheap. */
export function measurePath(path: Path): PathMeasure {
  const tables: SegmentTable[] = [];
  let total = 0;
  for (const segment of path) {
    const table = tableFor(segment, total);
    tables.push(table);
    total += table.length;
  }
  return { path, total, tables };
}

/** The parameter t at which a segment reaches arc length `s` (inverting the chord table). */
function parameterAt(table: SegmentTable, s: number): number {
  const { arc } = table;
  if (table.length === 0) return 0;
  let low = 0;
  let high = arc.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((arc[mid] ?? 0) < s) low = mid;
    else high = mid;
  }
  const a = arc[low] ?? 0;
  const b = arc[high] ?? a;
  const fraction = b === a ? 0 : (s - a) / (b - a);
  return (low + fraction) / (arc.length - 1);
}

/** The point at distance `s` from the start of the path, clamped to the path. */
export function pointAtLength(measure: PathMeasure, s: number): Vec {
  const { tables, total } = measure;
  const last = tables.at(-1);
  if (!last) return { x: 0, y: 0 };
  const clamped = Math.min(Math.max(s, 0), total);
  const table = tables.find((entry) => clamped <= entry.start + entry.length) ?? last;
  return segmentPoint(table.segment, parameterAt(table, clamped - table.start));
}

/** The point at fraction f ∈ [0, 1] of the total length. */
export const pointAtFraction = (measure: PathMeasure, f: number): Vec => pointAtLength(measure, f * measure.total);

export interface Projection {
  /** Distance along the path to the closest point. */
  readonly length: number;
  readonly point: Vec;
  /** Distance from the query point to the path. */
  readonly distance: number;
}

/** Samples used for the coarse search of a projection. */
export const PROJECTION_SAMPLES = 64;
/** The refined projection is within this many units of the true closest length. */
export const PROJECTION_TOLERANCE = 0.5;

/**
 * The closest point of the path to `point`: the nearest of 64 evenly spaced
 * samples, refined by ternary search between its neighbouring samples until
 * the bracket is narrower than 0.5 units. Always returns a point on the path.
 */
export function projectOntoPath(measure: PathMeasure, point: Vec): Projection {
  const { total } = measure;
  const at = (s: number) => distance(pointAtLength(measure, s), point);
  if (total === 0) {
    const only = pointAtLength(measure, 0);
    return { length: 0, point: only, distance: distance(only, point) };
  }
  const step = total / PROJECTION_SAMPLES;
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index <= PROJECTION_SAMPLES; index += 1) {
    const d = at(index * step);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  }
  let low = Math.max(0, (best - 1) * step);
  let high = Math.min(total, (best + 1) * step);
  while (high - low > PROJECTION_TOLERANCE) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    if (at(a) <= at(b)) high = b;
    else low = a;
  }
  const length = (low + high) / 2;
  const closest = pointAtLength(measure, length);
  return { length, point: closest, distance: distance(closest, point) };
}

/**
 * A polyline approximation of the part of the path between two lengths,
 * with roughly one vertex every `spacing` units (and at every segment end).
 */
export function samplePath(measure: PathMeasure, from: number, to: number, spacing = 8): Vec[] {
  const start = Math.max(0, Math.min(from, measure.total));
  const end = Math.max(start, Math.min(to, measure.total));
  const points: Vec[] = [pointAtLength(measure, start)];
  const breaks = measure.tables.map((table) => table.start + table.length).filter((s) => s > start && s < end);
  const count = Math.max(1, Math.ceil((end - start) / spacing));
  const lengths = new Set<number>(breaks);
  for (let index = 1; index <= count; index += 1) lengths.add(start + ((end - start) * index) / count);
  for (const s of [...lengths].sort((a, b) => a - b)) points.push(pointAtLength(measure, s));
  return points;
}

/** An SVG polyline path through points ("M x y L x y …"). */
export function polylineData(points: readonly Vec[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${pair(point)}`).join(" ");
}
