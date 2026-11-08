import { createContext, useContext } from "react";
import type { ViewerQuery } from "../graphql/generated/graphql";

export type Viewer = NonNullable<ViewerQuery["viewer"]>;
export type WorkspaceSummary = ViewerQuery["workspaces"][number];

export interface SignedIn {
  viewer: Viewer;
  workspaces: readonly WorkspaceSummary[];
}

export const SignedInContext = createContext<SignedIn | null>(null);

/** The signed-in member and the workspaces they belong to. */
export function useSignedIn(): SignedIn {
  const value = useContext(SignedInContext);
  if (!value) throw new Error("useSignedIn must be used inside a signed-in route");
  return value;
}
