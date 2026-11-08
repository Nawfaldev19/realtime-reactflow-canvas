import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderEditor } from "../test/canvas";
import { edge, node, stateOf } from "../test/fixtures";

function withDrop() {
  const doc = stateOf([node("a"), node("b", { number: 2, position: { x: 0, y: 200 } })], [edge("ab", "a", "b")]);
  const view = renderEditor(doc);
  act(() => {
    view.store.getState().startConnection("a", "bottom");
    view.store.getState().openDrop({ x: 300, y: 300 }, { x: 40, y: 50 });
  });
  return view;
}

describe("drop menu", () => {
  it("shows the ghost step and a shape menu with focus on the first item", () => {
    withDrop();
    const menu = screen.getByRole("menu", { name: "Create a connected step" });
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(9);
    expect(within(menu).getByRole("menuitem", { name: "Step" })).toHaveFocus();
    expect(screen.getByTestId("ghost-node")).toBeInTheDocument();
  });

  it("creates the chosen shape, connected", () => {
    const { store } = withDrop();
    fireEvent.click(screen.getByRole("menuitem", { name: "Hexagon" }));
    const created = Object.values(store.getState().doc.nodes).find((entry) => entry.kind === "shape");
    expect(created?.data.shape).toBe("hexagon");
    expect(Object.values(store.getState().doc.edges).some((entry) => entry.target === created?.id)).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  });

  it("creates a plain kind too", () => {
    const { store } = withDrop();
    fireEvent.click(screen.getByRole("menuitem", { name: "Start or end" }));
    expect(Object.values(store.getState().doc.nodes).some((entry) => entry.kind === "start-end")).toBe(true);
  });

  it("moves through items with the arrow keys and closes on Escape without changing the document", () => {
    const { store } = withDrop();
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Decision" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Cylinder" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Tab" });
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(Object.keys(store.getState().doc.nodes)).toHaveLength(2);
    expect(store.getState().pending).toHaveLength(0);
  });

  it("closes when focus leaves the menu", () => {
    const { store } = withDrop();
    fireEvent.blur(screen.getByRole("menuitem", { name: "Step" }), { relatedTarget: document.body });
    expect(store.getState().pendingDrop).toBeNull();
  });
});
