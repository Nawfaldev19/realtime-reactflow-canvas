import { Outlet, useMatch, useNavigate } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import { LogOut } from "lucide-react";
import { useSession } from "../lib/session";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { useSignedIn } from "./workspace";

export function AppLayout() {
  const { viewer, workspaces } = useSignedIn();
  const { signOut, lastWorkspaceId } = useSession();
  const client = useApolloClient();
  const navigate = useNavigate();
  const inWorkspace = useMatch("/app/w/:workspaceId")?.params.workspaceId;
  const editing = useMatch("/app/d/:diagramId");
  const previewing = useMatch("/app/d/:diagramId/preview");
  const inEditor = editing !== null || previewing !== null;
  const current = inWorkspace ?? lastWorkspaceId ?? workspaces[0]?.id ?? "";

  const handleSignOut = async () => {
    signOut();
    await client.clearStore();
    void navigate("/sign-in");
  };

  return (
    <div className={inEditor ? "shell shell--editor" : "shell"}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Brand to="/app" />
        <div className="topbar-end">
          <label className="visually-hidden" htmlFor="workspace-switcher">
            Workspace
          </label>
          <select
            id="workspace-switcher"
            className="select"
            value={current}
            onChange={(event) => void navigate(`/app/w/${event.target.value}`)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} ({workspace.role.toLowerCase()})
              </option>
            ))}
          </select>
          <ThemeToggle />
          <span className="avatar" title={viewer.name} aria-hidden="true">
            {viewer.initials}
          </span>
          <span className="visually-hidden">Signed in as {viewer.name}</span>
          <button type="button" className="button button-ghost" onClick={() => void handleSignOut()}>
            <LogOut size={18} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <main id="main" className={inEditor ? "main main--editor" : "main"}>
        <Outlet />
      </main>
    </div>
  );
}
