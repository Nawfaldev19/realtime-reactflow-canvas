import { Navigate } from "react-router-dom";
import { EmptyState } from "../components/States";
import { useSignedIn } from "../components/workspace";
import { useSession } from "../lib/session";

/** /app: open the last workspace, or the first one. */
export function WorkspaceHome() {
  const { workspaces } = useSignedIn();
  const { lastWorkspaceId } = useSession();
  const target = workspaces.find((workspace) => workspace.id === lastWorkspaceId) ?? workspaces[0];
  if (!target)
    return <EmptyState title="No workspaces yet">Ask a workspace owner to add you, then sign in again.</EmptyState>;
  return <Navigate to={`/app/w/${target.id}`} replace />;
}
