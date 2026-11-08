import { Download, GitMerge, RefreshCw, TriangleAlert, Users, X } from "lucide-react";
import { serializeDocument } from "../document/serialize";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";

interface Props {
  onRetry: () => void;
  onLoadLatest: () => void;
}

function downloadCopy(title: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.trim() || "diagram"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Merge notices after a revision conflict, and the blocking save problems. */
export function EditorBanners({ onRetry, onLoadLatest }: Props) {
  const api = useEditorStoreApi();
  const notice = useEditor((state) => state.mergeNotice);
  const status = useEditor((state) => state.saveStatus);
  const collabNotice = useEditor((state) => state.collabNotice);

  return (
    <>
      {collabNotice && (
        <div className={`banner ${collabNotice.kind === "refused" ? "banner-error" : "banner-info"}`} role="status">
          {collabNotice.kind === "refused" ? (
            <TriangleAlert size={18} aria-hidden="true" />
          ) : (
            <Users size={18} aria-hidden="true" />
          )}
          <p>
            {collabNotice.message}
            {collabNotice.kind === "off" && ". Changes are now saved automatically, one editor at a time."}
          </p>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => api.getState().setCollabNotice(null)}
            aria-label="Dismiss"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {notice && (
        <div className="banner banner-info" role="status">
          <GitMerge size={18} aria-hidden="true" />
          <p>
            {notice.updatedBy ?? "Someone"} saved changes to this diagram while you were editing. Your changes were
            merged on top.
            {notice.dropped > 0 &&
              ` ${notice.dropped} of your changes could not be applied because those items were removed.`}
          </p>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => api.getState().dismissMergeNotice()}
            aria-label="Dismiss"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {status.kind === "conflict" && (
        <div className="banner banner-error" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <p>This diagram keeps changing elsewhere, so your latest changes are not saved.</p>
          <button type="button" className="button button-secondary" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" /> Try again
          </button>
          <button type="button" className="button button-danger" onClick={onLoadLatest}>
            Discard mine and load the latest
          </button>
        </div>
      )}
      {status.kind === "failed" && (
        <div className="banner banner-error" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <p>{status.message}</p>
          <button type="button" className="button button-secondary" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" /> Retry now
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => {
              const { title, doc } = api.getState();
              downloadCopy(title, JSON.stringify(serializeDocument(doc), null, 2));
            }}
          >
            <Download size={16} aria-hidden="true" /> Download a copy
          </button>
        </div>
      )}
    </>
  );
}
