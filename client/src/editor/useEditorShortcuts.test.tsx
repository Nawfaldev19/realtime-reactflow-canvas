import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { serializeDocument } from "../document/serialize";
import { node, sampleState, stateOf } from "../test/fixtures";
import { createEditorStore } from "./store";
import { useEditorShortcuts } from "./useEditorShortcuts";

function setup(document = sampleState(), canEdit = true) {
  const store = createEditorStore();
  store.getState().load({ id: "d", title: "Plan", revision: 1, document: serializeDocument(document), canEdit });
  renderHook(() => useEditorShortcuts(store));
  return store;
}

describe("useEditorShortcuts", () => {
  it("tracks Alt for detaching children, and releases it when the window loses focus", () => {
    const store = setup();
    fireEvent.keyDown(window, { key: "Alt" });
    expect(store.getState().detachMode).toBe(true);
    fireEvent.keyUp(window, { key: "Alt" });
    expect(store.getState().detachMode).toBe(false);
    fireEvent.keyDown(window, { key: "Alt" });
    fireEvent.blur(window);
    expect(store.getState().detachMode).toBe(false);
  });

  it("runs stacking, grouping and editing commands", () => {
    const store = setup(stateOf([node("A", { z: 1 }), node("B", { number: 2, z: 2 })]));
    act(() => store.getState().setSelection(["A"], []));
    fireEvent.keyDown(window, { key: "}", code: "BracketRight", ctrlKey: true, shiftKey: true });
    expect(store.getState().doc.nodes.A?.z).toBe(3);

    act(() => store.getState().setSelection(["A", "B"], []));
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    const group = Object.values(store.getState().doc.nodes).find((entry) => entry.kind === "group");
    expect(group).toBeDefined();
    act(() => store.getState().setSelection([group?.id ?? ""], []));
    fireEvent.keyDown(window, { key: "G", ctrlKey: true, shiftKey: true });
    expect(Object.values(store.getState().doc.nodes).some((entry) => entry.kind === "group")).toBe(false);

    const wrapper = document.createElement("div");
    wrapper.className = "react-flow__node";
    wrapper.dataset.id = "B";
    document.body.append(wrapper);
    fireEvent.keyDown(wrapper, { key: "Enter" });
    expect(store.getState().editingNodeId).toBe("B");
    wrapper.remove();
  });

  it("stops drawing on Escape and removes the last stroke on Mod+Z", () => {
    const store = setup();
    act(() => {
      store.getState().setDrawMode(true);
      store.getState().addSketch({ box: { x: 0, y: 0, width: 20, height: 20 }, points: [0, 0, 0.5, 10, 10, 0.5] });
    });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(Object.values(store.getState().doc.nodes).some((entry) => entry.kind === "sketch")).toBe(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.getState().drawMode).toBe(false);
  });

  it("does nothing for viewers", () => {
    const store = setup(stateOf([node("A")]), false);
    act(() => store.getState().setSelection(["A"], []));
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    fireEvent.keyDown(window, { key: "x" });
    expect(Object.keys(store.getState().doc.nodes)).toEqual(["A"]);
  });

  it("undoes, redoes and duplicates", () => {
    const store = setup(stateOf([node("A")]));
    act(() => {
      store.getState().updateNodes(["A"], () => ({ position: { x: 40, y: 0 } }));
    });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store.getState().doc.nodes.A?.position).toEqual({ x: 0, y: 0 });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(store.getState().doc.nodes.A?.position).toEqual({ x: 40, y: 0 });
    act(() => store.getState().setSelection(["A"], []));
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect(Object.keys(store.getState().doc.nodes)).toHaveLength(2);
  });

  it("opens find for viewers too", () => {
    const store = setup(stateOf([node("A")]), false);
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(store.getState().searchOpen).toBe(true);
  });
});
