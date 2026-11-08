import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { Plus } from "lucide-react";
import { EmptyState, ErrorState, LoadingCards } from "../components/States";
import { useSignedIn } from "../components/workspace";
import { CREATE_DIAGRAM, DIAGRAMS, SET_WORKSPACE_NAVIGATION_MODE } from "../graphql/operations";
import type { NavigationModeEnum } from "../graphql/generated/graphql";
import { describeError } from "../lib/errors";
import { useSession } from "../lib/session";
import { DiagramCard } from "./DiagramCard";

export function DiagramListPage() {
  const { workspaceId = "" } = useParams();
  const { workspaces } = useSignedIn();
  const { rememberWorkspace } = useSession();
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  const { data, error, refetch } = useQuery(DIAGRAMS, { variables: { workspaceId }, skip: !workspace });
  const [create, { loading: creating }] = useMutation(CREATE_DIAGRAM);
  const [setDefaultMode] = useMutation(SET_WORKSPACE_NAVIGATION_MODE);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (workspace) rememberWorkspace(workspace.id);
  }, [workspace, rememberWorkspace]);

  if (!workspace) return <EmptyState title="Workspace not found">You are not a member of that workspace.</EmptyState>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      const { data: result } = await create({ variables: { workspaceId, title } });
      const created = result?.createDiagram.diagram;
      if (created) void navigate(`/app/d/${created.id}`);
      else setMessage(result?.createDiagram.errors[0]?.message ?? "Could not create the diagram");
    } catch (failure) {
      setMessage(describeError(failure));
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{workspace.name}</h1>
          <p>
            Build plans in this makerspace.{" "}
            {workspace.canEdit ? "Open one to edit it." : "You can open them read-only."}
          </p>
          {workspace.role === "OWNER" && (
            <label className="toolbar-select workspace-navigation">
              <span>Default navigation for members</span>
              <select
                className="input input-compact"
                value={workspace.navigationMode}
                onChange={(event) => {
                  const mode = event.target.value as NavigationModeEnum;
                  void setDefaultMode({
                    variables: { workspaceId, mode },
                    optimisticResponse: {
                      setWorkspaceNavigationMode: {
                        __typename: "SetWorkspaceNavigationModePayload",
                        workspace: { __typename: "Workspace", id: workspaceId, navigationMode: mode },
                        errors: [],
                      },
                    },
                  }).catch((failure: unknown) => setMessage(describeError(failure)));
                }}
              >
                <option value="PAN">Pan: the wheel zooms, dragging pans</option>
                <option value="SCROLL">Scroll: the wheel scrolls like a document</option>
              </select>
            </label>
          )}
        </div>
        {workspace.canEdit && (
          <form className="create-form" onSubmit={(event) => void submit(event)}>
            <label className="visually-hidden" htmlFor="new-diagram-title">
              New diagram title
            </label>
            <input
              id="new-diagram-title"
              className="input"
              placeholder="Build a birdhouse"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "new-diagram-error" : undefined}
            />
            <button type="submit" className="button button-primary" disabled={creating}>
              <Plus size={18} aria-hidden="true" /> New diagram
            </button>
            {message && (
              <p id="new-diagram-error" className="field-error" role="alert">
                {message}
              </p>
            )}
          </form>
        )}
      </div>
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {!data && !error && <LoadingCards label="Loading diagrams" />}
      {data?.diagrams.length === 0 && (
        <EmptyState title="No diagrams yet">Create the first build plan for this workspace.</EmptyState>
      )}
      {data && data.diagrams.length > 0 && (
        <ul className="grid diagram-grid">
          {data.diagrams.map((diagram) => (
            <DiagramCard key={diagram.id} diagram={diagram} onDeleted={() => void refetch()} />
          ))}
        </ul>
      )}
    </>
  );
}
