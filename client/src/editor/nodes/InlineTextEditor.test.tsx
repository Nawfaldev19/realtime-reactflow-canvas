import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderEditor, nodeElement } from "../../test/canvas";
import { node, stateOf } from "../../test/fixtures";
import { resizeTo } from "../../test/resizeObserver";

// A step 100px tall. The box layout has 8px padding top and bottom and a 1px
// border, so its chrome is 18px.
const step = node("s", { kind: "step", size: { width: 180, height: 100 }, data: { text: "Cut legs" } });

function contentOf(container: HTMLElement): HTMLElement {
  const content = nodeElement(container, "s").querySelector<HTMLElement>(".node-text__content");
  if (!content) throw new Error("missing text content");
  return content;
}

describe("in-place text editing", () => {
  it("double-click edits, focuses the text, and ending the edit commits text and grown height as one operation", () => {
    const { store, container } = renderEditor(stateOf([step]));
    fireEvent.doubleClick(nodeElement(container, "s"));
    const editor = screen.getByRole("textbox", { name: "Step text" });
    expect(editor).toHaveFocus();
    expect(editor).toHaveTextContent("Cut legs");
    expect(editor).toHaveClass("nodrag", "nokey");

    editor.textContent = "Cut legs\nand aprons";
    fireEvent.input(editor);
    // The content grows past the node: content 90 + chrome 18 > 100 + 1, so it grows to 90 + 18 + 17.
    act(() => resizeTo(editor, 90));
    expect(store.getState().live.s?.size).toEqual({ width: 180, height: 125 });
    // A smaller measurement never shrinks it.
    act(() => resizeTo(editor, 40));
    expect(store.getState().live.s?.size).toEqual({ width: 180, height: 125 });
    expect(store.getState().pending).toHaveLength(0);

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(store.getState().doc.nodes.s).toMatchObject({
      size: { width: 180, height: 125 },
      data: { text: "Cut legs\nand aprons" },
    });
    expect(store.getState().pending).toHaveLength(1);
  });

  it("Backspace while editing never deletes the node, and deselecting saves the draft", async () => {
    const { store, container } = renderEditor(stateOf([step, node("t", { number: 2, position: { x: 400, y: 0 } })]));
    fireEvent.doubleClick(nodeElement(container, "s"));
    const editor = screen.getByRole("textbox", { name: "Step text" });
    await userEvent.keyboard("{Backspace}");
    expect(store.getState().doc.nodes.s).toBeDefined();
    act(() => store.getState().deleteSelection());
    expect(store.getState().doc.nodes.s).toBeDefined();

    editor.textContent = "Draft";
    fireEvent.input(editor);
    act(() => store.getState().setSelection(["t"], []));
    expect(store.getState().editingNodeId).toBeNull();
    expect(store.getState().doc.nodes.s?.data.text).toBe("Draft");
  });

  it("Cmd+B and Cmd+I toggle bold and italic while editing", () => {
    const { store, container } = renderEditor(stateOf([step]));
    fireEvent.doubleClick(nodeElement(container, "s"));
    const editor = screen.getByRole("textbox", { name: "Step text" });
    fireEvent.keyDown(editor, { key: "b", metaKey: true });
    fireEvent.keyDown(editor, { key: "i", ctrlKey: true });
    fireEvent.keyDown(editor, { key: "u", ctrlKey: true });
    fireEvent.keyDown(editor, { key: "b" });
    expect(store.getState().doc.nodes.s?.style).toEqual({ fontWeight: "bold", fontStyle: "italic" });
    fireEvent.keyDown(editor, { key: "b", metaKey: true });
    expect(store.getState().doc.nodes.s?.style.fontWeight).toBe("normal");
    expect(editor).toHaveStyle({ fontStyle: "italic" });
  });

  it("an overflowing node that is not being edited offers an exact fit, growing or shrinking", async () => {
    const { store, container } = renderEditor(stateOf([step]));
    expect(screen.queryByRole("button", { name: "Fit height to text" })).not.toBeInTheDocument();
    act(() => resizeTo(contentOf(container), 150));
    await userEvent.click(screen.getByRole("button", { name: "Fit height to text" }));
    expect(store.getState().doc.nodes.s?.size).toEqual({ width: 180, height: 168 });
    act(() => resizeTo(contentOf(container), 150));
    expect(screen.queryByRole("button", { name: "Fit height to text" })).not.toBeInTheDocument();
  });

  it("no overflow badge on a node whose content fits", () => {
    const { container } = renderEditor(stateOf([step]));
    act(() => resizeTo(contentOf(container), 83));
    expect(screen.queryByRole("button", { name: "Fit height to text" })).not.toBeInTheDocument();
  });

  it("shows a placeholder for empty text in the editor, and nothing for viewers", () => {
    const label = node("l", { kind: "label", data: { text: "" } });
    const { container } = renderEditor(stateOf([label]));
    expect(nodeElement(container, "l")).toHaveTextContent("Untitled text");
    const viewer = renderEditor(stateOf([{ ...label, id: "v", key: "v" }]), { canEdit: false });
    expect(nodeElement(viewer.container, "v")).toHaveTextContent("");
  });

  it("lines and sketches never enter text editing", () => {
    const line = node("line", { kind: "line", data: { rotation: 90, length: 100 } });
    const { store, container } = renderEditor(stateOf([line]));
    fireEvent.doubleClick(nodeElement(container, "line"));
    expect(store.getState().editingNodeId).toBeNull();
  });
});

describe("shapes", () => {
  it("wrap text between two float guides and centre it vertically", () => {
    const decision = node("d", { kind: "decision", size: { width: 200, height: 100 }, data: { text: "Joints fit?" } });
    const { container } = renderEditor(stateOf([decision]));
    const element = nodeElement(container, "d");
    const guides = element.querySelectorAll<HTMLElement>(".wrap-guide");
    expect(guides).toHaveLength(2);
    expect(guides[0]?.style.shapeOutside).toMatch(/^polygon\(0px 0px, 100px 0px/);
    const content = element.querySelector<HTMLElement>(".node-text__content");
    if (!content) throw new Error("missing content");
    act(() => resizeTo(content, 40));
    expect(content.style.marginTop).toBe("30px");
    expect(element.querySelector(".node-text")?.getAttribute("style")).toContain("clip-path");
  });

  it("drop the guides below 40px and place handles on the outline", () => {
    const tiny = node("t", { kind: "shape", size: { width: 30, height: 30 }, data: { text: "x", shape: "triangle" } });
    const triangle = node("tri", {
      kind: "shape",
      number: 2,
      position: { x: 200, y: 0 },
      size: { width: 100, height: 100 },
      data: { shape: "triangle" },
    });
    const { container } = renderEditor(stateOf([tiny, triangle]));
    expect(nodeElement(container, "t").querySelectorAll(".wrap-guide")).toHaveLength(0);
    const left = nodeElement(container, "tri").querySelector<HTMLElement>('[data-handleid="left"]');
    expect(left?.style.left).toBe("25px");
    expect(left?.style.top).toBe("50px");
  });
});
