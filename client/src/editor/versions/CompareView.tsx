import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@apollo/client";
import { ArrowLeftRight, Columns2, Layers, X } from "lucide-react";
import { parseDocument } from "../../document/serialize";
import type { DocumentState } from "../../document/types";
import { VERSION_DOCUMENTS } from "../../graphql/operations";
import { describeError } from "../../lib/errors";
import { diffDocuments, type ChangeKind, type EntityDiff } from "../../versions/diff";
import { ALL_FILTERS, HIGHLIGHT_LABELS, type CompareFilters } from "../../versions/highlight";
import { overlayView } from "../../versions/overlay";
import { useEditor } from "../EditorStoreContext";
import { CompareCanvas, type SharedViewport } from "./CompareCanvas";
import { CURRENT, versionTitle, type VersionSummary } from "./versionList";

// Compare two versions (or a version and the current diagram). Steps and
// connectors are matched by stable key (versions/diff.ts) and highlighted as
// added, removed or changed, either in one overlay drawing (the newer version
// plus what was removed, drawn where it was) or side by side with the views
// kept in step. Filters switch each kind of highlight on and off; clicking a
// highlighted step lists what changed. Escape closes.

type Mode = "overlay" | "side";

interface CompareViewProps {
  readonly versions: readonly VersionSummary[];
  /** The older side: a version id. */
  readonly initialFrom: string;
  readonly onClose: () => void;
}

const KINDS: readonly ChangeKind[] = ["added", "removed", "changed"];

function DiffCard({ entry, onClose }: { entry: EntityDiff; onClose: () => void }) {
  const heading = entry.status === "unchanged" ? "No changes" : HIGHLIGHT_LABELS[entry.status];
  return (
    <aside className="diff-card" aria-label="What changed">
      <div className="diff-card__head">
        <strong>{heading}</strong>
        <button
          type="button"
          className="button button-ghost button-icon"
          aria-label="Close the change details"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {entry.status === "changed" ? (
        <ul>
          {entry.changes.map((change) => (
            <li key={change.field}>{change.description}</li>
          ))}
        </ul>
      ) : (
        <p>
          {entry.status === "added"
            ? "Only in the newer version."
            : entry.status === "removed"
              ? "Only in the older version."
              : "The same in both versions."}
        </p>
      )}
    </aside>
  );
}

export function CompareView({ versions, initialFrom, onClose }: CompareViewProps) {
  const current = useEditor((state) => state.doc);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(CURRENT);
  const [mode, setMode] = useState<Mode>("overlay");
  const [filters, setFilters] = useState<CompareFilters>(ALL_FILTERS);
  const [picked, setPicked] = useState<string | null>(null);
  const [shared, setShared] = useState<SharedViewport | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const ids = [from, to].filter((id) => id !== CURRENT);
  const { data, error } = useQuery(VERSION_DOCUMENTS, { variables: { ids } });

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  const documents = useMemo(() => {
    const byId = new Map<string, DocumentState>(
      (data?.versions ?? []).map((version) => [version.id, parseDocument(version.document).state]),
    );
    const pick = (id: string) => (id === CURRENT ? current : byId.get(id));
    return { older: pick(from), newer: pick(to) };
  }, [data, current, from, to]);
  const { older, newer } = documents;
  const diff = useMemo(() => (older && newer ? diffDocuments(older, newer) : null), [older, newer]);
  const overlay = useMemo(
    () => (older && newer && diff ? overlayView(older, newer, diff) : null),
    [older, newer, diff],
  );

  const titleOf = (id: string) => {
    const version = versions.find((candidate) => candidate.id === id);
    return id === CURRENT || !version ? "Current diagram" : versionTitle(version);
  };
  const choose = (nextFrom: string, nextTo: string) => {
    setPicked(null);
    setShared(null);
    setFrom(nextFrom);
    setTo(nextTo);
  };
  const options = (exclude: string) =>
    [
      { id: CURRENT, title: "Current diagram" },
      ...versions.map((version) => ({ id: version.id, title: versionTitle(version) })),
    ]
      .filter((option) => option.id !== exclude)
      .map((option) => (
        <option key={option.id} value={option.id}>
          {option.title}
        </option>
      ));
  const entryOf = (id: string | null): EntityDiff | undefined => {
    if (id === null || !diff || !overlay) return undefined;
    return (
      overlay.entries[id] ??
      [...diff.nodes, ...diff.edges].find((entry) => entry.olderId === id || entry.newerId === id)
    );
  };
  const pickedEntry = entryOf(picked);
  const counts = diff?.counts;

  return (
    <div
      ref={dialog}
      className="compare"
      role="dialog"
      aria-modal="true"
      aria-label="Compare versions"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="compare__bar">
        <h2 className="compare__title">Compare versions</h2>
        <label className="compare__picker">
          <span>From</span>
          <select className="input input-compact" value={from} onChange={(event) => choose(event.target.value, to)}>
            {options(to)}
          </select>
        </label>
        <button
          type="button"
          className="button button-ghost button-icon"
          aria-label="Swap the two sides"
          onClick={() => choose(to, from)}
        >
          <ArrowLeftRight size={16} aria-hidden="true" />
        </button>
        <label className="compare__picker">
          <span>To</span>
          <select className="input input-compact" value={to} onChange={(event) => choose(from, event.target.value)}>
            {options(from)}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Layout">
          <button
            type="button"
            className="button button-secondary"
            aria-pressed={mode === "overlay"}
            onClick={() => setMode("overlay")}
          >
            <Layers size={16} aria-hidden="true" /> Overlay
          </button>
          <button
            type="button"
            className="button button-secondary"
            aria-pressed={mode === "side"}
            onClick={() => setMode("side")}
          >
            <Columns2 size={16} aria-hidden="true" /> Side by side
          </button>
        </div>
        <div className="compare__filters" role="group" aria-label="Show">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`button button-secondary diff-filter diff-filter--${kind}`}
              aria-pressed={filters[kind]}
              onClick={() => setFilters((value) => ({ ...value, [kind]: !value[kind] }))}
            >
              {HIGHLIGHT_LABELS[kind]} ({counts ? counts.nodes[kind] : 0})
            </button>
          ))}
        </div>
        <button
          type="button"
          className="button button-ghost button-icon compare__close"
          aria-label="Close compare"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <p className="compare__summary" role="status">
        {error
          ? `The versions could not be loaded: ${describeError(error)}`
          : !diff || !counts
            ? "Loading the versions…"
            : diff.identical
              ? "No differences"
              : `Connectors: ${String(counts.edges.added)} added, ${String(counts.edges.removed)} removed, ` +
                `${String(counts.edges.changed)} changed${diff.layout ? `. ${diff.layout.description}` : ""}`}
      </p>
      {diff && older && newer && overlay && (
        <div className={`compare__body compare__body--${mode}`}>
          {mode === "overlay" ? (
            <CompareCanvas
              key={`overlay:${from}:${to}`}
              label={`${titleOf(to)}, with changes since ${titleOf(from)}`}
              doc={overlay.doc}
              nodeStatus={overlay.nodes}
              edgeStatus={overlay.edges}
              filters={filters}
              picked={picked}
              onPick={setPicked}
            />
          ) : (
            <>
              <CompareCanvas
                key={`older:${from}`}
                label={titleOf(from)}
                doc={older}
                nodeStatus={diff.older.nodes}
                edgeStatus={diff.older.edges}
                filters={filters}
                picked={picked}
                onPick={setPicked}
                shared={shared}
                onShare={setShared}
              />
              <CompareCanvas
                key={`newer:${to}`}
                label={titleOf(to)}
                doc={newer}
                nodeStatus={diff.newer.nodes}
                edgeStatus={diff.newer.edges}
                filters={filters}
                picked={picked}
                onPick={setPicked}
                shared={shared}
                onShare={setShared}
              />
            </>
          )}
          {pickedEntry && <DiffCard entry={pickedEntry} onClose={() => setPicked(null)} />}
        </div>
      )}
      <ul className="compare__legend" aria-label="Legend">
        {KINDS.map((kind) => (
          <li key={kind} className={`compare__legend-item diff-swatch--${kind}`}>
            {HIGHLIGHT_LABELS[kind]}
          </li>
        ))}
        <li className="compare__legend-item diff-swatch--plain">Unchanged</li>
      </ul>
    </div>
  );
}
