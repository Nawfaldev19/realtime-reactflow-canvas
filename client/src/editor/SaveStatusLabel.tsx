import { useEffect, useState } from "react";
import { Check, CloudOff, Eye, Loader2, TriangleAlert } from "lucide-react";
import type { SaveStatus } from "../persistence/autosave";
import { useEditor } from "./EditorStoreContext";

export function savedAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export function describeStatus(status: SaveStatus, now: number): string {
  switch (status.kind) {
    case "idle":
      return "All changes saved";
    case "pending":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "saved":
      return `Saved · ${savedAgo(status.at, now)}`;
    case "retrying":
      return "Offline – will retry";
    case "syncing":
      return "Syncing…";
    case "offline":
      return "Offline – changes queued";
    case "failed":
    case "conflict":
      return "Not saved";
  }
}

function StatusIcon({ status }: { status: SaveStatus }) {
  switch (status.kind) {
    case "saving":
    case "syncing":
      return <Loader2 size={16} aria-hidden="true" className="spin" />;
    case "retrying":
    case "offline":
      return <CloudOff size={16} aria-hidden="true" />;
    case "failed":
    case "conflict":
      return <TriangleAlert size={16} aria-hidden="true" />;
    default:
      return <Check size={16} aria-hidden="true" />;
  }
}

export function SaveStatusLabel() {
  const status = useEditor((state) => state.saveStatus);
  const canEdit = useEditor((state) => state.canEdit);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status.kind !== "saved") return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, [status]);

  if (!canEdit) {
    return (
      <span className="badge">
        <Eye size={14} aria-hidden="true" /> Read-only
      </span>
    );
  }
  return (
    <span className={`save-status save-status--${status.kind}`} role="status" aria-live="polite">
      <StatusIcon status={status} />
      {describeStatus(status, now)}
    </span>
  );
}
