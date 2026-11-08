import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderEditor, nodeElement } from "../test/canvas";
import { edge, node, stateOf } from "../test/fixtures";

const doc = () =>
  stateOf(
    [
      node("a"),
      node("b", { number: 2, position: { x: 300, y: 0 } }),
      node("n", { kind: "note", number: 3, position: { x: 0, y: 300 } }),
    ],
    [edge("ab", "a", "b")],
  );

describe("while connecting", () => {
  it("shows drop zones and moves the ports outward on every other connectable step", () => {
    const { store, container } = renderEditor(doc());
    expect(screen.queryAllByTestId("drop-zone")).toHaveLength(0);
    act(() => {
      store.getState().startConnection("a", "right");
    });
    expect(nodeElement(container, "b").querySelector("[data-testid=drop-zone]")).not.toBeNull();
    expect(nodeElement(container, "a").querySelector("[data-testid=drop-zone]")).toBeNull();
    expect(nodeElement(container, "n").querySelector("[data-testid=drop-zone]")).toBeNull();
    expect(nodeElement(container, "b").querySelectorAll(".node-handle--outward")).toHaveLength(4);
    expect(container.querySelector(".editor-canvas--connecting")).not.toBeNull();
    act(() => {
      store.getState().endConnection();
    });
    expect(screen.queryAllByTestId("drop-zone")).toHaveLength(0);
  });

  it("keeps ports for viewers, hidden, so connectors still attach", () => {
    const { container } = renderEditor(doc(), { canEdit: false });
    expect(nodeElement(container, "a").querySelectorAll(".node-handle--hidden")).toHaveLength(4);
  });

  it("closes a pending drop and the label editor on a pane click", () => {
    const { store, container } = renderEditor(doc());
    act(() => {
      store.getState().startConnection("a", "right");
      store.getState().openDrop({ x: 0, y: 500 }, { x: 0, y: 0 });
      store.getState().startLabelEdit("ab", "quick");
    });
    const pane = container.querySelector(".react-flow__pane");
    if (!pane) throw new Error("no pane");
    fireEvent.click(pane);
    expect(store.getState().pendingDrop).toBeNull();
    expect(store.getState().labelEditing).toBeNull();
  });

  it("picks the style of new connectors in the toolbar", () => {
    const { store } = renderEditor(doc());
    fireEvent.change(screen.getByLabelText("New connector style"), { target: { value: "connector:spline" } });
    expect(store.getState().connectorDefaults).toEqual({ kind: "connector", style: "spline" });
    fireEvent.change(screen.getByLabelText("New connector style"), { target: { value: "floating:polyline" } });
    expect(store.getState().connectorDefaults).toEqual({ kind: "floating", style: "polyline" });
  });
});
