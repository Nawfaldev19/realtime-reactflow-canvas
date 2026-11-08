import { useEffect, useRef, useState, type FocusEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { ChevronDown, Loader2, Network } from "lucide-react";
import { LAYOUT_DIRECTIONS, type LayoutDirection, type LayoutEngineName } from "../document/types";
import { layoutTreeOf } from "../layout/documentLayout";
import { LatestOnly, STALE, computeLayout, createLayeredClient } from "../layout/runner";
import { DEFAULT_LAYOUT_OPTIONS } from "../layout/types";
import { prefersReducedMotion } from "../lib/motion";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";
import { playTravels, travels } from "./layoutAnimation";
import type { EditorStoreApi } from "./store";

// The canvas toolbar's Layout menu: an engine (dagre, or our own layered
// layout in a worker), a direction, and "Manual" to go back to the author's
// arrangement. Picking an option lays out at once. A spinner appears when a
// layout takes longer than 200 ms; picking again while one runs drops the
// older result. Steps glide to their new places, then the view fits them.

const DIRECTION_LABELS: Readonly<Record<LayoutDirection, string>> = { TB: "Top → bottom", LR: "Left → right" };
const ENGINES: readonly { engine: LayoutEngineName; label: string; hint: string }[] = [
  { engine: "dagre", label: "Fast", hint: "dagre, on the main thread" },
  { engine: "layered", label: "Layered", hint: "our layered layout, in a worker" },
];
const SPINNER_DELAY = 200;

const layered = createLayeredClient(
  typeof Worker === "undefined"
    ? null
    : () => new Worker(new URL("../layout/layered.worker.ts", import.meta.url), { type: "module" }),
);

/** Lays out, restores and animates; one instance per editor. */
function useLayoutActions(api: EditorStoreApi) {
  const { fitView } = useReactFlow();
  const [runner] = useState(() => new LatestOnly());
  const [failed, setFailed] = useState(false);
  const stop = useRef<() => void>(() => undefined);

  useEffect(
    () => () => {
      runner.cancel();
      stop.current();
    },
    [runner],
  );

  const animate = (before: ReturnType<EditorStoreApi["getState"]>["doc"], fit: boolean) => {
    stop.current();
    const after = api.getState().doc;
    const finish = () => {
      if (fit) void fitView({ padding: 0.2, duration: prefersReducedMotion() ? 0 : 500 });
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    stop.current = playTravels(travels(before, after), (entries) => api.getState().setLive(entries), finish);
  };

  const run = async (engine: LayoutEngineName, direction: LayoutDirection) => {
    const timer = setTimeout(() => api.getState().setLayoutBusy(true), SPINNER_DELAY);
    const tree = layoutTreeOf(api.getState().doc);
    setFailed(false);
    let result: Awaited<ReturnType<typeof computeLayout>> | typeof STALE;
    try {
      result = await runner.run(() => computeLayout(tree, engine, { direction, ...DEFAULT_LAYOUT_OPTIONS }, layered));
    } catch {
      api.getState().setLayoutBusy(false);
      setFailed(true);
      return;
    } finally {
      clearTimeout(timer);
    }
    // A stale result leaves the spinner to the newer run.
    if (result === STALE) return;
    api.getState().setLayoutBusy(false);
    const before = api.getState().doc;
    if (api.getState().applyLayout(result, engine, direction)) animate(before, true);
  };

  const restore = () => {
    runner.cancel();
    const before = api.getState().doc;
    if (api.getState().restoreManualLayout()) animate(before, false);
  };

  return { run, restore, failed };
}

export function LayoutMenu() {
  const api = useEditorStoreApi();
  const layout = useEditor((state) => state.doc.layout ?? null);
  const busy = useEditor((state) => state.layoutBusy);
  const [open, setOpen] = useState(false);
  const { run, restore, failed } = useLayoutActions(api);
  const engine = layout?.engine ?? null;
  const direction = layout?.direction ?? "TB";

  const closeOnLeave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <div className="menu-anchor" onBlur={closeOnLeave}>
      <button
        type="button"
        className="button button-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {busy ? <Loader2 size={16} aria-hidden="true" className="spin" /> : <Network size={16} aria-hidden="true" />}{" "}
        Layout
        {busy && <span className="visually-hidden">(arranging)</span>}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="menu layout-menu"
          role="dialog"
          aria-label="Layout"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <div className="layout-menu__row" role="group" aria-label="Layout engine">
            {ENGINES.map((option) => (
              <button
                key={option.engine}
                type="button"
                className="button button-secondary button-small"
                aria-pressed={engine === option.engine}
                title={option.hint}
                onClick={() => void run(option.engine, direction)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="layout-menu__field">
            <span>Direction</span>
            <select
              className="input input-compact"
              value={direction}
              onChange={(event) => void run(engine ?? "dagre", event.target.value as LayoutDirection)}
            >
              {LAYOUT_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {DIRECTION_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-ghost button-small"
            aria-pressed={layout === null}
            disabled={layout === null}
            onClick={restore}
          >
            Manual — free positioning
          </button>
          <p className="field-hint">
            {layout === null ? "Your own arrangement." : "Manual restores your own arrangement and connector points."}
          </p>
          {failed && (
            <p className="field-error" role="alert">
              The layout could not be computed. Try the other engine.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
