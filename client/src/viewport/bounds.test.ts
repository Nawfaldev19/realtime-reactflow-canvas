import { describe, expect, it } from "vitest";
import { node, stateOf } from "../test/fixtures";
import { diagramBounds } from "./bounds";

describe("diagram bounds", () => {
  it("is null for an empty diagram", () => {
    expect(diagramBounds(stateOf([]))).toBeNull();
  });

  it("encloses every node, converting children of groups to absolute positions", () => {
    const doc = stateOf([
      node("group", { kind: "group", position: { x: 400, y: 300 }, size: { width: 200, height: 200 } }),
      node("child", { parentId: "group", position: { x: 150, y: 180 }, size: { width: 100, height: 50 } }),
      node("left", { position: { x: -120, y: 40 }, size: { width: 80, height: 40 } }),
    ]);
    // The child is at (550, 480)–(650, 530) in absolute terms, past the group's edge.
    expect(diagramBounds(doc)).toEqual({ x: -120, y: 40, width: 770, height: 490 });
  });
});
