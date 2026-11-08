import { render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { serializeDocument } from "../document/serialize";
import type { DocumentState } from "../document/types";
import { DiagramCanvas } from "../editor/Canvas";
import { EditorStoreProvider } from "../editor/EditorStoreContext";
import { EditorToolbar } from "../editor/EditorToolbar";
import { PropertiesPanel } from "../editor/PropertiesPanel";
import { createEditorStore } from "../editor/store";

/**
 * Opens at a saved view at the origin, 100%, so canvas and client coordinates
 * coincide in jsdom (the canvas library reports a 500 × 500 canvas there, so
 * the default fit-width opening view would move the diagram).
 */
export const ORIGIN_VIEW = {
  openingView: { mode: "saved", customPercent: 70, savedViewport: { x: 0, y: 0, zoom: 1 } },
};

/** Renders the editor canvas, toolbar and properties panel over a store loaded with `doc`. */
export function renderEditor(
  doc: DocumentState,
  {
    selected = [],
    canEdit = true,
    viewSettings = ORIGIN_VIEW,
  }: { selected?: string[]; canEdit?: boolean; viewSettings?: unknown } = {},
) {
  const store = createEditorStore();
  store
    .getState()
    .load({ id: "d1", title: "Plan", revision: 1, document: serializeDocument(doc), canEdit, viewSettings });
  if (selected.length > 0) store.getState().setSelection(selected, []);
  const view = render(
    <EditorStoreProvider store={store}>
      <ReactFlowProvider>
        <EditorToolbar />
        <DiagramCanvas />
        <PropertiesPanel />
      </ReactFlowProvider>
    </EditorStoreProvider>,
  );
  return { store, ...view };
}

/** The canvas wrapper element for a node id. */
export function nodeElement(container: HTMLElement, id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
  if (!element) throw new Error(`No canvas node ${id}`);
  return element;
}
