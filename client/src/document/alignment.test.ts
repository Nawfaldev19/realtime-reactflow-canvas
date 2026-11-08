import { describe, expect, it } from "vitest";
import { node, sampleState, stateOf } from "../test/fixtures";
import { arrangeable, distributeOperation, lineUpOperation } from "./alignment";
import { absoluteBox } from "./groups";
import { applyOperation } from "./operations";

describe("lineUpOperation", () => {
  it("gives steps in different groups equal absolute left edges (acceptance)", () => {
    const state = stateOf([
      node("g1", { kind: "group", position: { x: 100, y: 0 }, size: { width: 400, height: 300 } }),
      node("g2", { kind: "group", position: { x: 700, y: 0 }, size: { width: 400, height: 300 }, number: 2 }),
      node("a", { parentId: "g1", position: { x: 50, y: 20 }, number: 3 }),
      node("b", { parentId: "g2", position: { x: 10, y: 40 }, number: 4 }),
      node("c", { position: { x: 300, y: 400 }, number: 5 }),
    ]);
    const op = lineUpOperation(state, ["a", "b", "c"], "left");
    const after = applyOperation(state, op ?? { type: "batch", ops: [] }).state;
    expect(["a", "b", "c"].map((id) => absoluteBox(after, id)?.x)).toEqual([150, 150, 150]);
    // Converted back into each parent's space.
    expect(after.nodes.b?.position).toEqual({ x: -550, y: 40 });
  });

  it("returns null for fewer than two nodes or when nothing moves", () => {
    const state = sampleState();
    expect(lineUpOperation(state, ["c"], "left")).toBeNull();
    expect(lineUpOperation(state, ["a", "b"], "left")).toBeNull();
    expect(lineUpOperation(state, ["a", "b"], "right")).toBeNull();
    expect(lineUpOperation(state, ["a", "missing"], "top")).toBeNull();
  });

  it("leaves out nodes whose group is also selected", () => {
    const state = sampleState();
    expect(arrangeable(state, ["g", "a", "c"]).map((entry) => entry.id)).toEqual(["g", "c"]);
    expect(lineUpOperation(state, ["g", "a", "c"], "left")).toEqual({
      type: "batch",
      ops: [{ type: "node.update", id: "c", fields: { position: { x: 100, y: 100 } } }],
    });
  });
});

describe("distributeOperation", () => {
  it("gives four steps equal gaps (acceptance)", () => {
    const state = stateOf([
      node("a", { position: { x: 0, y: 0 }, size: { width: 40, height: 20 } }),
      node("b", { position: { x: 70, y: 0 }, size: { width: 60, height: 20 }, number: 2 }),
      node("c", { position: { x: 130, y: 0 }, size: { width: 20, height: 20 }, number: 3 }),
      node("d", { position: { x: 400, y: 0 }, size: { width: 80, height: 20 }, number: 4 }),
    ]);
    const after = applyOperation(
      state,
      distributeOperation(state, ["a", "b", "c", "d"], "horizontal") ?? { type: "batch", ops: [] },
    ).state;
    const boxes = ["a", "b", "c", "d"].map((id) => absoluteBox(after, id)).filter((box) => box !== null);
    const gaps = boxes.slice(1).map((box, at) => box.x - ((boxes[at]?.x ?? 0) + (boxes[at]?.width ?? 0)));
    for (const gap of gaps) expect(Math.abs(gap - (gaps[0] ?? 0))).toBeLessThanOrEqual(0.5);
    expect(gaps[0]).toBeCloseTo(280 / 3);
  });

  it("needs three nodes", () => {
    expect(distributeOperation(sampleState(), ["a", "c"], "vertical")).toBeNull();
  });
});
