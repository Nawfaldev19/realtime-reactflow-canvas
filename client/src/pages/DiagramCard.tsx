import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { Pencil, Play, Trash2 } from "lucide-react";
import { DELETE_DIAGRAM, RENAME_DIAGRAM } from "../graphql/operations";
import type { DiagramsQuery } from "../graphql/generated/graphql";
import { describeError } from "../lib/errors";
import { formatDateTime } from "../lib/time";

export type DiagramSummary = DiagramsQuery["diagrams"][number];

type Mode = "view" | "rename" | "delete";

export function DiagramCard({ diagram, onDeleted }: { diagram: DiagramSummary; onDeleted: () => void }) {
  const [mode, setMode] = useState<Mode>("view");
  const [title, setTitle] = useState(diagram.title);
  const [message, setMessage] = useState<string | null>(null);
  const [rename, renameState] = useMutation(RENAME_DIAGRAM);
  const [remove, removeState] = useMutation(DELETE_DIAGRAM);
  const inputId = `rename-${diagram.id}`;

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      const { data } = await rename({ variables: { id: diagram.id, title } });
      if (data?.renameDiagram.diagram) setMode("view");
      else setMessage(data?.renameDiagram.errors[0]?.message ?? "Rename failed");
    } catch (error) {
      setMessage(describeError(error));
    }
  };

  const confirmDelete = async () => {
    setMessage(null);
    try {
      await remove({ variables: { id: diagram.id } });
      onDeleted();
    } catch (error) {
      setMessage(describeError(error));
    }
  };

  return (
    <li className="card diagram-card">
      {mode === "rename" ? (
        <form className="form-stack" onSubmit={(event) => void submitRename(event)}>
          <div className="field">
            <label htmlFor={inputId}>Title</label>
            <input
              id={inputId}
              className="input"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>
          <div className="row">
            <button type="submit" className="button button-primary" disabled={renameState.loading}>
              Save title
            </button>
            <button type="button" className="button button-ghost" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <h3 id={`diagram-${diagram.id}-title`}>
          <Link to={`/app/d/${diagram.id}`}>{diagram.title}</Link>
        </h3>
      )}
      <p className="meta">
        {diagram.nodeCount} nodes · {diagram.edgeCount} connectors
      </p>
      <p className="meta">
        Updated {formatDateTime(diagram.updatedAt)}
        {diagram.updatedBy && ` by ${diagram.updatedBy.name}`}
      </p>
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
      {mode === "view" && (
        <div className="row">
          {/* Named "Preview" and described by the title, so the title link stays the only link named after the diagram. */}
          <Link
            to={`/app/d/${diagram.id}/preview`}
            className="button button-ghost"
            aria-describedby={`diagram-${diagram.id}-title`}
          >
            <Play size={16} aria-hidden="true" /> Preview
          </Link>
          {diagram.canEdit && (
            <>
              <button type="button" className="button button-ghost" onClick={() => setMode("rename")}>
                <Pencil size={16} aria-hidden="true" /> Rename<span className="visually-hidden"> {diagram.title}</span>
              </button>
              <button type="button" className="button button-ghost" onClick={() => setMode("delete")}>
                <Trash2 size={16} aria-hidden="true" /> Delete<span className="visually-hidden"> {diagram.title}</span>
              </button>
            </>
          )}
        </div>
      )}
      {mode === "delete" && (
        <div className="row" role="group" aria-label={`Confirm deleting ${diagram.title}`}>
          <span>Delete this diagram and its history?</span>
          <button
            type="button"
            className="button button-danger"
            disabled={removeState.loading}
            onClick={() => void confirmDelete()}
          >
            Delete
          </button>
          <button type="button" className="button button-ghost" onClick={() => setMode("view")}>
            Keep it
          </button>
        </div>
      )}
    </li>
  );
}
