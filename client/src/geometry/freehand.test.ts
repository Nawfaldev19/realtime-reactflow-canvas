import { describe, expect, it } from "vitest";
import {
  chunkPoints,
  commitStroke,
  DEFAULT_STROKE,
  flattenPoints,
  maxStrokeRadius,
  outlineToPath,
  scaleStroke,
  smoothSamples,
  strokeOutline,
  strokeRadius,
  type StrokePoint,
} from "./freehand";

const line = (from: number, to: number, y = 0, step = 1, pressure = 0.5): StrokePoint[] => {
  const points: StrokePoint[] = [];
  for (let x = from; x <= to; x += step) points.push({ x, y, pressure });
  return points;
};

const extent = (polygon: readonly { x: number; y: number }[]) => ({
  minX: Math.min(...polygon.map((point) => point.x)),
  maxX: Math.max(...polygon.map((point) => point.x)),
  minY: Math.min(...polygon.map((point) => point.y)),
  maxY: Math.max(...polygon.map((point) => point.y)),
});

describe("strokeRadius", () => {
  it("maps pressure linearly: size/2 · (1 − thinning + 2·thinning·pressure)", () => {
    expect(strokeRadius(0.5, 7, 0.5)).toBe(3.5);
    expect(strokeRadius(1, 7, 0.5)).toBe(5.25);
    expect(strokeRadius(0, 7, 0.5)).toBe(1.75);
    expect(strokeRadius(3, 7, 0.5)).toBe(5.25);
    expect(maxStrokeRadius(7, 0.5)).toBe(5.25);
  });
});

describe("smoothSamples", () => {
  it("returns nothing for no input", () => {
    expect(smoothSamples([], DEFAULT_STROKE)).toEqual([]);
  });

  it("pulls each sample 0.15 + (1 − streamline)·0.85 of the way and keeps the last raw sample", () => {
    const result = smoothSamples(
      [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 10, y: 0, pressure: 0.5 },
      ],
      DEFAULT_STROKE,
    );
    expect(result.map((point) => point.x)).toEqual([0, 5.75, 10]);
  });

  it("drops samples closer than size × smoothing", () => {
    const result = smoothSamples(
      [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 1, y: 0, pressure: 0.5 },
        { x: 2, y: 0, pressure: 0.5 },
      ],
      DEFAULT_STROKE,
    );
    expect(result.map((point) => point.x)).toEqual([0, 2]);
  });
});

describe("strokeOutline", () => {
  it("is empty without samples and a circle for a single sample", () => {
    expect(strokeOutline([])).toEqual([]);
    const dot = strokeOutline([{ x: 5, y: 5, pressure: 0.5 }]);
    expect(dot).toHaveLength(16);
    for (const point of dot) expect(Math.hypot(point.x - 5, point.y - 5)).toBeCloseTo(3.5, 9);
  });

  it("surrounds a straight stroke with a band of the pressure radius, a round start and a tapered end", () => {
    const polygon = strokeOutline(line(0, 100));
    const box = extent(polygon);
    expect(box.minY).toBeCloseTo(-3.5, 6);
    expect(box.maxY).toBeCloseTo(3.5, 6);
    expect(box.minX).toBeCloseTo(-3.5, 6);
    expect(box.maxX).toBeGreaterThan(100);
    expect(box.maxX).toBeLessThan(100.5);
  });

  it("tapers the start when asked", () => {
    const tapered = extent(strokeOutline(line(0, 100), { ...DEFAULT_STROKE, taperStart: 0.2 }));
    expect(tapered.minX).toBeGreaterThan(-1);
  });

  it("matches the zoom: a stroke drawn at zoom 2 with size 14 is the size-7 stroke scaled by 2", () => {
    const flow = [...line(0, 60, 0, 3), ...line(0, 40, 0, 3).map((point) => ({ ...point, x: 60, y: point.x }))];
    const screen = flow.map((point) => ({ ...point, x: point.x * 2, y: point.y * 2 }));
    const atZoom = strokeOutline(screen, { ...DEFAULT_STROKE, size: 14 });
    const committed = strokeOutline(flow);
    expect(atZoom).toHaveLength(committed.length);
    atZoom.forEach((point, index) => {
      expect(point.x).toBeCloseTo((committed[index]?.x ?? NaN) * 2, 6);
      expect(point.y).toBeCloseTo((committed[index]?.y ?? NaN) * 2, 6);
    });
  });
});

describe("outlineToPath", () => {
  it("joins edge midpoints with quadratic curves through the vertices, with no straight corners", () => {
    const path = outlineToPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(path).toBe("M 5 0 Q 10 0 10 5 Q 10 10 5 10 Q 0 10 0 5 Q 0 0 5 0 Z");
    expect(path).not.toContain("L");
  });

  it("returns nothing for fewer than three vertices", () => {
    expect(
      outlineToPath([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe("");
  });
});

describe("storage", () => {
  it("flattens to x, y, pressure triples and chunks them back", () => {
    const points = [
      { x: 1.234, y: 2, pressure: 0.5 },
      { x: 3, y: 4.567, pressure: 1 },
    ];
    const flat = flattenPoints(points);
    expect(flat).toEqual([1.23, 2, 0.5, 3, 4.57, 1]);
    expect(chunkPoints(flat)).toEqual([
      { x: 1.23, y: 2, pressure: 0.5 },
      { x: 3, y: 4.57, pressure: 1 },
    ]);
    expect(chunkPoints([1, 2, 0.5, 9, 9])).toHaveLength(1);
  });

  it("a tap without movement creates no node", () => {
    expect(commitStroke([{ x: 10, y: 10, pressure: 0.5 }], 7)).toBeNull();
    expect(
      commitStroke(
        [
          { x: 10, y: 10, pressure: 0.5 },
          { x: 10.5, y: 10.2, pressure: 0.5 },
        ],
        7,
      ),
    ).toBeNull();
  });

  it("pads the box by the widest radius and stores samples relative to its top-left corner", () => {
    const committed = commitStroke(
      [
        { x: 10, y: 20, pressure: 0.5 },
        { x: 110, y: 70, pressure: 0.5 },
      ],
      7,
    );
    expect(committed).toEqual({
      box: { x: 4.75, y: 14.75, width: 110.5, height: 60.5 },
      points: [5.25, 5.25, 0.5, 105.25, 55.25, 0.5],
    });
  });

  it("scales samples to the current box, so a stroke resized to 2× width spans it with unchanged thickness", () => {
    const stored = line(5, 105, 10, 2);
    const scaled = scaleStroke(stored, { width: 110, height: 20 }, { width: 220, height: 20 });
    expect(scaled[0]?.x).toBe(10);
    expect(scaled.at(-1)?.x).toBe(210);
    const before = extent(strokeOutline(stored));
    const after = extent(strokeOutline(scaled));
    expect(after.maxY - after.minY).toBeCloseTo(before.maxY - before.minY, 6);
    expect(after.maxX - after.minX).toBeGreaterThan((before.maxX - before.minX) * 1.9);
  });

  it("returns an equal copy when the size did not change or the initial size is unknown", () => {
    const stored = line(0, 10);
    expect(scaleStroke(stored, { width: 10, height: 10 }, { width: 10, height: 10 })).toEqual(stored);
    expect(scaleStroke(stored, { width: 0, height: 0 }, { width: 10, height: 10 })).toEqual(stored);
  });
});
