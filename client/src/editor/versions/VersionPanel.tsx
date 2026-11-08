import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApolloError } from "@apollo/client";
import { Copy, GitCompareArrows, History, RefreshCw, RotateCcw, X } from "lucide-react";
import { describeError } from "../../lib/errors";
import { formatDateTime } from "../../lib/time";
import { useEditor } from "../EditorStoreContext";
import type { VersionHistory } from "./useVersionHistory";
import { versionTitle, type VersionSummary } from "./versionList";

// The version history panel: "Save version" with an optional label, the list
// of versions (newest first, with author and time, 20 at a time), and per
// version Compare, Restore and Make a copy. Viewers see the list and can
// compare; saving, restoring and copying are for owners and editors (the
// server checks the same). When someone else saves a version while the panel
// is open, a refresh button appears.

interface VersionPanelProps {
  readonly history: VersionHistory;
  readonly onCompare: (version: VersionSummary) => void;
  /** A manual version was saved: the periodic clock starts over. */
  readonly onSaved: () => void;
  readonly onClose: () => void;
}

type Notice = { readonly kind: "info" | "error"; readonly text: string } | null;

function RestoreConfirm({
  version,
  onConfirm,
  onCancel,
}: {
  version: VersionSummary;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirm.current?.focus();
  }, []);
  return (
    <div className="version__confirm" role="group" aria-label={`Restore v${String(version.number)}?`}>
      <p>
        The diagram will look like v{version.number}. The current diagram is kept as a version first, and you can undo
        the restore.
      </p>
      <div className="version__actions">
        <button ref={confirm} type="button" className="button button-primary button-small" onClick={onConfirm}>
          Restore v{version.number}
        </button>
        <button type="button" className="button button-secondary button-small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function VersionPanel({ history, onCompare, onSaved, onClose }: VersionPanelProps) {
  const canEdit = useEditor((state) => state.canEdit);
  const announced = useEditor((state) => state.announcedVersion);
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { versions, list } = history;
  const newest = versions[0]?.number ?? 0;

  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setNotice(null);
    try {
      const text = await task();
      if (text) setNotice({ kind: "info", text });
    } catch (failure) {
      setNotice({
        kind: "error",
        text: failure instanceof Error && !(failure instanceof ApolloError) ? failure.message : describeError(failure),
      });
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const outcome = await history.save(label.trim() || null);
      if (outcome.error) throw new Error(outcome.error);
      setLabel("");
      onSaved();
      return `Saved v${String(outcome.number)}`;
    });
  };

  const restore = (version: VersionSummary) => {
    setConfirming(null);
    void run(async () =>
      (await history.restore(version))
        ? `Restored v${String(version.number)}. Undo puts it back.`
        : `The diagram already looks like v${String(version.number)}.`,
    );
  };

  const copy = (version: VersionSummary) => {
    void run(async () => {
      void navigate(`/app/d/${await history.copy(version)}`);
      return null;
    });
  };

  return (
    <aside className="properties version-panel" aria-label="Version history">
      <div className="version-panel__head">
        <h2 className="properties__title">
          <History size={18} aria-hidden="true" /> Versions
        </h2>
        <button
          type="button"
          className="button button-ghost button-icon"
          aria-label="Close version history"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {canEdit && (
        <form className="version-panel__save" onSubmit={save}>
          <label className="prop-field">
            <span>Label (optional)</span>
            <input
              className="input input-compact"
              value={label}
              maxLength={80}
              placeholder="Legs glued"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <button type="submit" className="button button-primary" disabled={busy}>
            Save version
          </button>
        </form>
      )}
      <div
        role="status"
        className={`version-panel__notice${notice?.kind === "error" ? " version-panel__notice--error" : ""}`}
      >
        {notice?.text}
      </div>
      {announced > newest && versions.length > 0 && (
        <button type="button" className="button button-secondary button-small" onClick={() => void history.refresh()}>
          <RefreshCw size={14} aria-hidden="true" /> New versions saved · Refresh
        </button>
      )}
      {list.error ? (
        <p className="version-panel__notice--error">The versions could not be loaded. {describeError(list.error)}</p>
      ) : versions.length === 0 ? (
        <p className="properties__empty">{list.loading ? "Loading versions…" : "No versions yet."}</p>
      ) : (
        <ol className="version-list" aria-label="Versions">
          {versions.map((version) => (
            <li key={version.id} className="version" aria-label={versionTitle(version)}>
              <div className="version__title">{versionTitle(version)}</div>
              <div className="version__meta">
                {version.author.name} · <time dateTime={version.createdAt}>{formatDateTime(version.createdAt)}</time>
              </div>
              {confirming === version.id ? (
                <RestoreConfirm
                  version={version}
                  onConfirm={() => restore(version)}
                  onCancel={() => setConfirming(null)}
                />
              ) : (
                <div className="version__actions">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    aria-label={`Compare v${String(version.number)}`}
                    onClick={() => onCompare(version)}
                  >
                    <GitCompareArrows size={14} aria-hidden="true" /> Compare
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        aria-label={`Restore v${String(version.number)}`}
                        disabled={busy}
                        onClick={() => setConfirming(version.id)}
                      >
                        <RotateCcw size={14} aria-hidden="true" /> Restore
                      </button>
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        aria-label={`Make a copy of v${String(version.number)}`}
                        disabled={busy}
                        onClick={() => copy(version)}
                      >
                        <Copy size={14} aria-hidden="true" /> Copy
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {history.hasNextPage && (
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={list.loading}
          onClick={() => void history.loadMore()}
        >
          Load more ({versions.length} of {history.totalCount})
        </button>
      )}
      <p className="version-panel__hint">
        A version is also saved automatically after every 10 minutes of editing, when something changed.
      </p>
    </aside>
  );
}
