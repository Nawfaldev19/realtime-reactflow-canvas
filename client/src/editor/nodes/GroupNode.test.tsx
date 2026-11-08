import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { nodeElement, renderEditor } from "../../test/canvas";
import { node, sampleState, stateOf } from "../../test/fixtures";
import { handleNodeChanges } from "../canvasChanges";

describe("GroupNode", () => {
  it("draws its background from colour plus opacity and offers Ungroup when selected", async () => {
    const base = sampleState();
    const group = node("g", {
      kind: "group",
      position: { x: 100, y: 100 },
      size: { width: 300, height: 200 },
      style: { fill: "#808080", opacity: 0.25 },
    });
    const { store, container } = renderEditor({ ...base, nodes: { ...base.nodes, g: group } });
    const frame = nodeElement(container, "g").querySelector<HTMLElement>(".node-group");
    expect(frame?.style.background).toBe("rgba(128, 128, 128, 0.25)");
    expect(screen.queryByRole("button", { name: "Ungroup" })).not.toBeInTheDocument();

    act(() => store.getState().setSelection(["g"], []));
    await userEvent.click(within(nodeElement(container, "g")).getByRole("button", { name: "Ungroup" }));
    expect(store.getState().doc.nodes.g).toBeUndefined();
    expect(store.getState().doc.nodes.a).toMatchObject({ parentId: null, position: { x: 120, y: 140 } });
  });

  it("an empty group offers Delete instead", async () => {
    const { store, container } = renderEditor(stateOf([node("g", { kind: "group" })]), { selected: ["g"] });
    await userEvent.click(within(nodeElement(container, "g")).getByRole("button", { name: "Delete" }));
    expect(store.getState().doc.nodes).toEqual({});
  });

  it("children render with their parent id and above the group's layer; the group sits below edges", () => {
    const { container } = renderEditor(sampleState());
    expect(nodeElement(container, "a").querySelector(".node")?.getAttribute("data-parent-id")).toBe("g");
    expect(Number(nodeElement(container, "g").style.zIndex)).toBeLessThan(0);
    expect(Number(nodeElement(container, "a").style.zIndex)).toBeGreaterThan(0);
  });
});

describe("dragging into and out of groups", () => {
  it("a node released with its centre inside a group joins it, in the same operation as the move", () => {
    const { store } = renderEditor(sampleState());
    act(() => {
      handleNodeChanges([{ type: "position", id: "c", position: { x: 150, y: 150 }, dragging: true }], store);
      handleNodeChanges([{ type: "position", id: "c", dragging: false }], store);
    });
    expect(store.getState().doc.nodes.c).toMatchObject({ parentId: "g", position: { x: 50, y: 50 } });
    expect(store.getState().pending).toHaveLength(1);
  });

  it("a child leaves its group only while Alt is held", () => {
    const { store } = renderEditor(sampleState());
    act(() => {
      handleNodeChanges([{ type: "position", id: "a", position: { x: 500, y: 300 }, dragging: true }], store);
      handleNodeChanges([{ type: "position", id: "a", dragging: false }], store);
    });
    expect(store.getState().doc.nodes.a?.parentId).toBe("g");

    act(() => {
      store.getState().setDetachMode(true);
      handleNodeChanges([{ type: "position", id: "a", position: { x: 600, y: 300 }, dragging: true }], store);
      handleNodeChanges([{ type: "position", id: "a", dragging: false }], store);
    });
    expect(store.getState().doc.nodes.a).toMatchObject({ parentId: null, position: { x: 700, y: 400 } });
  });
});
