import { describe, expect, it } from "vitest";
import { edge, node, stateOf } from "../test/fixtures";
import { seededRandom } from "../test/random";
import { revealOrder, type RevealItem } from "./order";

const ids = (items: readonly RevealItem[]) =>
  items.map((item) => (item.kind === "node" ? item.id : `→${item.ids.join("+")}`));
const at = (x: number, y: number) => ({ position: { x, y } });

describe("reveal order", () => {
  it("is empty for an empty diagram", () => {
    expect(revealOrder(stateOf([]))).toEqual([]);
  });

  it("follows a chain: each step, then its outgoing connectors", () => {
    const doc = stateOf(
      [node("c", at(0, 200)), node("a", at(0, 0)), node("b", at(0, 100))],
      [edge("ab", "a", "b"), edge("bc", "b", "c")],
    );
    expect(ids(revealOrder(doc))).toEqual(["a", "→ab", "b", "→bc", "c"]);
  });

  it("visits branches in reading order and keeps all of a step's connectors together", () => {
    // The decision's right branch is higher than its lower branch, so it comes first.
    const doc = stateOf(
      [node("d", at(0, 0)), node("low", at(0, 300)), node("right", at(300, 20)), node("left", at(-300, 20))],
      [edge("d-low", "d", "low"), edge("d-right", "d", "right"), edge("d-left", "d", "left")],
    );
    expect(ids(revealOrder(doc))).toEqual(["d", "→d-left+d-right+d-low", "left", "right", "low"]);
  });

  it("terminates on cycles and draws a loop back to a visible step", () => {
    const doc = stateOf(
      [node("a", at(0, 0)), node("b", at(0, 100)), node("fix", at(200, 100))],
      [edge("ab", "a", "b"), edge("b-fix", "b", "fix"), edge("fix-b", "fix", "b")],
    );
    expect(ids(revealOrder(doc))).toEqual(["a", "→ab", "b", "→b-fix", "fix", "→fix-b"]);
  });

  it("starts a pure cycle from its top-most step", () => {
    const doc = stateOf(
      [node("low", at(0, 100)), node("top", at(0, 0))],
      [edge("t-l", "top", "low"), edge("l-t", "low", "top")],
    );
    expect(ids(revealOrder(doc))).toEqual(["top", "→t-l", "low", "→l-t"]);
  });

  it("reveals a group as a block: the group, its children by absolute position, then the group's connectors", () => {
    // Child relative positions disagree with absolute ones: "late" is relatively higher but inside a lower group.
    const doc = stateOf(
      [
        node("start", at(0, 0)),
        node("g", { kind: "group", ...at(0, 100), size: { width: 300, height: 300 } }),
        node("g2", { kind: "group", ...at(0, 50), parentId: "g", size: { width: 200, height: 150 } }),
        node("inner", { ...at(20, 40), parentId: "g2" }),
        node("first", { ...at(20, 10), parentId: "g" }),
        node("after", at(0, 500)),
      ],
      [edge("s-g", "start", "g"), edge("first-inner", "first", "inner"), edge("g-after", "g", "after")],
    );
    expect(ids(revealOrder(doc))).toEqual([
      "start",
      "→s-g",
      "g",
      "first",
      "→first-inner",
      "g2",
      "inner",
      "→g-after",
      "after",
    ]);
  });

  it("reaching a child of a group reveals the outermost group first", () => {
    const doc = stateOf(
      [
        node("start", at(0, 0)),
        node("g", { kind: "group", ...at(0, 100), size: { width: 300, height: 200 } }),
        node("child", { ...at(10, 10), parentId: "g" }),
      ],
      [edge("s-child", "start", "child")],
    );
    expect(ids(revealOrder(doc))).toEqual(["start", "→s-child", "g", "child"]);
  });

  it("orders children by absolute position, not by their relative positions", () => {
    // Relative y: a = 10, b = 50, but a's group is lower on the canvas, so b comes first.
    const doc = stateOf([
      node("g1", { kind: "group", ...at(0, 500) }),
      node("a", { ...at(0, 10), parentId: "g1" }),
      node("g0", { kind: "group", ...at(0, 0) }),
      node("b", { ...at(0, 50), parentId: "g0" }),
    ]);
    expect(ids(revealOrder(doc))).toEqual(["g0", "b", "g1", "a"]);
  });

  it("appends unconnected notes and separate parts in reading order", () => {
    const doc = stateOf(
      [
        node("note-low", { kind: "note", ...at(-300, 400) }),
        node("a", at(0, 0)),
        node("b", at(0, 100)),
        node("note-high", { kind: "note", ...at(-300, 50) }),
        node("x", at(500, 300)),
        node("y", at(500, 400)),
      ],
      [edge("ab", "a", "b"), edge("xy", "x", "y"), edge("yx", "y", "x")],
    );
    // x has an incoming connector (a cycle with y), so it is not a root; it follows as a separate part, walked from x.
    expect(ids(revealOrder(doc))).toEqual(["a", "→ab", "b", "note-high", "x", "→xy", "y", "→yx", "note-low"]);
  });

  it("skips connectors whose source or target is missing and keeps self-loops with their step", () => {
    const doc = stateOf(
      [node("a", at(0, 0)), node("b", at(0, 100))],
      [edge("ab", "a", "b"), edge("ghost", "a", "nowhere"), edge("bb", "b", "b"), edge("lost", "gone", "b")],
    );
    expect(ids(revealOrder(doc))).toEqual(["a", "→ab", "b", "→bb"]);
  });

  it("ties on position go to x, then to id", () => {
    const doc = stateOf([node("b", at(0, 0)), node("a", at(0, 0)), node("c", at(-10, 0))]);
    expect(ids(revealOrder(doc))).toEqual(["c", "a", "b"]);
  });

  it("emits every node exactly once and every valid connector once (property)", () => {
    const random = seededRandom(21);
    for (let run = 0; run < 50; run += 1) {
      const nodes = Array.from({ length: 2 + random.int(25) }, (_, index) =>
        node(`n${String(index)}`, at(random.int(800), random.int(800))),
      );
      const edges = Array.from({ length: random.int(40) }, (_, index) =>
        edge(`e${String(index)}`, random.pick(nodes).id, random.pick(nodes).id),
      );
      const items = revealOrder(stateOf(nodes, edges));
      const nodeIds = items.flatMap((item) => (item.kind === "node" ? [item.id] : []));
      const edgeIds = items.flatMap((item) => (item.kind === "connectors" ? item.ids : []));
      expect(new Set(nodeIds).size).toBe(nodes.length);
      expect(nodeIds).toHaveLength(nodes.length);
      expect([...edgeIds].sort()).toEqual(edges.map((entry) => entry.id).sort());
      // A connector group always follows its source.
      items.forEach((item, index) => {
        if (item.kind === "connectors") expect(nodeIds.indexOf(item.source)).toBeLessThan(index);
      });
    }
  });
});
