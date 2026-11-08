import { useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { DiagramCanvas } from "../editor/Canvas";
import { EditorStoreProvider } from "../editor/EditorStoreContext";
import { createEditorStore } from "../editor/store";
import { disabledTechniques, perfFlags, perfSearch, TECHNIQUE_LABELS, TECHNIQUES, type PerfFlags } from "../perf/flags";
import { startCounting, stopCounting } from "../perf/renderCounts";
import { stressAvailable, stressSize } from "../stress/access";
import { generateStressDiagram, STRESS_SIZES, type StressDiagram } from "../stress/generate";
import { finishInitialRender, installProbe, START_MARK } from "../stress/probe";
import { NotFoundPage } from "./NotFoundPage";
import "@xyflow/react/dist/style.css";

// The stress page: a generated diagram of 500, 1,000 or 2,000 nodes in
// the real editor canvas, without a server. The header switches the size and
// each rendering technique (both reload the page, since the switches are read
// at load). The benchmark drives this page; see docs/features/performance.md.

/** Opens at 100% near the top-left corner, the zoom people edit at. */
const STRESS_VIEW = { openingView: { mode: "saved", customPercent: 100, savedViewport: { x: 40, y: 40, zoom: 1 } } };

const fmt = (value: number) => value.toLocaleString("en-US");

function linkTo(size: number, flags: PerfFlags): string {
  return `/stress${perfSearch(flags, `stress&size=${String(size)}`)}`;
}

function StressHeader({
  diagram,
  size,
  initialRenderMs,
}: {
  diagram: StressDiagram;
  size: number;
  initialRenderMs: number | null;
}) {
  const off = disabledTechniques(perfFlags);
  return (
    <header className="stress-header">
      <h1 className="stress-header__title">Stress test</h1>
      <p className="stress-header__stats" aria-live="polite">
        {fmt(diagram.counts.nodes)} nodes, {fmt(diagram.counts.edges)} connectors, {fmt(diagram.counts.groups)} groups
        {initialRenderMs !== null && ` · first render ${initialRenderMs.toFixed(0)} ms`}
      </p>
      <nav aria-label="Diagram size" className="stress-header__group">
        {STRESS_SIZES.map((option) => (
          <a
            key={option}
            className="button button-ghost button-small"
            href={linkTo(option, perfFlags)}
            aria-current={option === size ? "page" : undefined}
          >
            {fmt(option)}
          </a>
        ))}
      </nav>
      <nav aria-label="Rendering techniques" className="stress-header__group">
        {TECHNIQUES.map((technique) => {
          const on = perfFlags[technique];
          return (
            <a
              key={technique}
              className="button button-ghost button-small"
              href={linkTo(size, { ...perfFlags, [technique]: !on })}
              data-technique={technique}
              data-on={on}
            >
              {TECHNIQUE_LABELS[technique]}: {on ? "on" : "off"}
            </a>
          );
        })}
      </nav>
      {off.length > 0 && (
        <p className="stress-header__warning">
          Measuring with {off.length} technique{off.length === 1 ? "" : "s"} switched off.
        </p>
      )}
    </header>
  );
}

function StressSession() {
  const [size] = useState(() => stressSize(window.location.search));
  const [diagram] = useState(() => generateStressDiagram(size));
  const [store] = useState(() => {
    const api = createEditorStore();
    performance.mark(START_MARK);
    api.getState().load({
      id: "stress",
      title: `Stress test, ${String(size)} nodes`,
      revision: 0,
      document: diagram.document,
      canEdit: true,
      viewSettings: STRESS_VIEW,
    });
    return api;
  });
  const [initialRenderMs, setInitialRenderMs] = useState<number | null>(null);
  const page = useRef<HTMLDivElement>(null);

  // Ready: the opening view is applied and nodes are on screen; the next frame ends the measurement.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      const root = page.current;
      const opened = root?.querySelector(".editor-canvas:not(.canvas--opening) .react-flow__node");
      frame = requestAnimationFrame(
        opened ? () => setInitialRenderMs((current) => current ?? finishInitialRender()) : check,
      );
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    startCounting();
    return stopCounting;
  }, []);

  useEffect(() => {
    installProbe(store, diagram, size, perfFlags, initialRenderMs);
  }, [store, diagram, size, initialRenderMs]);

  return (
    <div className="stress" ref={page}>
      <StressHeader diagram={diagram} size={size} initialRenderMs={initialRenderMs} />
      <EditorStoreProvider store={store}>
        <ReactFlowProvider>
          <div className="editor-body">
            <DiagramCanvas />
          </div>
        </ReactFlowProvider>
      </EditorStoreProvider>
    </div>
  );
}

export function StressPage() {
  if (!stressAvailable(import.meta.env.DEV, window.location.search)) return <NotFoundPage />;
  return <StressSession />;
}
