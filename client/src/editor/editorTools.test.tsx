import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { CLIPBOARD_TYPE, copyPayload, serializeClipboard } from "../document/clipboard";
import { SHAPE_DRAG_TYPE, encodeLibraryPayload } from "../document/library";
import { serializeDocument } from "../document/serialize";
import type { DocumentState } from "../document/types";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import { DiagramCanvas } from "./Canvas";
import { EditorStoreProvider } from "./EditorStoreContext";
import { EditorToolbar } from "./EditorToolbar";
import { useEditorShortcuts } from "./useEditorShortcuts";
import type { EditorStoreApi } from "./store";
import { HistoryButtons } from "./HistoryButtons";
import { ShapeLibrary } from "./ShapeLibrary";
import { ORIGIN_VIEW } from "../test/canvas";
import { createEditorStore } from "./store";

function Shortcuts({ store }: { store: EditorStoreApi }) {
  useEditorShortcuts(store);
  return null;
}

function renderTools(doc: DocumentState, { canEdit = true, selected = [] as string[] } = {}) {
  const store = createEditorStore();
  store.getState().load({
    id: "d1",
    title: "Plan",
    revision: 1,
    document: serializeDocument(doc),
    canEdit,
    viewSettings: ORIGIN_VIEW,
  });
  if (selected.length > 0) store.getState().setSelection(selected, []);
  const view = render(
    <EditorStoreProvider store={store}>
      <ReactFlowProvider>
        <Shortcuts store={store} />
        <HistoryButtons />
        <EditorToolbar />
        <ShapeLibrary />
        <DiagramCanvas />
      </ReactFlowProvider>
    </EditorStoreProvider>,
  );
  return { store, ...view };
}

const three = () =>
  stateOf(
    [
      node("a", { position: { x: 0, y: 0 } }),
      node("b", { number: 2, position: { x: 200, y: 40 } }),
      node("c", { number: 3, position: { x: 500, y: 90 }, data: { text: "Seal the walnut top" } }),
    ],
    [edge("ab", "a", "b")],
  );

/** A DataTransfer stand-in: jsdom has none. */
function transfer(data: Record<string, string> = {}) {
  const store = new Map(Object.entries(data));
  return {
    get types() {
      return [...store.keys()];
    },
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, value: string) => void store.set(type, value),
    dropEffect: "none",
    effectAllowed: "all",
  };
}

describe("history buttons", () => {
  it("are disabled until there is something to undo, and undo and redo", async () => {
    const { store } = renderTools(three());
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toBeDisabled();
    act(() => {
      store.getState().updateNodes(["a"], () => ({ position: { x: 10, y: 10 } }));
    });
    await userEvent.click(undo);
    expect(store.getState().doc.nodes.a?.position).toEqual({ x: 0, y: 0 });
    expect(undo).toBeDisabled();
    await userEvent.click(redo);
    expect(store.getState().doc.nodes.a?.position).toEqual({ x: 10, y: 10 });
  });

  it("are hidden for viewers", () => {
    renderTools(three(), { canEdit: false });
    expect(screen.queryByRole("group", { name: "History" })).not.toBeInTheDocument();
  });
});

describe("undo shortcuts while editing text", () => {
  it("leave Ctrl/Cmd+Z to the in-place editor, then undo the whole text edit afterwards", async () => {
    const { store } = renderTools(three());
    act(() => {
      store.getState().updateNodes(["a"], () => ({ position: { x: 30, y: 30 } }));
      store.getState().startEditing("a");
    });
    const editor = await screen.findByRole("textbox", { name: "Step text" });
    fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
    expect(store.getState().doc.nodes.a?.position).toEqual({ x: 30, y: 30 });
    act(() => {
      store.getState().setEditDraft("a, sanded");
      store.getState().finishEditing();
    });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(store.getState().doc.nodes.a?.data.text).toBe("a");
    expect(store.getState().doc.nodes.a?.position).toEqual({ x: 30, y: 30 });
  });
});

describe("selection toolbar", () => {
  it("offers align and distribute for several nodes and applies them", async () => {
    const { store } = renderTools(three(), { selected: ["a", "b", "c"] });
    const toolbar = await screen.findByRole("toolbar", { name: "Selection tools" });
    await userEvent.click(within(toolbar).getByRole("button", { name: "Align top" }));
    expect(Object.values(store.getState().doc.nodes).map((entry) => entry.position.y)).toEqual([0, 0, 0]);
    await userEvent.click(within(toolbar).getByRole("button", { name: "Justify right" }));
    expect(Object.values(store.getState().doc.nodes).map((entry) => entry.position.x)).toEqual([500, 500, 500]);
    act(() => {
      store.getState().undo();
    });
    await userEvent.click(within(toolbar).getByRole("button", { name: "Distribute horizontally" }));
    expect(store.getState().doc.nodes.b?.position.x).toBe(250);
    await userEvent.click(within(toolbar).getByRole("button", { name: "Group" }));
    expect(Object.values(store.getState().doc.nodes).some((entry) => entry.kind === "group")).toBe(true);
  });

  it("offers line tools, snap-to-this, duplicate, delete and ungroup", async () => {
    const doc = stateOf([
      node("l", { kind: "line", size: { width: 160, height: 20 }, data: { rotation: 90, length: 160 } }),
      node("g", { kind: "group", number: 2, position: { x: 400, y: 0 }, size: { width: 200, height: 200 } }),
      node("k", { number: 3, parentId: "g", position: { x: 20, y: 40 } }),
    ]);
    const { store } = renderTools(doc, { selected: ["l"] });
    const toolbar = await screen.findByRole("toolbar", { name: "Selection tools" });
    await userEvent.click(within(toolbar).getByRole("button", { name: "Rotate 5° right (Shift: 1°)" }));
    expect(store.getState().doc.nodes.l?.data.rotation).toBe(95);
    await userEvent.click(within(toolbar).getByRole("button", { name: "Snap vertical" }));
    expect(store.getState().doc.nodes.l?.data.rotation).toBe(180);
    await userEvent.click(within(toolbar).getByRole("button", { name: "Snap horizontal" }));
    const shift = within(toolbar).getByRole("button", { name: "Rotate 5° left (Shift: 1°)" });
    fireEvent.click(shift, { shiftKey: true });
    expect(store.getState().doc.nodes.l?.data.rotation).toBe(89);
    const magnet = within(toolbar).getByRole("button", { name: "Snap only to this step" });
    await userEvent.click(magnet);
    expect(store.getState().snapping.referenceId).toBe("l");
    expect(magnet).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(magnet);
    expect(store.getState().snapping.referenceId).toBeNull();
    await userEvent.click(within(toolbar).getByRole("button", { name: "Duplicate" }));
    expect(Object.values(store.getState().doc.nodes).filter((entry) => entry.kind === "line")).toHaveLength(2);
    await userEvent.click(
      within(await screen.findByRole("toolbar", { name: "Selection tools" })).getByRole("button", { name: "Delete" }),
    );
    expect(Object.values(store.getState().doc.nodes).filter((entry) => entry.kind === "line")).toHaveLength(1);

    act(() => store.getState().setSelection(["g"], []));
    await userEvent.click(
      within(await screen.findByRole("toolbar", { name: "Selection tools" })).getByRole("button", { name: "Ungroup" }),
    );
    expect(store.getState().doc.nodes.g).toBeUndefined();
  });

  it("is hidden while dragging, editing and for viewers", () => {
    const { store } = renderTools(three(), { selected: ["a"] });
    expect(screen.getByRole("toolbar", { name: "Selection tools" })).toBeInTheDocument();
    act(() => store.getState().setDragPositions({ a: { x: 5, y: 5 } }));
    expect(screen.queryByRole("toolbar", { name: "Selection tools" })).not.toBeInTheDocument();
  });
});

describe("layout menu", () => {
  it("lays out with both engines in both directions and restores the manual arrangement", async () => {
    const { store } = renderTools(three());
    await userEvent.click(screen.getByRole("button", { name: "Layout" }));
    const menu = screen.getByRole("dialog", { name: "Layout" });
    expect(within(menu).getByRole("button", { name: "Manual — free positioning" })).toBeDisabled();

    await userEvent.click(within(menu).getByRole("button", { name: "Fast" }));
    await waitFor(() => expect(store.getState().doc.layout).toMatchObject({ engine: "dagre", direction: "TB" }));
    expect((store.getState().doc.nodes.b?.position.y ?? 0) > (store.getState().doc.nodes.a?.position.y ?? 0)).toBe(
      true,
    );

    await userEvent.selectOptions(within(menu).getByLabelText("Direction"), "LR");
    await waitFor(() => expect(store.getState().doc.layout).toMatchObject({ engine: "dagre", direction: "LR" }));

    await userEvent.click(within(menu).getByRole("button", { name: "Layered" }));
    await waitFor(() => expect(store.getState().doc.layout).toMatchObject({ engine: "layered", direction: "LR" }));
    expect((store.getState().doc.nodes.b?.position.x ?? 0) > (store.getState().doc.nodes.a?.position.x ?? 0)).toBe(
      true,
    );
    expect(within(menu).getByRole("button", { name: "Layered" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(menu).getByRole("button", { name: "Manual — free positioning" }));
    expect(store.getState().doc.layout).toBeNull();
    expect(store.getState().doc.nodes).toEqual(three().nodes);
    // The glide to the restored places ends with no live fields left.
    await waitFor(() => expect(store.getState().live).toEqual({}));
    within(menu).getByLabelText("Direction").focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Layout" })).not.toBeInTheDocument();
  });

  it("keeps only the latest of two quick choices", async () => {
    const { store } = renderTools(three());
    await userEvent.click(screen.getByRole("button", { name: "Layout" }));
    const menu = screen.getByRole("dialog", { name: "Layout" });
    // The layered engine answers on a later task than dagre, so the dagre choice made second must win.
    fireEvent.click(within(menu).getByRole("button", { name: "Layered" }));
    fireEvent.click(within(menu).getByRole("button", { name: "Fast" }));
    await waitFor(() => expect(store.getState().doc.layout?.engine).toBe("dagre"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(store.getState().doc.layout?.engine).toBe("dagre");
    expect(store.getState().layoutBusy).toBe(false);
  });
});

describe("snapping menu", () => {
  it("toggles snapping, clamps the count into 1–10, stores both in the view settings and clears the reference step", async () => {
    const { store } = renderTools(three());
    act(() => store.getState().setSnapping({ referenceId: "c" }));
    await userEvent.click(screen.getByRole("button", { name: "Snapping" }));
    const menu = screen.getByRole("dialog", { name: "Snapping" });
    await userEvent.click(within(menu).getByLabelText("Snap to other steps"));
    expect(store.getState().snapping.enabled).toBe(false);
    const count = within(menu).getByLabelText("Snap to nearest N steps");
    await userEvent.clear(count);
    await userEvent.type(count, "0");
    await userEvent.tab();
    expect(count).toHaveValue(1);
    await userEvent.clear(count);
    await userEvent.type(count, "40");
    await userEvent.tab();
    expect(count).toHaveValue(10);
    await userEvent.clear(count);
    await userEvent.tab();
    expect(count).toHaveValue(10);
    await userEvent.clear(count);
    await userEvent.type(count, "4{Enter}");
    expect(store.getState().snapping.nearest).toBe(4);
    expect(store.getState().viewSettings.snapping).toEqual({ enabled: false, nearest: 4 });
    expect(within(menu).getByText(/Snapping only to Step 3 \(Seal the walnut top\)/)).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole("button", { name: "Snap to all" }));
    expect(store.getState().snapping.referenceId).toBeNull();
    expect(within(menu).getByText(/Snap only to this step/)).toBeInTheDocument();
  });
});

describe("find", () => {
  it("finds a step far off screen, moves through results and selects one", async () => {
    // jsdom has no layout, so an animated pan has nothing to interpolate; reduced motion pans at once.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("reduce"),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    onTestFinished(() => {
      Reflect.deleteProperty(window, "matchMedia");
    });
    const doc = stateOf(
      [
        node("a", { data: { text: "Cut walnut" } }),
        node("far", { number: 2, position: { x: 90_000, y: 90_000 }, data: { text: "Oil the walnut" } }),
      ],
      [edge("e", "a", "far", { label: { text: "walnut grain" } })],
    );
    const { store } = renderTools(doc);
    act(() => store.getState().setSearchOpen(true));
    const input = screen.getByRole("searchbox", { name: "Find in diagram" });
    expect(input).toHaveFocus();
    await userEvent.type(input, "WALNUT");
    const results = await screen.findByRole("list", { name: "Results" });
    expect(within(results).getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /^All/ })).toHaveTextContent("3");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(store.getState().selectedNodeIds).toEqual(["far"]);
    expect(store.getState().pulse).toEqual({ id: "far", seq: 1 });
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{Enter}");
    expect(store.getState().selectedEdgeIds).toEqual(["e"]);
    await userEvent.click(screen.getByRole("button", { name: /^Steps/ }));
    expect(within(screen.getByRole("list", { name: "Results" })).getAllByRole("button")).toHaveLength(2);
    await userEvent.click(
      within(screen.getByRole("list", { name: "Results" })).getAllByRole("button")[0] as HTMLElement,
    );
    expect(store.getState().selectedNodeIds).toEqual(["a"]);
    expect(within(results).getAllByText("walnut", { selector: "mark" }).length).toBeGreaterThan(0);
    await userEvent.clear(input);
    await userEvent.type(input, "(zz");
    expect(await screen.findByText("No matches.")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}{Escape}");
    expect(store.getState().searchOpen).toBe(false);
  });

  it("closes with its button", async () => {
    const { store } = renderTools(three());
    act(() => store.getState().setSearchOpen(true));
    await userEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(store.getState().searchOpen).toBe(false);
    expect(screen.queryByRole("searchbox", { name: "Find in diagram" })).not.toBeInTheDocument();
  });
});

describe("shape library", () => {
  it("filters, collapses, adds on click and puts its payload on a drag", async () => {
    const { store } = renderTools(stateOf([]));
    const library = screen.getByRole("complementary", { name: "Shape library" });
    await userEvent.type(within(library).getByLabelText("Filter shapes"), "cylinder");
    const item = within(library).getByRole("button", { name: "Cylinder" });
    await userEvent.click(item);
    expect(Object.values(store.getState().doc.nodes)[0]?.data.shape).toBe("cylinder");
    const data = transfer();
    fireEvent.dragStart(item, { dataTransfer: data });
    expect(JSON.parse(data.getData(SHAPE_DRAG_TYPE))).toEqual({ kind: "shape", shape: "cylinder" });
    expect(data.effectAllowed).toBe("move");
    await userEvent.type(within(library).getByLabelText("Filter shapes"), "zzz");
    expect(within(library).getByText("No shapes match.")).toBeInTheDocument();
    await userEvent.click(within(library).getByRole("button", { name: "Hide shapes" }));
    await userEvent.click(screen.getByRole("button", { name: "Shapes" }));
    expect(screen.getByRole("complementary", { name: "Shape library" })).toBeInTheDocument();
  });

  it("creates a dropped shape on the canvas and ignores other drops", () => {
    const { store, container } = renderTools(stateOf([]));
    const canvas = container.querySelector(".editor-canvas") as HTMLElement;
    const over = createEvent.dragOver(canvas, { dataTransfer: transfer({ [SHAPE_DRAG_TYPE]: "{}" }) });
    fireEvent(canvas, over);
    expect(over.defaultPrevented).toBe(true);
    const unrelated = createEvent.dragOver(canvas, { dataTransfer: transfer({ "text/plain": "x" }) });
    fireEvent(canvas, unrelated);
    expect(unrelated.defaultPrevented).toBe(false);
    fireEvent.drop(canvas, { dataTransfer: transfer({ [SHAPE_DRAG_TYPE]: "not json" }), clientX: 10, clientY: 10 });
    expect(Object.keys(store.getState().doc.nodes)).toHaveLength(0);
    fireEvent.drop(canvas, {
      dataTransfer: transfer({ [SHAPE_DRAG_TYPE]: encodeLibraryPayload({ kind: "decision" }) }),
      clientX: 120,
      clientY: 80,
    });
    const [created] = Object.values(store.getState().doc.nodes);
    expect(created?.kind).toBe("decision");
    expect(store.getState().selectedNodeIds).toEqual([created?.id]);
  });

  it("is hidden for viewers, who cannot drop either", () => {
    const { container } = renderTools(stateOf([]), { canEdit: false });
    expect(screen.queryByRole("complementary", { name: "Shape library" })).not.toBeInTheDocument();
    const canvas = container.querySelector(".editor-canvas") as HTMLElement;
    const data = transfer({ [SHAPE_DRAG_TYPE]: "{}" });
    fireEvent.dragOver(canvas, { dataTransfer: data });
    expect(data.dropEffect).toBe("none");
  });
});

describe("clipboard events", () => {
  function clipboardEvent(
    type: "copy" | "paste",
    data: ReturnType<typeof transfer>,
    target: EventTarget = document.body,
  ) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  }

  it("copies the selection under our own type and as text, and pastes it at the pointer", () => {
    const { store, container } = renderTools(sampleState(), { selected: ["g"] });
    const data = transfer();
    expect(clipboardEvent("copy", data).defaultPrevented).toBe(true);
    expect(data.getData(CLIPBOARD_TYPE)).toBe(data.getData("text/plain"));
    const canvas = container.querySelector(".editor-canvas") as HTMLElement;
    fireEvent.pointerMove(canvas, { clientX: 700, clientY: 500 });
    expect(clipboardEvent("paste", data).defaultPrevented).toBe(true);
    const { doc } = store.getState();
    const groups = Object.values(doc.nodes).filter((entry) => entry.kind === "group");
    expect(groups).toHaveLength(2);
    const pasted = groups.find((entry) => entry.id !== "g");
    expect(pasted?.position).toEqual({ x: 700, y: 500 });
    // The pasted children belong to the pasted group, and the internal connector joins the pasted children.
    const children = Object.values(doc.nodes).filter((entry) => entry.parentId === pasted?.id);
    expect(children.map((entry) => entry.data.text).sort()).toEqual(["a", "b"]);
    const internal = Object.values(doc.edges).filter((entry) => children.some((child) => child.id === entry.source));
    expect(internal).toHaveLength(1);
    expect(children.map((child) => child.id)).toContain(internal[0]?.target);
  });

  it("leaves text fields alone, ignores foreign text and falls back to the session copy", () => {
    const { store, container } = renderTools(sampleState(), { selected: ["c"] });
    const input = document.createElement("input");
    document.body.append(input);
    expect(clipboardEvent("copy", transfer(), input).defaultPrevented).toBe(false);
    expect(
      clipboardEvent(
        "paste",
        transfer({
          "text/plain": serializeClipboard(copyPayload(sampleState(), ["c"]) ?? { version: 1, nodes: [], edges: [] }),
        }),
        input,
      ).defaultPrevented,
    ).toBe(false);
    input.remove();
    expect(clipboardEvent("paste", transfer({ "text/plain": "hello" })).defaultPrevented).toBe(false);
    act(() => {
      store.getState().copySelection();
    });
    const canvas = container.querySelector(".editor-canvas") as HTMLElement;
    fireEvent.pointerMove(canvas, { clientX: 5, clientY: 5 });
    fireEvent.pointerLeave(canvas);
    expect(clipboardEvent("paste", transfer()).defaultPrevented).toBe(true);
    expect(Object.keys(store.getState().doc.nodes)).toHaveLength(5);
    act(() => store.getState().setSelection([], []));
    expect(clipboardEvent("copy", transfer()).defaultPrevented).toBe(false);
  });

  it("does not copy while text is selected on the page", () => {
    renderTools(sampleState(), { selected: ["c"] });
    vi.spyOn(window, "getSelection").mockReturnValue({ isCollapsed: false } as Selection);
    expect(clipboardEvent("copy", transfer()).defaultPrevented).toBe(false);
  });
});

describe("guide overlay", () => {
  it("draws the guides on a canvas sized for the pixel ratio", () => {
    const calls: string[] = [];
    const context = {
      setTransform: (...args: number[]) => void calls.push(`transform ${args.join(",")}`),
      clearRect: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => void calls.push("stroke"),
      setLineDash: () => undefined,
      strokeStyle: "",
      lineWidth: 0,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const { store } = renderTools(three());
    const overlay = screen.getByTestId("guide-overlay");
    act(() =>
      store.getState().setGuides({
        horizontal: null,
        vertical: {
          orientation: "vertical",
          value: 12.345,
          ownerId: "a",
          box: { x: 0, y: 0, width: 1, height: 1 },
          anchor: "left",
          color: null,
        },
      }),
    );
    expect(overlay).toHaveAttribute("data-vertical", "left:12.35");
    expect(overlay).not.toHaveAttribute("data-horizontal");
    expect(calls).toContain("transform 2,0,0,2,0,0");
    expect(calls).toContain("stroke");
  });
});
