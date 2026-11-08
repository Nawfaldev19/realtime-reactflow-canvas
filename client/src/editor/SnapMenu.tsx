import { useState, type FocusEvent } from "react";
import { ChevronDown, Magnet } from "lucide-react";
import { KIND_TRAITS } from "../document/nodeKinds";
import { clampNearest, NEAREST_RANGE } from "../viewport/settings";
import { useEditor, useEditorShallow, useEditorStoreApi } from "./EditorStoreContext";

// Snapping settings: on or off and how many nearby steps can produce guides
// are saved with the diagram's view settings; the step chosen with "Snap only
// to this step" is personal and lasts for the session (cleared here, or
// automatically when that step is removed).

export function SnapMenu() {
  const api = useEditorStoreApi();
  const snapping = useEditor((state) => state.snapping);
  const reference = useEditorShallow((state) => {
    const node = state.snapping.referenceId === null ? undefined : state.doc.nodes[state.snapping.referenceId];
    return node
      ? {
          label: `${KIND_TRAITS[node.kind].label} ${String(node.number)}`,
          text: typeof node.data.text === "string" ? node.data.text.slice(0, 24) : "",
        }
      : null;
  });
  const [open, setOpen] = useState(false);
  const [nearest, setNearest] = useState(String(snapping.nearest));

  const closeOnLeave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };
  const commitNearest = () => {
    const value = Number(nearest);
    if (nearest.trim() === "" || !Number.isFinite(value)) {
      setNearest(String(api.getState().snapping.nearest));
      return;
    }
    const clamped = clampNearest(value);
    setNearest(String(clamped));
    api.getState().setSnapping({ nearest: clamped });
  };

  return (
    <div className="menu-anchor" onBlur={closeOnLeave}>
      <button
        type="button"
        className="button button-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Magnet size={16} aria-hidden="true" /> Snapping <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="menu layout-menu"
          role="dialog"
          aria-label="Snapping"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <label className="prop-check">
            <input
              type="checkbox"
              checked={snapping.enabled}
              onChange={(event) => api.getState().setSnapping({ enabled: event.target.checked })}
            />
            Snap to other steps
          </label>
          <label className="layout-menu__field">
            <span>Snap to nearest N steps</span>
            <input
              className="input input-compact"
              type="number"
              min={NEAREST_RANGE.min}
              max={NEAREST_RANGE.max}
              step={1}
              value={nearest}
              onChange={(event) => setNearest(event.target.value)}
              onBlur={commitNearest}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitNearest();
              }}
            />
          </label>
          {reference ? (
            <p className="field-hint">
              Snapping only to {reference.label}
              {reference.text ? ` (${reference.text})` : ""}.{" "}
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => api.getState().setSnapping({ referenceId: null })}
              >
                Snap to all
              </button>
            </p>
          ) : (
            <p className="field-hint">Select one step and choose “Snap only to this step” to align to it alone.</p>
          )}
        </div>
      )}
    </div>
  );
}
