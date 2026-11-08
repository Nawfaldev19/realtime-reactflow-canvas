import { useState, type FormEvent } from "react";
import { useMutation } from "@apollo/client";
import { Pencil } from "lucide-react";
import { RENAME_DIAGRAM } from "../graphql/operations";
import { describeError } from "../lib/errors";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";

export function DiagramTitle() {
  const api = useEditorStoreApi();
  const title = useEditor((state) => state.title);
  const canEdit = useEditor((state) => state.canEdit);
  const diagramId = useEditor((state) => state.diagramId);
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rename, { loading }] = useMutation(RENAME_DIAGRAM);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft === null || diagramId === null) return;
    setMessage(null);
    try {
      const { data } = await rename({ variables: { id: diagramId, title: draft } });
      const result = data?.renameDiagram;
      if (result?.diagram) {
        api.getState().setTitle(result.diagram.title);
        setDraft(null);
      } else {
        setMessage(result?.errors[0]?.message ?? "Rename failed");
      }
    } catch (error) {
      setMessage(describeError(error));
    }
  };

  if (draft === null) {
    return (
      <div className="diagram-title">
        <h1>{title}</h1>
        {canEdit && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setDraft(title)}
            aria-label="Rename diagram"
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }
  return (
    <form className="diagram-title" onSubmit={(event) => void submit(event)}>
      <label className="visually-hidden" htmlFor="diagram-title-input">
        Diagram title
      </label>
      <input
        id="diagram-title-input"
        className="input"
        value={draft}
        maxLength={120}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDraft(null);
        }}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? "diagram-title-error" : undefined}
        autoFocus
      />
      <button type="submit" className="button button-primary" disabled={loading}>
        Save
      </button>
      <button type="button" className="button button-ghost" onClick={() => setDraft(null)}>
        Cancel
      </button>
      {message && (
        <p id="diagram-title-error" className="field-error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
