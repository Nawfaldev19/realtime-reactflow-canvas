import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDocument, serializeDocument } from "../document/serialize";
import { createEditorStore, hasUnsavedChanges } from "../editor/store";
import { sampleState } from "../test/fixtures";
import { AutosaveController, type SaveOutcome, type SaveSnapshot } from "./autosave";

// Two editing sessions against an in-memory server with the same optimistic
// revision rule as saveDiagram: a save is accepted only on the current revision.
function fakeServer() {
  let revision = 1;
  let document: unknown = serializeDocument(sampleState());
  let updatedBy: string | null = null;
  return {
    get document() {
      return document;
    },
    get revision() {
      return revision;
    },
    load: () => ({ revision, document }),
    save(author: string, snapshot: SaveSnapshot): Promise<SaveOutcome> {
      if (snapshot.baseRevision !== revision)
        return Promise.resolve({ kind: "conflict", revision, document, updatedBy });
      revision += 1;
      document = snapshot.document;
      updatedBy = author;
      return Promise.resolve({ kind: "saved", revision });
    },
  };
}

function session(server: ReturnType<typeof fakeServer>, author: string) {
  const store = createEditorStore();
  store.getState().load({ id: "d1", title: "Plan", canEdit: true, ...server.load() });
  const controller = new AutosaveController({
    target: {
      snapshot: () => store.getState().snapshot(),
      hasUnsavedChanges: () => hasUnsavedChanges(store.getState()),
      markSaved: (revision, changeId) => {
        store.getState().markSaved(revision, changeId);
      },
      rebase: (conflict) => {
        store.getState().rebase(conflict);
      },
    },
    save: (snapshot) => server.save(author, snapshot),
    onStatus: (status) => {
      store.getState().setSaveStatus(status);
    },
  });
  store.subscribe((next, previous) => {
    if (next.localSeq !== previous.localSeq) controller.changed();
  });
  return { store, controller };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("autosave with revision conflicts", () => {
  it("a stale save is rebased and retried, and the stored document keeps both people's changes", async () => {
    const server = fakeServer();
    const ada = session(server, "Ada Okafor");
    const ben = session(server, "Ben Lindqvist");

    ada.store.getState().apply({ type: "node.update", id: "c", fields: { position: { x: 900, y: 40 } } });
    ben.store.getState().apply({ type: "node.update", id: "a", fields: { data: { text: "Glue the base" } } });
    await ada.controller.flush();
    await ben.controller.flush();
    await vi.waitFor(() => expect(ben.store.getState().saveStatus.kind).toBe("saved"));

    const stored = parseDocument(server.document).state;
    expect(server.revision).toBe(3);
    expect(stored.nodes.c?.position).toEqual({ x: 900, y: 40 });
    expect(stored.nodes.a?.data.text).toBe("Glue the base");
    expect(ben.store.getState().mergeNotice?.updatedBy).toBe("Ada Okafor");
    expect(ben.store.getState().doc).toEqual(stored);
  });

  it("a session that only watches never saves", async () => {
    const server = fakeServer();
    const save = vi.spyOn(server, "save");
    const watcher = session(server, "Cora Mbeki");
    watcher.store.getState().setSelection(["a"], []);
    watcher.store.getState().setDragPositions({ a: { x: 1, y: 1 } });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(save).not.toHaveBeenCalled();
  });
});
