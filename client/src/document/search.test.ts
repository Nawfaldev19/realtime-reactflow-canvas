import { describe, expect, it } from "vitest";
import { edge, node, stateOf } from "../test/fixtures";
import { EXCERPT_CONTEXT, createSearchIndex, foldCase, searchEntries } from "./search";
import { applyOperation } from "./operations";

const plan = () =>
  stateOf(
    [
      node("s1", { data: { text: "Cut the walnut legs" } }),
      node("s2", { kind: "decision", number: 2, data: { text: "Legs square?" } }),
      node("n1", { kind: "note", number: 3, data: { text: "Buy (a) spare walnut board" } }),
      node("g1", { kind: "group", number: 4, data: { text: "Walnut prep" } }),
      node("l1", { kind: "line", number: 5, data: { rotation: 90 } }),
      node("e1", { number: 6, data: { text: "   " } }),
      node("far", { number: 7, position: { x: 90_000, y: 90_000 }, data: { text: "Seal with hardwax oil" } }),
    ],
    [edge("c1", "s1", "s2", { label: { text: "Then check walnut grain" } }), edge("c2", "s2", "n1")],
  );

describe("foldCase", () => {
  it("lower-cases without changing the length", () => {
    expect(foldCase("Walnut LEGS")).toBe("walnut legs");
    expect(foldCase("İzmir")).toHaveLength(5);
    expect(foldCase("İzmir")).toBe("İzmir");
  });
});

describe("search", () => {
  it("finds text in every category, including steps far outside the view", () => {
    const entries = createSearchIndex()(plan());
    const { hits, counts } = searchEntries(entries, "WALNUT");
    expect(hits.map((hit) => hit.entry.targetId)).toEqual(["s1", "n1", "g1", "c1"]);
    expect(counts).toEqual({ all: 4, steps: 1, notes: 1, groups: 1, connectors: 1 });
    expect(counts.steps + counts.notes + counts.groups + counts.connectors).toBe(counts.all);
    expect(searchEntries(entries, "hardwax").hits[0]?.entry).toMatchObject({
      targetId: "far",
      badge: "Step 7",
      target: "node",
    });
    expect(hits[3]?.entry).toMatchObject({ target: "edge", badge: "1 → 2" });
  });

  it("filters by category without changing the counts", () => {
    const entries = createSearchIndex()(plan());
    const { hits, counts } = searchEntries(entries, "walnut", "notes");
    expect(hits.map((hit) => hit.entry.targetId)).toEqual(["n1"]);
    expect(counts.all).toBe(4);
  });

  it("treats regular-expression characters as text", () => {
    const entries = createSearchIndex()(plan());
    expect(() => searchEntries(entries, "(a")).not.toThrow();
    expect(searchEntries(entries, "(a").hits.map((hit) => hit.entry.targetId)).toEqual(["n1"]);
    expect(searchEntries(entries, ".*").hits).toEqual([]);
  });

  it("finds nothing for an empty query", () => {
    expect(searchEntries(createSearchIndex()(plan()), "   ")).toEqual({
      hits: [],
      counts: { all: 0, steps: 0, notes: 0, groups: 0, connectors: 0 },
    });
  });

  it("cuts excerpts to 20 characters of context on each side", () => {
    const text = `${"a".repeat(30)} needle ${"b".repeat(30)}`;
    const entries = createSearchIndex()(stateOf([node("long", { data: { text } })]));
    const [hit] = searchEntries(entries, "NEEDLE").hits;
    expect(hit?.excerpt).toEqual({
      before: `${"a".repeat(EXCERPT_CONTEXT - 1)} `,
      match: "needle",
      after: ` ${"b".repeat(EXCERPT_CONTEXT - 1)}`,
      cutStart: true,
      cutEnd: true,
    });
    const short = searchEntries(createSearchIndex()(stateOf([node("x", { data: { text: "Glue\nand clamp" } })])), "and")
      .hits[0];
    expect(short?.excerpt).toEqual({ before: "Glue ", match: "and", after: " clamp", cutStart: false, cutEnd: false });
  });

  it("reuses entries for unchanged nodes and re-reads changed ones", () => {
    const index = createSearchIndex();
    const state = plan();
    const first = index(state);
    const changed = applyOperation(state, {
      type: "node.update",
      id: "s1",
      fields: { data: { text: "Cut the oak legs" } },
    }).state;
    const second = index(changed);
    expect(second.find((entry) => entry.targetId === "n1")).toBe(first.find((entry) => entry.targetId === "n1"));
    expect(second.find((entry) => entry.targetId === "s1")?.text).toBe("Cut the oak legs");
    expect(second.find((entry) => entry.targetId === "c1")).toBe(first.find((entry) => entry.targetId === "c1"));
    const renumbered = applyOperation(changed, { type: "node.update", id: "s1", fields: { number: 40 } }).state;
    expect(index(renumbered).find((entry) => entry.targetId === "c1")?.badge).toBe("40 → 2");
  });

  it("names a connector whose ends are missing generically", () => {
    const entries = createSearchIndex()({
      ...stateOf([node("a")]),
      edges: { x: edge("x", "a", "gone", { label: { text: "orphan" } }) },
    });
    expect(entries[1]?.badge).toBe("Connector");
  });
});
