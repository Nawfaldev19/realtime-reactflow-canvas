import { describe, expect, it } from "vitest";
import { lengthInBox } from "../geometry/line";
import { node } from "../test/fixtures";
import { lineResizeFields, lineRotationFields, rotateLineBy, snapLine } from "./lines";
import type { DiagramNode } from "./types";

const horizontal = node("l", {
  kind: "line",
  position: { x: 20, y: 90 },
  size: { width: 200, height: 20 },
  data: { rotation: 90, length: 200, thickness: 4 },
});

function applyFields(line: DiagramNode, fields: ReturnType<typeof lineRotationFields>): DiagramNode {
  return { ...line, ...fields, data: { ...line.data, ...fields.data } };
}

describe("line rotation fields", () => {
  it("rotating to vertical keeps the centre and the length", () => {
    expect(lineRotationFields(horizontal, 0)).toEqual({
      position: { x: 110, y: 0 },
      size: { width: 20, height: 200 },
      data: { rotation: 0, length: 200 },
    });
  });

  it("rotations by ±5°, ±45°, snapping and the slider all produce the same box for the same angle", () => {
    const viaDelta = rotateLineBy(horizontal, -45);
    const direct = lineRotationFields(horizontal, 45);
    expect(viaDelta).toEqual(direct);
    const tilted = applyFields(horizontal, lineRotationFields(horizontal, 4));
    expect(snapLine(tilted, "horizontal")).toEqual(lineRotationFields(horizontal, 90));
  });

  it("snaps to the nearer of 0°/180° for vertical and 90°/270° for horizontal", () => {
    const at170 = applyFields(horizontal, lineRotationFields(horizontal, 170));
    expect(snapLine(at170, "vertical").data).toMatchObject({ rotation: 180 });
    expect(snapLine(at170, "horizontal").data).toMatchObject({ rotation: 90 });
    const at300 = applyFields(horizontal, lineRotationFields(horizontal, 300));
    expect(snapLine(at300, "horizontal").data).toMatchObject({ rotation: 270 });
  });

  it("360 successive +1° steps leave the length within 0.5px", () => {
    let line = horizontal;
    for (let step = 0; step < 360; step += 1) line = applyFields(line, rotateLineBy(line, 1));
    expect(Math.abs(lengthInBox(line.size.width, line.size.height, 90) - 200)).toBeLessThan(0.5);
    expect(line.position.x).toBeCloseTo(20, 6);
    expect(line.position.y).toBeCloseTo(90, 6);
  });
});

describe("line resize fields", () => {
  it("takes the new clipped length and keeps the angle", () => {
    expect(lineResizeFields(horizontal, { x: 0, y: 0, width: 300, height: 20 })).toEqual({
      position: { x: 0, y: 0 },
      size: { width: 300, height: 20 },
      data: { rotation: 90, length: 300 },
    });
  });
});
