import { describe, expect, it } from "vitest";
import { applyOperation } from "../document/operations";
import { GuideIndex } from "../geometry/guides";
import { node, sampleState, stateOf } from "../test/fixtures";
import { DEFAULT_SNAP, Snapper, refreshIndex, relatedIds, type SnapView } from "./snapping";

const VIEW: SnapView = { viewport: { x: 0, y: 0, zoom: 1 }, width: 2000, height: 2000 };

const plan = () =>
  stateOf([
    node("a", { position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, style: { fill: "#2f6b4f" } }),
    node("b", { number: 2, position: { x: 300, y: 300 }, size: { width: 80, height: 40 } }),
    node("g", { kind: "group", number: 3, position: { x: 600, y: 0 }, size: { width: 300, height: 300 } }),
    node("child", { number: 4, parentId: "g", position: { x: 50, y: 100 }, size: { width: 100, height: 50 } }),
  ]);

describe("relatedIds", () => {
  it("collects the moving nodes, their descendants and ancestors", () => {
    const state = sampleState();
    expect([...relatedIds(state, ["a"])].sort()).toEqual(["a", "g"]);
    expect([...relatedIds(state, ["g"])].sort()).toEqual(["a", "b", "g"]);
  });
});

describe("Snapper.move", () => {
  it("snaps a dragged step's left edge to another step's left edge exactly", () => {
    const snapper = new Snapper();
    const result = snapper.move(plan(), { b: { x: 3, y: 300 } }, VIEW, DEFAULT_SNAP);
    expect(result.positions.b).toEqual({ x: 0, y: 300 });
    expect(result.guides.vertical).toMatchObject({ ownerId: "a", anchor: "left", color: "#2f6b4f" });
    expect(snapper.active).toBe(true);
    snapper.end();
    expect(snapper.active).toBe(false);
  });

  it("converts the radius from screen pixels: 8 px at zoom 2 is 4 units", () => {
    const zoomed: SnapView = { ...VIEW, viewport: { x: 0, y: 0, zoom: 2 } };
    expect(new Snapper().move(plan(), { b: { x: 5, y: 300 } }, zoomed, DEFAULT_SNAP).positions.b).toEqual({
      x: 5,
      y: 300,
    });
    expect(new Snapper().move(plan(), { b: { x: 3, y: 300 } }, zoomed, DEFAULT_SNAP).positions.b).toEqual({
      x: 0,
      y: 300,
    });
  });

  it("snaps a child inside a group to a step outside, in absolute coordinates", () => {
    // The child's absolute left is 600 + x; step "a" has its right edge at 100, so nothing; snap its top to a's top (0).
    const result = new Snapper().move(plan(), { child: { x: 50, y: 3 } }, VIEW, DEFAULT_SNAP);
    expect(result.positions.child).toEqual({ x: 50, y: 0 });
    expect(result.guides.horizontal).toMatchObject({ ownerId: "a", anchor: "top" });
  });

  it("uses the bounding box of a multi-selection and moves only nodes without a moving ancestor", () => {
    const state = plan();
    const result = new Snapper().move(state, { g: { x: 604, y: 302 }, child: { x: 50, y: 100 } }, VIEW, DEFAULT_SNAP);
    expect(result.positions.g?.y).toBe(300);
    expect(result.positions.child).toEqual({ x: 50, y: 100 });
  });

  it("skips snapping when disabled, and ignores culled or non-reference steps", () => {
    expect(
      new Snapper().move(plan(), { b: { x: 3, y: 300 } }, VIEW, { ...DEFAULT_SNAP, enabled: false }).positions.b,
    ).toEqual({ x: 3, y: 300 });
    const offscreen: SnapView = { viewport: { x: -2000, y: -2000, zoom: 1 }, width: 500, height: 500 };
    expect(new Snapper().move(plan(), { b: { x: 3, y: 300 } }, offscreen, DEFAULT_SNAP).guides.vertical).toBeNull();
    const onlyChild = new Snapper().move(plan(), { b: { x: 3, y: 300 } }, VIEW, {
      ...DEFAULT_SNAP,
      referenceId: "child",
    });
    expect(onlyChild.guides.vertical).toBeNull();
    // A reference step that no longer exists is ignored.
    expect(
      new Snapper().move(plan(), { b: { x: 3, y: 300 } }, VIEW, { ...DEFAULT_SNAP, referenceId: "gone" }).positions.b,
    ).toEqual({ x: 0, y: 300 });
    expect(new Snapper().move(plan(), {}, VIEW, DEFAULT_SNAP).positions).toEqual({});
  });

  it("re-indexes steps that change during the drag instead of rebuilding", () => {
    const snapper = new Snapper();
    const state = plan();
    expect(snapper.move(state, { b: { x: 450, y: 300 } }, VIEW, DEFAULT_SNAP).guides.vertical).toBeNull();
    // A collaborator moves "a" next to the dragged step.
    const moved = applyOperation(state, { type: "node.update", id: "a", fields: { position: { x: 447, y: 0 } } }).state;
    const result = snapper.move(moved, { b: { x: 450, y: 300 } }, VIEW, DEFAULT_SNAP);
    expect(result.positions.b?.x).toBe(447);
  });
});

describe("refreshIndex", () => {
  it("re-indexes changed steps, contents of moved groups and removals", () => {
    const before = plan();
    const index = GuideIndex.build([]);
    const owners = () => new Set(index.range("vertical", -Infinity, Infinity).map((guide) => guide.ownerId));
    const leftOf = (id: string) =>
      index.range("vertical", -Infinity, Infinity).find((guide) => guide.ownerId === id && guide.anchor === "left")
        ?.value;
    refreshIndex(index, { ...before, nodes: {} }, before, new Set(["b"]));
    expect(owners()).toEqual(new Set(["a", "child", "g"]));
    const groupMoved = applyOperation(before, {
      type: "node.update",
      id: "g",
      fields: { position: { x: 1000, y: 0 } },
    }).state;
    refreshIndex(index, before, groupMoved, new Set(["b"]));
    expect(leftOf("child")).toBe(1050);
    const removed = applyOperation(groupMoved, { type: "node.remove", id: "a" }).state;
    refreshIndex(index, groupMoved, removed, new Set());
    expect(owners().has("a")).toBe(false);
  });
});

describe("Snapper.resize", () => {
  it("snaps the bottom-right corner so the bottoms line up", () => {
    const snapper = new Snapper();
    // "b" is 300..340 high; resize "a" (0..50) from its bottom-right towards y = 340.
    const result = snapper.resize(
      plan(),
      "a",
      { position: { x: 0, y: 0 }, size: { width: 150, height: 336 } },
      VIEW,
      DEFAULT_SNAP,
      { width: 25, height: 25 },
    );
    expect(result.size).toEqual({ width: 150, height: 340 });
    expect(result.guides.horizontal).toMatchObject({ ownerId: "b", anchor: "bottom" });
  });

  it("snaps a top-left resize and keeps the opposite edges fixed, in the child's own coordinates", () => {
    // The child's absolute box is 650..750 × 100..150. Step "c" has its left edge at 640 and its bottom at 70;
    // the group itself is excluded (an ancestor).
    const state = applyOperation(plan(), {
      type: "node.add",
      node: node("c", { number: 5, position: { x: 640, y: 40 }, size: { width: 30, height: 30 } }),
    }).state;
    const result = new Snapper().resize(
      state,
      "child",
      { position: { x: 43, y: 72 }, size: { width: 107, height: 78 } },
      VIEW,
      DEFAULT_SNAP,
      { width: 25, height: 25 },
    );
    expect(result.position).toEqual({ x: 40, y: 70 });
    expect(result.size).toEqual({ width: 110, height: 80 });
  });

  it("does nothing when disabled or for an unknown node", () => {
    const proposed = { position: { x: 0, y: 0 }, size: { width: 150, height: 336 } };
    expect(
      new Snapper().resize(plan(), "a", proposed, VIEW, { ...DEFAULT_SNAP, enabled: false }, { width: 1, height: 1 }),
    ).toEqual({ ...proposed, guides: { horizontal: null, vertical: null } });
    expect(new Snapper().resize(plan(), "zz", proposed, VIEW, DEFAULT_SNAP, { width: 1, height: 1 }).size).toEqual(
      proposed.size,
    );
  });
});
