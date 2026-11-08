import { Redo2, Undo2 } from "lucide-react";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";

// Undo and redo for this person's own changes. Disabled when there is
// nothing to undo or redo, and hidden for viewers.

const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

export function HistoryButtons() {
  const api = useEditorStoreApi();
  const canEdit = useEditor((state) => state.canEdit);
  const canUndo = useEditor((state) => state.history.past.length > 0);
  const canRedo = useEditor((state) => state.history.future.length > 0);
  if (!canEdit) return null;
  const mod = isMac() ? "⌘" : "Ctrl+";
  return (
    <div className="history-buttons" role="group" aria-label="History">
      <button
        type="button"
        className="button button-ghost button-icon"
        aria-label="Undo"
        title={`Undo (${mod}Z)`}
        disabled={!canUndo}
        onClick={() => api.getState().undo()}
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="button button-ghost button-icon"
        aria-label="Redo"
        title={isMac() ? "Redo (⇧⌘Z)" : "Redo (Ctrl+Y)"}
        disabled={!canRedo}
        onClick={() => api.getState().redo()}
      >
        <Redo2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
