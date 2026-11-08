import { useCallback, useContext } from "react";
import { useMutation } from "@apollo/client";
import { SignedInContext } from "../components/workspace";
import type { NavigationModeEnum } from "../graphql/generated/graphql";
import { SET_NAVIGATION_MODE } from "../graphql/operations";
import { effectiveMode, type NavigationMode } from "../viewport/navigation";

// The navigation mode for a canvas: the member's own preference, else the
// workspace default, else pan. Changing it stores the preference on the
// server; the cached viewer updates, so every open canvas switches without a
// reload.

const toMode = (value: NavigationModeEnum | null | undefined): NavigationMode | null =>
  value === "SCROLL" ? "scroll" : value === "PAN" ? "pan" : null;
const toEnum = (mode: NavigationMode): NavigationModeEnum => (mode === "scroll" ? "SCROLL" : "PAN");

export function useNavigationMode(workspaceDefault: NavigationModeEnum | null | undefined): {
  mode: NavigationMode;
  setMode: (mode: NavigationMode) => void;
} {
  const signedIn = useContext(SignedInContext);
  const [save] = useMutation(SET_NAVIGATION_MODE);
  const mode = effectiveMode(toMode(signedIn?.viewer.navigationMode), toMode(workspaceDefault));
  const viewerId = signedIn?.viewer.id;
  const setMode = useCallback(
    (next: NavigationMode) => {
      void save({
        variables: { mode: toEnum(next) },
        optimisticResponse: viewerId
          ? {
              setNavigationMode: {
                __typename: "SetNavigationModePayload",
                viewer: { __typename: "Viewer", id: viewerId, navigationMode: toEnum(next) },
                errors: [],
              },
            }
          : undefined,
      }).catch(() => undefined);
    },
    [save, viewerId],
  );
  return { mode, setMode };
}
