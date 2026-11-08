import { useMemo, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { VIEWER } from "../graphql/operations";
import { useSession } from "../lib/session";
import { ErrorState, SkeletonBlock } from "./States";
import { SignedInContext } from "./workspace";

/** Gate for signed-in routes: resolves the member and their workspaces once. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { token } = useSession();
  const { data, error, refetch } = useQuery(VIEWER, { skip: !token });
  const value = useMemo(() => (data?.viewer ? { viewer: data.viewer, workspaces: data.workspaces } : null), [data]);

  if (!token) return <Navigate to="/sign-in" replace />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) {
    return (
      <div role="status" className="main">
        <span className="visually-hidden">Loading your workspaces</span>
        <SkeletonBlock height="2.5rem" width="40%" />
      </div>
    );
  }
  if (!value) return <Navigate to="/sign-in" replace />;
  return <SignedInContext.Provider value={value}>{children}</SignedInContext.Provider>;
}
