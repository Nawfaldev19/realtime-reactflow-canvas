import { useEffect, useState, type FocusEvent } from "react";
import { ChevronDown, Eye } from "lucide-react";
import { useEditor, useEditorStoreApi } from "../editor/EditorStoreContext";
import { clampPercent, CUSTOM_PERCENT, storableViewport } from "../viewport/settings";
import { zoomPercent, type OpeningMode, type OpeningView } from "../viewport/viewport";
import { useViewActions } from "./useViewActions";

// The author's view settings: how the diagram opens for everyone (fit width,
// fit the whole diagram, a custom zoom, or a saved view) and whether it
// builds up with the reveal animation in the preview. Choosing an option
// applies it to the editor canvas at once; everything is saved 500 ms after
// the last change.

const MODES: readonly { readonly mode: OpeningMode; readonly label: string; readonly hint: string }[] = [
  { mode: "fitWidth", label: "Fit width", hint: "Readable from the top; scroll down for the rest" },
  { mode: "fitAll", label: "Fit whole diagram", hint: "Everything at once, at most 100%" },
  { mode: "custom", label: "Custom zoom", hint: "A fixed zoom, centred, from the top" },
  { mode: "saved", label: "Saved view", hint: "Exactly the view you save" },
];

const STATUS_TEXT = {
  idle: "",
  saving: "Saving…",
  saved: "View settings saved",
  failed: "Could not save the view settings; they will be retried with the next change.",
} as const;

export function ViewMenu() {
  const api = useEditorStoreApi();
  const actions = useViewActions();
  const canEdit = useEditor((state) => state.canEdit);
  const settings = useEditor((state) => state.viewSettings);
  const status = useEditor((state) => state.viewSettingsStatus);
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState(String(settings.openingView.customPercent));
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const view = settings.openingView;

  useEffect(() => {
    setPercent(String(view.customPercent));
  }, [view.customPercent]);

  if (!canEdit) return null;

  const change = (next: OpeningView, duration?: number) => {
    api.getState().setViewSettings({ openingView: next });
    actions.showOpening(next, duration);
  };
  const saveCurrent = () => {
    const savedViewport = storableViewport(actions.current());
    api.getState().setViewSettings({ openingView: { ...view, mode: "saved", savedViewport } });
    setConfirmation(
      `Saved the current view (${String(zoomPercent(savedViewport.zoom))}%). The diagram opens exactly like this.`,
    );
  };
  const choose = (mode: OpeningMode) => {
    setConfirmation(null);
    // A saved view needs a viewport: choosing it without one saves the current view.
    if (mode === "saved" && !view.savedViewport) saveCurrent();
    else change({ ...view, mode });
  };
  const typed = (value: string) => {
    setPercent(value);
    const number = Number(value);
    // Live preview while typing; out-of-range values wait for blur.
    if (value !== "" && number >= CUSTOM_PERCENT.min && number <= CUSTOM_PERCENT.max)
      change({ ...view, mode: "custom", customPercent: Math.round(number) }, 0);
  };
  const commitPercent = () => {
    const customPercent = clampPercent(Number(percent));
    setPercent(String(customPercent));
    change({ ...view, mode: "custom", customPercent }, 0);
  };
  const closeOnLeave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <div
      className="menu-anchor"
      onBlur={closeOnLeave}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        className="button button-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Eye size={16} aria-hidden="true" /> View <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu layout-menu view-menu" role="dialog" aria-label="View settings">
          <fieldset className="view-menu__modes">
            <legend>Opening view</legend>
            {MODES.map(({ mode, label, hint }) => (
              <label key={mode} className="view-menu__mode">
                <input
                  type="radio"
                  name="opening-view"
                  value={mode}
                  checked={view.mode === mode}
                  onChange={() => choose(mode)}
                />
                <span>
                  {label}
                  <span className="field-hint">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {view.mode === "custom" && (
            <label className="layout-menu__field">
              <span>Zoom (%)</span>
              <input
                className="input input-compact"
                type="number"
                min={CUSTOM_PERCENT.min}
                max={CUSTOM_PERCENT.max}
                step={CUSTOM_PERCENT.step}
                value={percent}
                onChange={(event) => typed(event.target.value)}
                onBlur={commitPercent}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitPercent();
                }}
              />
            </label>
          )}
          {view.mode === "saved" && (
            <button type="button" className="button button-secondary button-small" onClick={saveCurrent}>
              Save current view
            </button>
          )}
          {confirmation && (
            <p className="field-hint" role="status">
              {confirmation}
            </p>
          )}
          <label className="prop-check">
            <input
              type="checkbox"
              checked={settings.animateOnOpen}
              onChange={(event) => api.getState().setViewSettings({ animateOnOpen: event.target.checked })}
            />
            Animate on open (build the diagram up step by step in the preview)
          </label>
          <p className="field-hint" aria-live="polite">
            {STATUS_TEXT[status]}
          </p>
        </div>
      )}
    </div>
  );
}
