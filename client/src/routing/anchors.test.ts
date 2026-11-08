import { describe, expect, it } from "vitest";
import type { Box } from "../geometry/vector";
import { closestSides, isHorizontalSide, NORMALS, OPPOSITE, portPoint, resolveSides, SIDE_HYSTERESIS } from "./anchors";

const SOURCE: Box = { x: 0, y: 0, width: 100, height: 50 };
const at = (x: number, y: number, width = 100, height = 50): Box => ({ x, y, width, height });

describe("ports", () => {
  it("are the side midpoints unless the shape supplies its own", () => {
    expect(portPoint(SOURCE, "top")).toEqual({ x: 50, y: 0 });
    expect(portPoint(SOURCE, "right")).toEqual({ x: 100, y: 25 });
    expect(portPoint(SOURCE, "bottom")).toEqual({ x: 50, y: 50 });
    expect(portPoint(SOURCE, "left")).toEqual({ x: 0, y: 25 });
    const offsets = { top: { x: 1, y: 2 }, right: { x: 3, y: 4 }, bottom: { x: 5, y: 6 }, left: { x: 7, y: 8 } };
    expect(portPoint(at(10, 10), "right", offsets)).toEqual({ x: 13, y: 14 });
  });

  it("have outward normals and opposites", () => {
    expect(NORMALS.left).toEqual({ x: -1, y: 0 });
    expect(NORMALS.bottom).toEqual({ x: 0, y: 1 });
    expect(OPPOSITE.top).toBe("bottom");
    expect(isHorizontalSide("left")).toBe(true);
    expect(isHorizontalSide("top")).toBe(false);
  });
});

describe("closestSides", () => {
  it("picks right → left for a target to the right and bottom → top for one below", () => {
    expect(closestSides({ source: SOURCE, target: at(300, 0) })).toEqual({ source: "right", target: "left" });
    expect(closestSides({ source: SOURCE, target: at(0, 300) })).toEqual({ source: "bottom", target: "top" });
    expect(closestSides({ source: SOURCE, target: at(-300, -10) })).toEqual({ source: "left", target: "right" });
    expect(closestSides({ source: SOURCE, target: at(10, -300) })).toEqual({ source: "top", target: "bottom" });
  });

  it("uses centres, so a much larger target does not confuse the choice", () => {
    // A tall target whose top-left corner is above the source but whose centre is below-right.
    expect(closestSides({ source: SOURCE, target: at(250, -100, 100, 400) })).toEqual({
      source: "right",
      target: "left",
    });
  });

  it("switches from right to bottom only once bottom is shorter by the hysteresis margin", () => {
    // Walk the target from the right of the source to below it.
    let previous = closestSides({ source: SOURCE, target: at(250, 0) });
    expect(previous.source).toBe("right");
    let switchedAt: number | null = null;
    for (let step = 0; step <= 100; step += 1) {
      const target = at(250 - step * 2.5, step * 3);
      const naive = closestSides({ source: SOURCE, target });
      const sticky = closestSides({ source: SOURCE, target, previous });
      if (naive.source === "bottom" && sticky.source === "right") {
        // In the dead band: bottom is shorter, but not by enough yet.
        const right = Math.hypot(portPoint(target, sticky.target).x - 100, portPoint(target, sticky.target).y - 25);
        const bottom = Math.hypot(portPoint(target, naive.target).x - 50, portPoint(target, naive.target).y - 50);
        expect(right - bottom).toBeLessThan(SIDE_HYSTERESIS);
      }
      if (sticky.source === "bottom" && switchedAt === null) switchedAt = step;
      previous = sticky;
    }
    expect(switchedAt).not.toBeNull();
    expect(previous.source).toBe("bottom");
  });

  it("keeps the previous pair on an exact tie", () => {
    // Two squares on a diagonal: bottom → left and right → top are both √(150² + 150²) long.
    const square = at(0, 0, 100, 100);
    const target = at(200, 200, 100, 100);
    expect(closestSides({ source: square, target })).toEqual({ source: "bottom", target: "left" });
    expect(closestSides({ source: square, target, previous: { source: "right", target: "top" } })).toEqual({
      source: "right",
      target: "top",
    });
  });

  it("respects a fixed side and ignores an incompatible previous pair", () => {
    expect(closestSides({ source: SOURCE, target: at(300, 300) }, { source: "left" })).toEqual({
      source: "left",
      target: "left",
    });
    expect(
      closestSides(
        { source: SOURCE, target: at(300, 0), previous: { source: "top", target: "bottom" } },
        { target: "top" },
      ),
    ).toEqual({ source: "right", target: "top" });
  });
});

describe("resolveSides", () => {
  it("keeps explicit sides and fills unset ones", () => {
    expect(resolveSides({ source: "top", target: "left" }, { source: SOURCE, target: at(300, 0) })).toEqual({
      source: "top",
      target: "left",
    });
    expect(resolveSides({ source: null, target: null }, { source: SOURCE, target: at(300, 0) })).toEqual({
      source: "right",
      target: "left",
    });
    expect(resolveSides({ source: "bottom", target: null }, { source: SOURCE, target: at(300, 0) })).toEqual({
      source: "bottom",
      target: "left",
    });
  });
});
