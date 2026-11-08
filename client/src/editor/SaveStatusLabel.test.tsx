import { act, render, screen } from "@testing-library/react";
import { createEditorStore } from "./store";
import { EditorStoreProvider } from "./EditorStoreContext";
import { describeStatus, SaveStatusLabel, savedAgo } from "./SaveStatusLabel";

const NOW = Date.UTC(2031, 2, 10, 8, 0);

describe("save status text", () => {
  it("describes every state", () => {
    expect(describeStatus({ kind: "idle" }, NOW)).toBe("All changes saved");
    expect(describeStatus({ kind: "pending" }, NOW)).toBe("Unsaved changes");
    expect(describeStatus({ kind: "saving" }, NOW)).toBe("Saving…");
    expect(describeStatus({ kind: "saved", at: NOW - 10_000 }, NOW)).toBe("Saved · just now");
    expect(describeStatus({ kind: "retrying", attempt: 2 }, NOW)).toBe("Offline – will retry");
    expect(describeStatus({ kind: "failed", message: "x" }, NOW)).toBe("Not saved");
    expect(describeStatus({ kind: "conflict" }, NOW)).toBe("Not saved");
    expect(describeStatus({ kind: "syncing" }, NOW)).toBe("Syncing…");
    expect(describeStatus({ kind: "offline" }, NOW)).toBe("Offline – changes queued");
  });

  it("ages the saved time", () => {
    expect(savedAgo(NOW - 2 * 60_000, NOW)).toBe("2 min ago");
    expect(savedAgo(NOW - 3 * 3_600_000, NOW)).toBe("3 h ago");
  });
});

describe("SaveStatusLabel", () => {
  function renderWith(canEdit: boolean) {
    const store = createEditorStore();
    store.getState().load({ id: "d", title: "Plan", revision: 1, document: {}, canEdit });
    render(
      <EditorStoreProvider store={store}>
        <SaveStatusLabel />
      </EditorStoreProvider>,
    );
    return store;
  }

  it("announces status changes politely", async () => {
    const store = renderWith(true);
    act(() => {
      store.getState().setSaveStatus({ kind: "saved", at: Date.now() });
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Saved · just now");
  });

  it("shows a read-only badge to viewers", () => {
    renderWith(false);

    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
