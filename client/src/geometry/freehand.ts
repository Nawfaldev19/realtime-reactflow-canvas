import {
  add,
  cyclic,
  distance,
  midpoint,
  normalize,
  perpendicular,
  round2,
  scale,
  sub,
  type Box,
  type Vec,
} from "./vector";

// Freehand ink: turns captured pointer samples into a smooth, closed outline.
//
// 1. Streamline: each sample is pulled part-way towards the previous smoothed
//    point, which removes hand jitter.
// 2. Spacing: samples closer than size × smoothing are dropped.
// 3. Radius per sample from pressure and thinning, tapered near the end.
// 4. Left and right offsets along the normal, joined by round caps, give a
//    closed polygon around the stroke.
// 5. The polygon becomes a path of quadratic curves through edge midpoints,
//    so the result has no corners.
//
// Stored sketches keep their samples relative to the node box plus the box
// size at creation; rendering scales the samples to the current box and
// rebuilds the outline at the stored stroke size, so resizing stretches the
// stroke without thickening it.

export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface StrokeOptions {
  readonly size: number;
  readonly thinning: number;
  readonly smoothing: number;
  readonly streamline: number;
  /** Fraction of the stroke length over which the start narrows (0 = none). */
  readonly taperStart: number;
  /** Fraction of the stroke length over which the end narrows. */
  readonly taperEnd: number;
}

export const DEFAULT_STROKE: StrokeOptions = {
  size: 7,
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  taperStart: 0,
  taperEnd: 0.1,
};

/** Mouse pointers report no pressure; treat them as a medium press. */
export const DEFAULT_PRESSURE = 0.5;
const CAP_STEPS = 8;
/** The thinnest a tapered end gets, as a fraction of the size (so the outline scales with zoom). */
const MIN_RADIUS_FRACTION = 0.035;

/** Pressure to radius with linear easing: size/2 · (1 − thinning + 2·thinning·pressure). */
export function strokeRadius(pressure: number, size: number, thinning: number): number {
  const p = Math.min(1, Math.max(0, pressure));
  return (size / 2) * (1 - thinning + 2 * thinning * p);
}

/** The widest radius any pressure can produce; used to pad the node box. */
export const maxStrokeRadius = (size: number, thinning: number): number => strokeRadius(1, size, thinning);

/** Applies streamlining and minimum spacing. The last sample is always kept. */
export function smoothSamples(points: readonly StrokePoint[], options: StrokeOptions): StrokePoint[] {
  const [first] = points;
  if (!first) return [];
  const pull = 0.15 + (1 - options.streamline) * 0.85;
  const minSpacing = options.size * options.smoothing;
  const kept: StrokePoint[] = [first];
  let previous: StrokePoint = first;
  for (const point of points.slice(1)) {
    const next = {
      x: previous.x + (point.x - previous.x) * pull,
      y: previous.y + (point.y - previous.y) * pull,
      pressure: point.pressure,
    };
    previous = next;
    if (distance(cyclic(kept, -1), next) >= minSpacing) kept.push(next);
  }
  const last = cyclic(points, -1);
  if (distance(cyclic(kept, -1), last) > 0) kept.push(last);
  return kept;
}

function circle(centre: Vec, radius: number): Vec[] {
  return Array.from({ length: CAP_STEPS * 2 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / (CAP_STEPS * 2);
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
}

/** A half circle from `from` around the far side of `tip` (direction `forward`). */
function cap(tip: Vec, normal: Vec, forward: Vec, radius: number): Vec[] {
  const points: Vec[] = [];
  for (let step = 1; step < CAP_STEPS; step += 1) {
    const angle = (Math.PI * step) / CAP_STEPS;
    points.push(add(tip, add(scale(normal, radius * Math.cos(angle)), scale(forward, radius * Math.sin(angle)))));
  }
  return points;
}

function taper(distanceFromEnd: number, total: number, fraction: number): number {
  const span = total * fraction;
  return span > 0 && distanceFromEnd < span ? distanceFromEnd / span : 1;
}

/** The closed outline polygon around a stroke. Empty input gives an empty outline. */
export function strokeOutline(points: readonly StrokePoint[], options: StrokeOptions = DEFAULT_STROKE): Vec[] {
  const samples = smoothSamples(points, options);
  const [first] = samples;
  if (!first) return [];
  if (samples.length === 1) return circle(first, strokeRadius(first.pressure, options.size, options.thinning));

  const along: number[] = [];
  let total = 0;
  samples.forEach((point, index) => {
    if (index > 0) total += distance(cyclic(samples, index - 1), point);
    along.push(total);
  });

  const left: Vec[] = [];
  const right: Vec[] = [];
  const normals: Vec[] = [];
  const radii: number[] = [];
  samples.forEach((point, index) => {
    const before = cyclic(samples, Math.max(0, index - 1));
    const after = cyclic(samples, Math.min(samples.length - 1, index + 1));
    const normal = perpendicular(normalize(sub(after, before)));
    const travelled = cyclic(along, index);
    const shrink = Math.min(
      taper(travelled, total, options.taperStart),
      taper(total - travelled, total, options.taperEnd),
    );
    const radius = Math.max(
      options.size * MIN_RADIUS_FRACTION,
      strokeRadius(point.pressure, options.size, options.thinning) * shrink,
    );
    normals.push(normal);
    radii.push(radius);
    left.push(add(point, scale(normal, radius)));
    right.push(sub(point, scale(normal, radius)));
  });

  const last = samples.length - 1;
  const endTip = cyclic(samples, last);
  const endNormal = cyclic(normals, last);
  const endForward = { x: endNormal.y, y: -endNormal.x };
  const startNormal = cyclic(normals, 0);
  const startBackward = { x: -startNormal.y, y: startNormal.x };
  return [
    ...left,
    ...cap(endTip, endNormal, endForward, cyclic(radii, last)),
    ...right.reverse(),
    ...cap(first, scale(startNormal, -1), startBackward, cyclic(radii, 0)),
  ];
}

/**
 * A closed path through the polygon with no corners: start at the midpoint of
 * the first edge, then for every vertex a quadratic curve with the vertex as
 * control point, ending at the midpoint of the next edge.
 */
export function outlineToPath(polygon: readonly Vec[]): string {
  if (polygon.length < 3) return "";
  const p = (point: Vec) => `${String(round2(point.x))} ${String(round2(point.y))}`;
  const start = midpoint(cyclic(polygon, 0), cyclic(polygon, 1));
  const curves = polygon.map((_, index) => {
    const vertex = cyclic(polygon, index + 1);
    return `Q ${p(vertex)} ${p(midpoint(vertex, cyclic(polygon, index + 2)))}`;
  });
  return `M ${p(start)} ${curves.join(" ")} Z`;
}

/** Flat storage: x, y, pressure repeated. */
export function flattenPoints(points: readonly StrokePoint[]): number[] {
  return points.flatMap((point) => [round2(point.x), round2(point.y), round2(point.pressure)]);
}

/** Splits the flat storage into samples; a trailing partial triple is ignored. */
export function chunkPoints(flat: readonly number[]): StrokePoint[] {
  const points: StrokePoint[] = [];
  for (let index = 0; index + 2 < flat.length; index += 3) {
    const [x, y, pressure] = flat.slice(index, index + 3) as [number, number, number];
    points.push({ x, y, pressure });
  }
  return points;
}

export interface CommittedStroke {
  /** Top-left of the node box, in canvas coordinates. */
  readonly box: Box;
  /** Samples relative to the box's top-left corner, flattened. */
  readonly points: number[];
}

/**
 * Turns samples in canvas coordinates into a node box and box-relative
 * samples. The box is padded by the widest possible stroke radius so the ink
 * stays inside it. A tap without movement returns null (no node).
 */
export function commitStroke(
  points: readonly StrokePoint[],
  size: number,
  thinning = DEFAULT_STROKE.thinning,
): CommittedStroke | null {
  if (points.length < 2) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  if (maxX - minX < 1 && maxY - minY < 1) return null;
  const pad = maxStrokeRadius(size, thinning);
  const box = {
    x: round2(minX - pad),
    y: round2(minY - pad),
    width: round2(maxX - minX + pad * 2),
    height: round2(maxY - minY + pad * 2),
  };
  return {
    box,
    points: flattenPoints(
      points.map((point) => ({ x: point.x - box.x, y: point.y - box.y, pressure: point.pressure })),
    ),
  };
}

/** Scales stored samples from the box size at creation to the current box size. */
export function scaleStroke(
  points: readonly StrokePoint[],
  initial: { width: number; height: number },
  current: { width: number; height: number },
): StrokePoint[] {
  const sx = initial.width > 0 ? current.width / initial.width : 1;
  const sy = initial.height > 0 ? current.height / initial.height : 1;
  if (sx === 1 && sy === 1) return [...points];
  return points.map((point) => ({ x: point.x * sx, y: point.y * sy, pressure: point.pressure }));
}
