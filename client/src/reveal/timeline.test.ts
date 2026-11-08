import { describe, expect, it } from "vitest";
import { edge, node, stateOf } from "../test/fixtures";
import { revealOrder } from "./order";
import {
  phaseChanges,
  planReveal,
  REVEAL_TIMING,
  staggerFor,
  type ConnectorCue,
  type NodeCue,
  type Timeline,
} from "./timeline";

const at = (x: number, y: number) => ({ position: { x, y } });
const NO_CAP = { ...REVEAL_TIMING, maxTotal: null };

function nodeCue(timeline: Timeline, id: string): NodeCue {
  const cue = timeline.cues.find((entry): entry is NodeCue => entry.kind === "node" && entry.id === id);
  if (!cue) throw new Error(`no cue for ${id}`);
  return cue;
}

function connectorCue(timeline: Timeline, id: string): ConnectorCue {
  const cue = timeline.cues.find(
    (entry): entry is ConnectorCue => entry.kind === "connectors" && entry.ids.includes(id),
  );
  if (!cue) throw new Error(`no cue for ${id}`);
  return cue;
}

const chain = stateOf(
  [node("a", at(0, 0)), node("b", at(0, 100)), node("c", at(0, 200))],
  [edge("ab", "a", "b"), edge("bc", "b", "c")],
);

describe("planning the reveal", () => {
  it("starts item i at 100 ms × i with the documented durations (worked example)", () => {
    const timeline = planReveal(chain, revealOrder(chain), NO_CAP);
    // Items: a(0) →ab(100) b(200) →bc(300) c(400).
    expect(nodeCue(timeline, "a")).toEqual({ kind: "node", id: "a", start: 0, end: 250 });
    expect(connectorCue(timeline, "ab")).toEqual({
      kind: "connectors",
      source: "a",
      ids: ["ab"],
      start: 100,
      labelStart: 300,
      labelEnd: 450,
      end: 500,
    });
    expect(nodeCue(timeline, "b").start).toBe(200);
    expect(nodeCue(timeline, "c")).toEqual({ kind: "node", id: "c", start: 400, end: 650 });
    // Total = max(last fade end 650, last draw end 300 + 400).
    expect(timeline.total).toBe(700);
  });

  it("pulls a far-away target forward so it is visible when its connector arrives", () => {
    // a → far, but b, c, d come first in reading order (far is lowest), so far would start late.
    const doc = stateOf(
      [
        node("a", at(0, 0)),
        node("far", at(0, 900)),
        node("b", at(300, 100)),
        node("c", at(300, 200)),
        node("d", at(300, 300)),
      ],
      [edge("a-far", "a", "far"), edge("a-b", "a", "b"), edge("b-c", "b", "c"), edge("c-d", "c", "d")],
    );
    const timeline = planReveal(doc, revealOrder(doc), NO_CAP);
    const cue = connectorCue(timeline, "a-far");
    expect(nodeCue(timeline, "far").start).toBeLessThanOrEqual(cue.end - REVEAL_TIMING.fade);
    expect(nodeCue(timeline, "far").start).toBe(cue.start + REVEAL_TIMING.draw - REVEAL_TIMING.fade);
    // Every connector's targets are fully visible by the time it finishes.
    for (const entry of timeline.cues) {
      if (entry.kind !== "connectors") continue;
      for (const id of entry.ids)
        expect(nodeCue(timeline, doc.edges[id]?.target ?? "").end).toBeLessThanOrEqual(entry.end);
    }
  });

  it("keeps a group no later than its children after pulling a child forward", () => {
    const doc = stateOf(
      [
        node("a", at(0, 0)),
        node("b", at(0, 100)),
        node("c", at(0, 200)),
        node("g", { kind: "group", ...at(0, 600), size: { width: 300, height: 200 } }),
        node("child", { ...at(10, 10), parentId: "g" }),
      ],
      [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("a-child", "a", "child")],
    );
    const timeline = planReveal(doc, revealOrder(doc), NO_CAP);
    expect(nodeCue(timeline, "g").start).toBeLessThanOrEqual(nodeCue(timeline, "child").start);
    expect(nodeCue(timeline, "child").start).toBeLessThanOrEqual(
      connectorCue(timeline, "a-child").end - REVEAL_TIMING.fade,
    );
  });

  it("caps long diagrams at the maximum total by shortening the stagger", () => {
    const nodes = Array.from({ length: 40 }, (_, index) => node(`n${String(index)}`, at(0, index * 100)));
    const edges = nodes.slice(1).map((entry, index) => edge(`e${String(index)}`, `n${String(index)}`, entry.id));
    const doc = stateOf(nodes, edges);
    const items = revealOrder(doc);
    // 40 steps and 39 connector groups (79 items): the last connector group starts at 7.7 s and draws for 0.4 s.
    expect(planReveal(doc, items, NO_CAP).total).toBe(100 * 77 + 400);
    const capped = planReveal(doc, items);
    expect(capped.total).toBeLessThanOrEqual(6000);
    expect(capped.stagger).toBeCloseTo((6000 - 400) / 78, 9);
  });

  it("keeps the usual stagger for short diagrams and for no cap", () => {
    expect(staggerFor(1, REVEAL_TIMING)).toBe(100);
    expect(staggerFor(10, REVEAL_TIMING)).toBe(100);
    expect(staggerFor(500, NO_CAP)).toBe(100);
    expect(staggerFor(10_000, { ...REVEAL_TIMING, maxTotal: 100 })).toBe(0);
  });

  it("plans an empty diagram as an empty timeline", () => {
    expect(planReveal(stateOf([]), [])).toEqual({ cues: [], total: 0, stagger: 100 });
  });

  it("ignores items whose connector no longer exists", () => {
    const timeline = planReveal(
      chain,
      [
        { kind: "node", id: "a" },
        { kind: "connectors", source: "a", ids: ["gone"] },
      ],
      NO_CAP,
    );
    expect(timeline.cues).toHaveLength(2);
  });
});

describe("phase changes", () => {
  it("lists fade, draw, label and arrow changes in time order", () => {
    const timeline = planReveal(chain, revealOrder(chain), NO_CAP);
    const changes = phaseChanges(timeline);
    expect(changes.map((change) => change.at)).toEqual([...changes.map((change) => change.at)].sort((a, b) => a - b));
    expect(changes.filter((change) => change.id === "ab")).toEqual([
      { at: 100, target: "connector", id: "ab", phase: "drawing" },
      { at: 300, target: "connector", id: "ab", phase: "labelling" },
      { at: 500, target: "connector", id: "ab", phase: "shown" },
    ]);
    expect(changes.filter((change) => change.id === "a")).toEqual([
      { at: 0, target: "node", id: "a", phase: "fading" },
      { at: 250, target: "node", id: "a", phase: "shown" },
    ]);
  });
});
