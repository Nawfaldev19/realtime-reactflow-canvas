import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorBanners } from "./EditorBanners";
import { EditorStoreProvider } from "./EditorStoreContext";
import { createEditorStore } from "./store";

function setup() {
  const store = createEditorStore();
  store
    .getState()
    .load({ id: "d", title: "Lamp shade", revision: 1, document: { nodes: [{ id: "a" }] }, canEdit: true });
  const onRetry = vi.fn();
  const onLoadLatest = vi.fn();
  render(
    <EditorStoreProvider store={store}>
      <EditorBanners onRetry={onRetry} onLoadLatest={onLoadLatest} />
    </EditorStoreProvider>,
  );
  return { store, onRetry, onLoadLatest, user: userEvent.setup() };
}

describe("EditorBanners", () => {
  it("shows nothing while saving normally", () => {
    setup();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a merge after a conflict, including dropped changes, and can be dismissed", async () => {
    const { store, user } = setup();
    act(() => {
      store.getState().rebase({ kind: "conflict", revision: 4, document: { nodes: [] }, updatedBy: "Ben Lindqvist" });
    });
    act(() => {
      store.setState({ mergeNotice: { updatedBy: "Ben Lindqvist", dropped: 2 } });
    });

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Ben Lindqvist saved changes to this diagram while you were editing.");
    expect(notice).toHaveTextContent("2 of your changes could not be applied");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("names nobody when the other editor is unknown", async () => {
    const { store } = setup();
    act(() => {
      store.setState({ mergeNotice: { updatedBy: null, dropped: 0 } });
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/^Someone saved changes/);
  });

  it("offers to try again or load the latest copy after repeated conflicts", async () => {
    const { store, user, onRetry, onLoadLatest } = setup();
    act(() => {
      store.getState().setSaveStatus({ kind: "conflict" });
    });

    await user.click(await screen.findByRole("button", { name: /Try again/ }));
    await user.click(screen.getByRole("button", { name: "Discard mine and load the latest" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onLoadLatest).toHaveBeenCalledOnce();
  });

  it("offers retry and a downloadable copy when saving failed", async () => {
    const { store, user, onRetry } = setup();
    const createObjectURL = vi.fn(() => "blob:copy");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    act(() => {
      store.getState().setSaveStatus({ kind: "failed", message: "We couldn't reach the server." });
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach the server.");
    await user.click(screen.getByRole("button", { name: /Retry now/ }));
    await user.click(screen.getByRole("button", { name: /Download a copy/ }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:copy");
    vi.unstubAllGlobals();
  });
});
