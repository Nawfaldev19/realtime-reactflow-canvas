import { useMemo, useState, type FocusEvent } from "react";
import { useStoreApi } from "@xyflow/react";
import { ChevronDown, Download } from "lucide-react";
import { useEditor, useEditorStoreApi } from "../editor/EditorStoreContext";
import { describeError } from "../lib/errors";
import { download, ExportError, exportPdf, exportPng } from "./capture";
import { PAPERS, type Orientation, type Paper } from "./pagination";
import { fileName, planPdf } from "./plan";

// Export as PNG (the whole diagram, one image) or PDF (paged, with breaks
// that avoid cutting through steps, and "Page n of N" that matches the file:
// the count shown here comes from the same plan the PDF is built from).

type Format = "png" | "pdf";

/** Resolves after `count` animation frames, so React has committed and the browser has laid out the change. */
const afterFrames = (count: number): Promise<void> =>
  new Promise((resolve) => {
    const tick = (left: number) => {
      if (left === 0) resolve();
      else requestAnimationFrame(() => tick(left - 1));
    };
    tick(count);
  });

const QUALITIES = [1, 2, 3, 4] as const;

interface ExportButtonProps {
  /** Runs before capturing (the preview finishes its reveal animation: exports never animate). */
  readonly beforeCapture?: () => void;
}

export function ExportButton({ beforeCapture }: ExportButtonProps) {
  const api = useEditorStoreApi();
  const canvas = useStoreApi();
  const doc = useEditor((state) => state.doc);
  const empty = useEditor((state) => Object.keys(state.doc.nodes).length === 0);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("pdf");
  const [paper, setPaper] = useState<Paper>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [quality, setQuality] = useState(2);
  const [pageNumbers, setPageNumbers] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pages = useMemo(
    () => (open && format === "pdf" ? (planPdf(doc, paper, orientation)?.slices.length ?? 0) : 0),
    [open, format, doc, paper, orientation],
  );

  const closeOnLeave = (event: FocusEvent<HTMLDivElement>) => {
    if (progress === null && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  const run = async () => {
    setError(null);
    beforeCapture?.();
    const { doc: current, title } = api.getState();
    const root = canvas.getState().domNode;
    try {
      // Off-screen steps are not mounted on large diagrams; the capture reads the DOM, so everything is mounted first.
      api.getState().setRenderAll(true);
      await afterFrames(2);
      if (format === "png") {
        setProgress("Exporting the image…");
        download(await exportPng({ root, doc: current, quality }), fileName(title, "png"));
      } else {
        const blob = await exportPdf({
          root,
          doc: current,
          quality,
          title,
          paper,
          orientation,
          pageNumbers,
          onProgress: (page, total) => setProgress(`Exporting page ${String(page)} of ${String(total)}…`),
        });
        download(blob, fileName(title, "pdf"));
      }
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof ExportError ? failure.message : describeError(failure));
    } finally {
      api.getState().setRenderAll(false);
      setProgress(null);
    }
  };

  return (
    <div
      className="menu-anchor"
      onBlur={closeOnLeave}
      onKeyDown={(event) => {
        if (event.key === "Escape" && progress === null) setOpen(false);
      }}
    >
      <button
        type="button"
        className="button button-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={empty}
        onClick={() => setOpen((value) => !value)}
      >
        <Download size={16} aria-hidden="true" /> Export <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu layout-menu export-menu" role="dialog" aria-label="Export">
          <fieldset className="view-menu__modes">
            <legend>Format</legend>
            <label className="view-menu__mode">
              <input type="radio" name="export-format" checked={format === "pdf"} onChange={() => setFormat("pdf")} />{" "}
              PDF, in pages
            </label>
            <label className="view-menu__mode">
              <input type="radio" name="export-format" checked={format === "png"} onChange={() => setFormat("png")} />{" "}
              PNG image
            </label>
          </fieldset>
          {format === "pdf" && (
            <>
              <label className="layout-menu__field">
                <span>Paper</span>
                <select
                  className="input input-compact"
                  value={paper}
                  onChange={(event) => setPaper(event.target.value as Paper)}
                >
                  {(Object.keys(PAPERS) as Paper[]).map((key) => (
                    <option key={key} value={key}>
                      {PAPERS[key].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="layout-menu__field">
                <span>Orientation</span>
                <select
                  className="input input-compact"
                  value={orientation}
                  onChange={(event) => setOrientation(event.target.value as Orientation)}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              <label className="prop-check">
                <input
                  type="checkbox"
                  checked={pageNumbers}
                  onChange={(event) => setPageNumbers(event.target.checked)}
                />{" "}
                Show page numbers
              </label>
            </>
          )}
          <label className="layout-menu__field">
            <span>Quality</span>
            <select
              className="input input-compact"
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
            >
              {QUALITIES.map((value) => (
                <option key={value} value={value}>
                  {value}× resolution
                </option>
              ))}
            </select>
          </label>
          {format === "pdf" && (
            <p className="field-hint" data-testid="export-page-count">
              {pages === 1 ? "1 page" : `${String(pages)} pages`}, breaking between steps.
            </p>
          )}
          <button
            type="button"
            className="button button-primary"
            disabled={progress !== null}
            onClick={() => void run()}
          >
            <Download size={16} aria-hidden="true" /> Export {format.toUpperCase()}
          </button>
          <p className="field-hint" role="status">
            {progress}
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
