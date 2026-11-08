import { describe, expect, it } from "vitest";
import type { Guide } from "../geometry/guides";
import { backingSize, drawGuides, guideScreenPosition, type GuideContext } from "./guideDrawing";

function recorder() {
  const calls: string[] = [];
  const context: GuideContext = {
    strokeStyle: "",
    lineWidth: 0,
    setTransform: (...args: unknown[]) => void calls.push(`transform ${args.join(",")}`),
    clearRect: (...args: number[]) => void calls.push(`clear ${args.join(",")}`),
    beginPath: () => void calls.push("begin"),
    moveTo: (x: number, y: number) => void calls.push(`move ${String(x)},${String(y)}`),
    lineTo: (x: number, y: number) => void calls.push(`line ${String(x)},${String(y)}`),
    stroke: () => void calls.push(`stroke ${context.strokeStyle as string} ${String(context.lineWidth)}`),
    setLineDash: (dash: number[]) => void calls.push(`dash ${dash.join(",")}`),
  };
  return { context, calls };
}

const guide = (overrides: Partial<Guide>): Guide => ({
  orientation: "vertical",
  value: 100,
  ownerId: "b",
  box: { x: 100, y: 0, width: 50, height: 50 },
  anchor: "left",
  color: null,
  ...overrides,
});

describe("guide drawing", () => {
  it("sizes the backing store by the device pixel ratio", () => {
    expect(backingSize({ width: 801, height: 600, pixelRatio: 1.5 })).toEqual({ width: 1202, height: 900 });
  });

  it("converts guide values to screen positions with the viewport", () => {
    const viewport = { x: 40, y: -20, zoom: 2 };
    expect(guideScreenPosition(guide({}), viewport)).toBe(240);
    expect(guideScreenPosition(guide({ orientation: "horizontal", value: 30 }), viewport)).toBe(40);
  });

  it("draws full-length solid edge guides and dashed centre guides, scaled for the pixel ratio", () => {
    const { context, calls } = recorder();
    drawGuides(
      context,
      {
        vertical: guide({ color: "#2f6b4f" }),
        horizontal: guide({ orientation: "horizontal", value: 10.4, anchor: "middle" }),
      },
      { x: 0, y: 0, zoom: 1 },
      { width: 300, height: 200, pixelRatio: 2 },
      "#b4532a",
    );
    expect(calls).toEqual([
      "transform 2,0,0,2,0,0",
      "clear 0,0,300,200",
      "dash 5,5",
      "begin",
      "move 0,10",
      "line 300,10",
      "stroke #b4532a 2",
      "dash ",
      "begin",
      "move 100,0",
      "line 100,200",
      "stroke #2f6b4f 2",
    ]);
  });

  it("only clears when there are no guides", () => {
    const { context, calls } = recorder();
    drawGuides(
      context,
      { vertical: null, horizontal: null },
      { x: 0, y: 0, zoom: 1 },
      { width: 10, height: 10, pixelRatio: 1 },
      "#000",
    );
    expect(calls).toEqual(["transform 1,0,0,1,0,0", "clear 0,0,10,10"]);
  });
});
