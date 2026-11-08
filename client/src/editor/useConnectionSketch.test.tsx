import { act, fireEvent, render } from "@testing-library/react";
import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { serializeDocument } from "../document/serialize";
import { node, stateOf } from "../test/fixtures";
import { EditorStoreProvider, useEditor, useEditorStoreApi } from "./EditorStoreContext";
import { createEditorStore } from "./store";
import { useConnectionSketch } from "./useConnectionSketch";

function Sketcher({ inProgress }: { inProgress: boolean }) {
  const api = useEditorStoreApi();
  const flow = useStoreApi();
  const connecting = useEditor((state) => state.connection !== null);
  useConnectionSketch(api, connecting);
  if (inProgress)
    flow.setState({
      connection: { ...flow.getState().connection, inProgress: true, from: { x: 0, y: 0 } } as unknown as ReturnType<
        typeof flow.getState
      >["connection"],
    });
  return <input aria-label="Title" />;
}

function setup(inProgress = true) {
  const store = createEditorStore();
  store.getState().load({
    id: "d",
    title: "t",
    revision: 1,
    document: serializeDocument(stateOf([node("a"), node("b")])),
    canEdit: true,
  });
  store.getState().setConnectorDefaults({ style: "polyline" });
  const view = render(
    <EditorStoreProvider store={store}>
      <ReactFlowProvider>
        <Sketcher inProgress={inProgress} />
      </ReactFlowProvider>
    </EditorStoreProvider>,
  );
  return { store, ...view };
}

const move = (x: number, y: number) => {
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));
};

describe("useConnectionSketch", () => {
  it("records pointer moves while Space is held during a connection, and keeps them after release", () => {
    const { store } = setup();
    act(() => {
      store.getState().startConnection("a", "right");
    });
    move(100, 0);
    expect(store.getState().connection?.sketch).toEqual([]);
    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(store.getState().connection?.sketching).toBe(true);
    move(30, 0);
    move(40, 0);
    move(60, 40);
    expect(store.getState().connection?.sketch).toEqual([
      { x: 30, y: 0 },
      { x: 60, y: 40 },
    ]);
    fireEvent.keyUp(window, { code: "Space", key: " " });
    move(200, 200);
    expect(store.getState().connection?.sketch).toHaveLength(2);
    fireEvent.keyUp(window, { code: "KeyA", key: "a" });
  });

  it("ignores Space typed into a text field and does nothing without a connection", () => {
    const { store, getByLabelText } = setup();
    fireEvent.keyDown(window, { code: "Space", key: " " });
    act(() => {
      store.getState().startConnection("a", "right");
    });
    fireEvent.keyDown(getByLabelText("Title"), { code: "Space", key: " " });
    expect(store.getState().connection?.sketching).toBe(false);
    fireEvent.keyDown(window, { code: "KeyB", key: "b" });
    expect(store.getState().connection?.sketching).toBe(false);
  });

  it("records nothing when the canvas has no connection in progress", () => {
    const { store } = setup(false);
    act(() => {
      store.getState().startConnection("a", "right");
    });
    fireEvent.keyDown(window, { code: "Space", key: " " });
    move(100, 100);
    expect(store.getState().connection?.sketch).toEqual([]);
  });
});
