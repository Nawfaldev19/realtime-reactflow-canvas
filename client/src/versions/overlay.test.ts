import { describe, expect, it } from "vitest";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import { absolutePosition } from "../document/operations";
import type { DocumentState } from "../document/types";
import { diffDocuments } from "./diff";
import { overlayView, REMOVED_PREFIX } from "./overlay";

const view = (older: DocumentState, newer: DocumentState) => overlayView(older, newer, diffDocuments(older, newer));

describe("overlayView", () => {
  it("draws the newer document plus the removed entities under prefixed ids", () => {
    const older = sampleState();
    const newer = stateOf(
      [...Object.values(older.nodes).filter((entry) => entry.id !== "c"), node("d", { number: 5 })],
      [edge("ab", "a", "b")],
    );
    const overlay = view(older, newer);

    expect(Object.keys(overlay.doc.nodes).sort()).toEqual(["a", "b", "d", "g", `${REMOVED_PREFIX}c`]);
    expect(overlay.nodes).toEqual({
      g: "unchanged",
      a: "unchanged",
      b: "unchanged",
      d: "added",
      [`${REMOVED_PREFIX}c`]: "removed",
    });
    expect(overlay.edges).toEqual({ ab: "unchanged", [`${REMOVED_PREFIX}bc`]: "removed" });
    expect(overlay.doc.edges[`${REMOVED_PREFIX}bc`]).toMatchObject({ source: "b", target: `${REMOVED_PREFIX}c` });
    expect(overlay.entries.d?.status).toBe("added");
    expect(overlay.entries[`${REMOVED_PREFIX}c`]?.olderId).toBe("c");
  });

  it("keeps a removed step inside its surviving group at its old absolute position, even after the group moved", () => {
    const older = sampleState();
    const newer = stateOf(
      [
        ...Object.values(older.nodes)
          .filter((entry) => entry.id !== "a")
          .map((entry) => (entry.id === "g" ? { ...entry, position: { x: 300, y: 50 } } : entry)),
      ],
      [edge("bc", "b", "c")],
    );
    const overlay = view(older, newer);
    const ghost = overlay.doc.nodes[`${REMOVED_PREFIX}a`];

    expect(ghost?.parentId).toBe("g");
    expect(absolutePosition(overlay.doc, `${REMOVED_PREFIX}a`)).toEqual(absolutePosition(older, "a"));
    expect(overlay.edges[`${REMOVED_PREFIX}ab`]).toBe("removed");
  });

  it("remaps references through keys when the newer version has different ids", () => {
    const older = sampleState();
    const newer = stateOf(
      Object.values(older.nodes)
        .filter((entry) => entry.id !== "b")
        .map((entry) => ({ ...entry, id: `new-${entry.id}`, parentId: entry.parentId && `new-${entry.parentId}` })),
    );
    const overlay = view(older, newer);

    expect(overlay.doc.nodes[`${REMOVED_PREFIX}b`]?.parentId).toBe("new-g");
    expect(overlay.doc.edges[`${REMOVED_PREFIX}ab`]).toMatchObject({ source: "new-a", target: `${REMOVED_PREFIX}b` });
    expect(overlay.doc.edges[`${REMOVED_PREFIX}bc`]).toMatchObject({ source: `${REMOVED_PREFIX}b`, target: "new-c" });
    expect(Object.values(overlay.nodes).filter((status) => status === "removed")).toHaveLength(1);
  });

  it("keeps children of a removed group inside the removed group", () => {
    const older = sampleState();
    const newer = stateOf([node("c", { number: 4, position: { x: 600, y: 100 }, z: 4 })]);
    const overlay = view(older, newer);

    expect(overlay.doc.nodes[`${REMOVED_PREFIX}a`]).toMatchObject({
      parentId: `${REMOVED_PREFIX}g`,
      position: { x: 20, y: 40 },
    });
    expect(overlay.doc.nodes[`${REMOVED_PREFIX}g`]?.parentId).toBeNull();
  });

  it("draws a removed child at the top level when its old group is no longer a group or never existed", () => {
    const older = stateOf([
      node("p", { kind: "group", position: { x: 50, y: 60 } }),
      node("a", { number: 2, parentId: "p", position: { x: 5, y: 5 } }),
      node("o", { number: 3, parentId: "missing", position: { x: 7, y: 8 } }),
    ]);
    const newer = stateOf([node("p", { kind: "step", position: { x: 50, y: 60 } })]);
    const overlay = view(older, newer);

    expect(overlay.doc.nodes[`${REMOVED_PREFIX}a`]).toMatchObject({ parentId: null, position: { x: 55, y: 65 } });
    expect(overlay.doc.nodes[`${REMOVED_PREFIX}o`]).toMatchObject({ parentId: null, position: { x: 7, y: 8 } });
  });

  it("shows no removed entities between identical documents", () => {
    const overlay = view(sampleState(), sampleState());

    expect(overlay.doc.nodes).toEqual(sampleState().nodes);
    expect(Object.values(overlay.nodes).every((status) => status === "unchanged")).toBe(true);
  });
});
