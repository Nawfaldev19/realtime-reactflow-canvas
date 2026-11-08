import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { SessionProvider, useSession } from "./session";

const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;

describe("session", () => {
  it("stores the token and the last workspace", () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    act(() => {
      result.current.signIn("token-1");
      result.current.rememberWorkspace("7");
    });

    expect(result.current.token).toBe("token-1");
    expect(window.localStorage.getItem("live-canvas.workspace")).toBe("7");

    act(() => {
      result.current.signOut();
    });
    expect(result.current.token).toBeNull();
    expect(result.current.lastWorkspaceId).toBe("7");
  });

  it("must be used inside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });
});
