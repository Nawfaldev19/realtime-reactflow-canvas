import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { readStored, writeStored } from "./storage";

const TOKEN_KEY = "live-canvas.token";
const WORKSPACE_KEY = "live-canvas.workspace";

export interface Session {
  token: string | null;
  /** The workspace last opened, so returning visitors land in it. */
  lastWorkspaceId: string | null;
  signIn: (token: string) => void;
  signOut: () => void;
  rememberWorkspace: (workspaceId: string) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => readStored(TOKEN_KEY));
  const [lastWorkspaceId, setLastWorkspaceId] = useState(() => readStored(WORKSPACE_KEY));

  const signIn = useCallback((nextToken: string) => {
    writeStored(TOKEN_KEY, nextToken);
    setToken(nextToken);
  }, []);

  const signOut = useCallback(() => {
    writeStored(TOKEN_KEY, null);
    setToken(null);
  }, []);

  const rememberWorkspace = useCallback((workspaceId: string) => {
    writeStored(WORKSPACE_KEY, workspaceId);
    setLastWorkspaceId(workspaceId);
  }, []);

  const value = useMemo(
    () => ({ token, lastWorkspaceId, signIn, signOut, rememberWorkspace }),
    [token, lastWorkspaceId, signIn, signOut, rememberWorkspace],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
