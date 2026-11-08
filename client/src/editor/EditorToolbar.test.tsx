import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderEditor } from "../test/canvas";
import { stateOf } from "../test/fixtures";

describe("EditorToolbar", () => {
  it("adds every basic kind and selects the new node", async () => {
    const { store } = renderEditor(stateOf([]));
    for (const label of [
      "Add step",
      "Add decision",
      "Add start or end",
      "Add sticky note",
      "Add text label",
      "Add line",
    ]) {
      await userEvent.click(screen.getByRole("button", { name: label }));
    }
    const kinds = Object.values(store.getState().doc.nodes).map((node) => node.kind);
    expect(kinds).toEqual(["step", "decision", "start-end", "note", "label", "line"]);
    expect(store.getState().selectedNodeIds).toHaveLength(1);
  });

  it("adds shapes from the shape menu, which closes with Escape or when focus leaves it", async () => {
    const { store } = renderEditor(stateOf([]));
    const trigger = screen.getByRole("button", { name: "Shape" });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("menuitem", { name: "Cylinder" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(Object.values(store.getState().doc.nodes)[0]?.data).toEqual({ text: "", shape: "cylinder" });

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Draw" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("toggles draw mode and adding a node leaves it", async () => {
    const { store } = renderEditor(stateOf([]));
    await userEvent.click(screen.getByRole("button", { name: "Draw" }));
    expect(store.getState().drawMode).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(store.getState().drawMode).toBe(false);
  });

  it("is hidden for viewers", () => {
    renderEditor(stateOf([]), { canEdit: false });
    expect(screen.queryByRole("toolbar", { name: "Add to diagram" })).not.toBeInTheDocument();
  });
});
