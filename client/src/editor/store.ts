import { createStore } from "zustand/vanilla";
import { perfFlags } from "../perf/flags";
import { collaborationSlice } from "./slices/collaboration";
import { connectorSlice } from "./slices/connectors";
import { documentSlice } from "./slices/document";
import { gestureSlice } from "./slices/gestures";
import { INITIAL, sliceContext } from "./slices/shared";
import type { EditorState, EditorStore, EditorStoreOptions } from "./slices/types";
import { viewSlice } from "./slices/view";

// The single source of truth for one editing session. Three kinds of state:
//
// - shared: the diagram document. Changed only through operations, so every
//   change can be saved, replayed after a conflict, sent to peers and
//   inverted for undo (slices/document.ts, slices/collaboration.ts).
// - personal: selection, the node being edited, draw mode, snapping and view
//   settings. Never saved with the document and never sent (slices/view.ts).
// - ephemeral: positions while dragging, live fields while resizing,
//   rotating or growing a node, the connection being drawn (with its
//   sketch), the ghost step of a drop on empty canvas, and measured sizes
//   (slices/gestures.ts, slices/connectors.ts). A connector's handle drags
//   keep their draft inside the connector component and commit once on release.
//
// Each slice implements one group of actions over the same zustand store.

export type * from "./slices/types";

export function createEditorStore({ guards = perfFlags.guards }: EditorStoreOptions = {}) {
  return createStore<EditorStore>()((set, get) => {
    const context = sliceContext(set, get, { guards });
    return {
      ...INITIAL,
      ...documentSlice(context),
      ...gestureSlice(context),
      ...connectorSlice(context),
      ...collaborationSlice(context),
      ...viewSlice(context),
    };
  });
}

export type EditorStoreApi = ReturnType<typeof createEditorStore>;

/** Whether autosave has local changes to save (while collaborating the room stores every change instead). */
export const hasUnsavedChanges = (state: EditorState): boolean => !state.collaborating && state.pending.length > 0;

/** Whether local changes have not reached the server yet, in either mode. */
export const hasUnsyncedChanges = (state: EditorState): boolean => state.pending.length > 0;
