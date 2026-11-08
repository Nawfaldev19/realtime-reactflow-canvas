import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import {
  boxForLine,
  direction,
  handlePoint,
  lengthInBox,
  lineEndpoints,
  MIN_LINE_BOX,
  MAX_LINE_LENGTH,
  MIN_LINE_LENGTH,
  resizeLine,
  rotateLine,
  slabExit,
  stemEnd,
} from "./line";

const closeTo = (actual: { x: number; y: number }, expected: { x: number; y: number }, digits = 9) => {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
};

describe("direction", () => {
  it("uses d = (sin θ, −cos θ): 0° is up, 90° right, 180° down, 270° left", () => {
    closeTo(direction(0), { x: 0, y: -1 });
    closeTo(direction(90), { x: 1, y: 0 });
    closeTo(direction(180), { x: 0, y: 1 });
    closeTo(direction(270), { x: -1, y: 0 });
    closeTo(direction(30), { x: 0.5, y: -Math.sqrt(3) / 2 });
  });
});

describe("slab clipping", () => {
  it("exits through the nearer slab", () => {
    // From (50, 50) along (0.6, 0.8): x exits at 50/0.6 = 83.3, y at 50/0.8 = 62.5.
    expect(slabExit({ x: 50, y: 50 }, { x: 0.6, y: 0.8 }, 100, 100)).toBeCloseTo(62.5, 10);
  });

  it("treats an axis with no movement as never exiting", () => {
    expect(slabExit({ x: 80, y: 10 }, { x: 1, y: 0 }, 160, 20)).toBe(80);
    expect(slabExit({ x: 10, y: 80 }, { x: 0, y: -1 }, 20, 160)).toBe(80);
  });

  it("a horizontal line spans the box width through its centre", () => {
    const { start, end } = lineEndpoints(160, 20, 90);
    closeTo(start, { x: 0, y: 10 });
    closeTo(end, { x: 160, y: 10 });
  });

  it("a 45° line runs corner to corner in a square box", () => {
    const { start, end } = lineEndpoints(100, 100, 45);
    closeTo(start, { x: 0, y: 100 });
    closeTo(end, { x: 100, y: 0 });
    expect(lengthInBox(100, 100, 45)).toBeCloseTo(100 * Math.SQRT2, 9);
  });

  it("a 45° line in a wide box is limited by the height", () => {
    // Centre (100, 50), d = (0.707, −0.707): y exits after 50 / 0.707 = 70.7 each way.
    expect(lengthInBox(200, 100, 45)).toBeCloseTo(2 * 50 * Math.SQRT2, 9);
  });
});

describe("rotate handle", () => {
  const horizontal = lineEndpoints(160, 20, 90);

  it("sits 26px from the midpoint along the perpendicular (−v_y, v_x)/|v|", () => {
    closeTo(handlePoint(horizontal), { x: 80, y: 36 });
    closeTo(handlePoint(lineEndpoints(20, 160, 0)), { x: 36, y: 80 });
  });

  it("has a stem that stops 11px short of the handle", () => {
    closeTo(stemEnd(horizontal), { x: 80, y: 25 });
    closeTo(stemEnd(horizontal, 5, 11), { x: 80, y: 10 });
  });

  it("falls back to the midpoint for a zero-length segment", () => {
    expect(handlePoint({ start: { x: 3, y: 4 }, end: { x: 3, y: 4 } })).toEqual({ x: 3, y: 4 });
  });
});

describe("boxForLine", () => {
  it("keeps the centre and uses w = max(L·|sin θ|, 20), h = max(L·|cos θ|, 20)", () => {
    expect(boxForLine({ x: 100, y: 100 }, 200, 0)).toEqual({ x: 90, y: 0, width: 20, height: 200 });
    const thirty = boxForLine({ x: 0, y: 0 }, 100, 30);
    expect(thirty.width).toBeCloseTo(50, 9);
    expect(thirty.height).toBeCloseTo(86.6025, 4);
    expect(thirty.x).toBeCloseTo(-25, 9);
    const flat = boxForLine({ x: 0, y: 0 }, 200, 90);
    expect(flat.height).toBe(MIN_LINE_BOX);
    expect(flat.width).toBeCloseTo(200, 9);
  });

  it("slab clipping inside the derived box gives back exactly the stored length", () => {
    const random = seededRandom(42).next;
    for (let run = 0; run < 500; run += 1) {
      const lineLength = MIN_LINE_LENGTH + random() * 2000;
      const angle = random() * 360;
      const box = boxForLine({ x: 0, y: 0 }, lineLength, angle);
      expect(lengthInBox(box.width, box.height, angle)).toBeCloseTo(lineLength, 6);
    }
  });
});

describe("rotateLine", () => {
  it("360 successive +1° rotations keep the length and the pivot", () => {
    let box = { x: 40, y: 90, width: 200, height: MIN_LINE_BOX };
    let angle = 90;
    for (let step = 0; step < 360; step += 1) {
      const next = rotateLine(box, 200, angle + 1);
      box = next.box;
      angle = next.rotation;
      expect(lengthInBox(box.width, box.height, angle)).toBeCloseTo(200, 6);
    }
    expect(angle).toBeCloseTo(90, 9);
    expect(Math.abs(lengthInBox(box.width, box.height, angle) - 200)).toBeLessThan(0.5);
    expect(box.x + box.width / 2).toBeCloseTo(140, 9);
    expect(box.y + box.height / 2).toBeCloseTo(100, 9);
  });

  it("normalizes the rotation and keeps the length within its limits", () => {
    const result = rotateLine({ x: 0, y: 0, width: 20, height: 20 }, 10, -90);
    expect(result.rotation).toBe(270);
    expect(result.length).toBe(MIN_LINE_LENGTH);
    const long = rotateLine({ x: 0, y: 0, width: 2500, height: 2500 }, 3500, 0);
    expect(long.length).toBe(MAX_LINE_LENGTH);
    expect(long.box.height).toBe(2500);
  });
});

describe("resizeLine", () => {
  it("takes the clipped length of the resized box at the same angle", () => {
    expect(resizeLine({ x: 0, y: 0, width: 300, height: 20 }, 90)).toMatchObject({
      length: 300,
      rotation: 90,
      box: { x: 0, y: 0, width: 300, height: 20 },
    });
  });

  it("rebuilds a line that became too short at the minimum length", () => {
    const result = resizeLine({ x: 0, y: 0, width: 20, height: 20 }, 90);
    expect(result.length).toBe(MIN_LINE_LENGTH);
    expect(result.box.x).toBeCloseTo(-5, 9);
    expect(result.box.width).toBeCloseTo(30, 9);
  });
});
