import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutosaveController,
  OFFLINE_MESSAGE,
  type AutosaveTarget,
  type ConflictOutcome,
  type SaveOutcome,
  type SaveSnapshot,
  type SaveStatus,
} from "./autosave";

// A fake editing session: `edit()` makes a local change; saves record the
// change id they covered, like the real store.
function fakeSession() {
  let revision = 0;
  let changeId = 0;
  let savedChangeId = 0;
  const rebases: ConflictOutcome[] = [];
  const target: AutosaveTarget = {
    snapshot: () => ({
      baseRevision: revision,
      document: { schemaVersion: 1, nodes: [], edges: [], nextNumber: changeId + 1 },
      changeId,
    }),
    hasUnsavedChanges: () => changeId > savedChangeId,
    markSaved: (nextRevision, upTo) => {
      revision = nextRevision;
      savedChangeId = upTo;
    },
    rebase: (conflict) => {
      revision = conflict.revision;
      rebases.push(conflict);
    },
  };
  return {
    target,
    rebases,
    edit: () => {
      changeId += 1;
    },
    get revision() {
      return revision;
    },
  };
}

type SaveFn = (snapshot: SaveSnapshot, options: { keepalive: boolean }) => Promise<SaveOutcome>;

function setup(save: SaveFn) {
  const session = fakeSession();
  const statuses: SaveStatus[] = [];
  const saveSpy = vi.fn(save);
  const controller = new AutosaveController({
    target: session.target,
    save: saveSpy,
    onStatus: (status) => statuses.push(status),
  });
  const change = () => {
    session.edit();
    controller.changed();
  };
  return { session, controller, statuses, save: saveSpy, change, last: () => statuses.at(-1) };
}

const accept: SaveFn = (snapshot) => Promise.resolve({ kind: "saved", revision: snapshot.baseRevision + 1 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2031-03-10T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("debounce and max-wait", () => {
  it("saves 2 s after the last change", async () => {
    const { change, save, last } = setup(accept);
    change();

    expect(last()).toEqual({ kind: "pending" });
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(last()).toEqual({ kind: "saved", at: Date.now() });
  });

  it("keeps postponing while changes continue, but saves at least every 10 s", async () => {
    const { change, save } = setup(accept);
    for (let elapsed = 0; elapsed < 9500; elapsed += 500) {
      change();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(save).not.toHaveBeenCalled();
    change();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("produces at least three saves over 30 s of continuous editing", async () => {
    const { change, save } = setup(accept);
    for (let elapsed = 0; elapsed < 30_000; elapsed += 250) {
      change();
      await vi.advanceTimersByTimeAsync(250);
    }
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("never saves when nothing changed locally", async () => {
    const { controller, save } = setup(accept);
    await controller.flush();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(save).not.toHaveBeenCalled();
  });

  it("sends the revision the changes were built on, and the next save builds on the result", async () => {
    const { change, save, session } = setup(accept);
    change();
    await vi.advanceTimersByTimeAsync(2000);
    change();
    await vi.advanceTimersByTimeAsync(2000);

    expect(save.mock.calls.map(([snapshot]) => snapshot.baseRevision)).toEqual([0, 1]);
    expect(session.revision).toBe(2);
  });
});

describe("flushing", () => {
  it("flush saves immediately and passes keepalive through", async () => {
    const { change, controller, save } = setup(accept);
    change();
    await controller.flush({ keepalive: true });

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ changeId: 1 }), { keepalive: true });
  });

  it("changes made during a save are saved right after it", async () => {
    let release: (() => void) | undefined;
    const { change, controller, save, last } = setup(
      (snapshot) =>
        new Promise((resolve) => {
          release = () => resolve({ kind: "saved", revision: snapshot.baseRevision + 1 });
        }),
    );
    change();
    const first = controller.flush();
    change();
    expect(last()).toEqual({ kind: "saving" });
    const joined = controller.flush();
    release?.();
    await first;
    await joined;
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    release?.();
    await vi.waitFor(() => expect(last()?.kind).toBe("saved"));
  });

  it("a change landing after the snapshot but before the reply stays unsaved and is scheduled", async () => {
    let release: (() => void) | undefined;
    const { change, controller, last, session } = setup(
      (snapshot) =>
        new Promise((resolve) => {
          release = () => resolve({ kind: "saved", revision: snapshot.baseRevision + 1 });
        }),
    );
    change();
    const pending = controller.flush();
    session.edit();
    release?.();
    await pending;

    expect(last()).toEqual({ kind: "pending" });
    expect(session.target.hasUnsavedChanges()).toBe(true);
  });
});

describe("conflicts", () => {
  const conflict = (revision: number): ConflictOutcome => ({
    kind: "conflict",
    revision,
    document: {},
    updatedBy: "Ben Lindqvist",
  });

  it("rebases on the server copy and retries at once on the new revision", async () => {
    const outcomes: SaveOutcome[] = [conflict(5), { kind: "saved", revision: 6 }];
    const { change, controller, save, session, last } = setup(() =>
      Promise.resolve(outcomes.shift() ?? { kind: "saved", revision: 0 }),
    );
    change();
    await controller.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));

    expect(session.rebases).toHaveLength(1);
    expect(save.mock.calls[1]?.[0].baseRevision).toBe(5);
    await vi.waitFor(() => expect(last()?.kind).toBe("saved"));
    expect(session.revision).toBe(6);
  });

  it("stops after repeated conflicts and waits for the person", async () => {
    let revision = 10;
    const { change, controller, save, last } = setup(() => Promise.resolve(conflict((revision += 1))));
    change();
    await controller.flush();
    await vi.waitFor(() => expect(last()).toEqual({ kind: "conflict" }));

    expect(save).toHaveBeenCalledTimes(4);
    change();
    await controller.flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(save).toHaveBeenCalledTimes(4);
  });

  it("reset clears a blocked conflict so editing saves again", async () => {
    let conflicted = true;
    const { change, controller, last } = setup((snapshot) =>
      Promise.resolve(
        conflicted ? conflict(snapshot.baseRevision + 1) : { kind: "saved", revision: snapshot.baseRevision + 1 },
      ),
    );
    change();
    await controller.flush();
    await vi.waitFor(() => expect(last()).toEqual({ kind: "conflict" }));

    conflicted = false;
    controller.reset();
    expect(last()).toEqual({ kind: "idle" });
    change();
    await vi.advanceTimersByTimeAsync(2000);
    expect(last()?.kind).toBe("saved");
  });
});

describe("failures", () => {
  it("retries network failures with 0.5, 1, 2 and 4 s backoff, then gives up after five attempts", async () => {
    const { change, controller, save, statuses, last } = setup(() => Promise.reject(new Error("offline")));
    change();
    await controller.flush();

    expect(last()).toEqual({ kind: "retrying", attempt: 1 });
    for (const delay of [500, 1000, 2000, 4000]) {
      const calls = save.mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(save).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(save).toHaveBeenCalledTimes(calls + 1);
    }
    expect(last()).toEqual({ kind: "failed", message: OFFLINE_MESSAGE });
    expect(statuses.filter((status) => status.kind === "retrying")).toHaveLength(4);
  });

  it("each retry sends the latest state", async () => {
    let online = false;
    const { change, controller, save, last } = setup((snapshot) =>
      online ? accept(snapshot, { keepalive: false }) : Promise.reject(new Error("offline")),
    );
    change();
    await controller.flush();
    change();
    online = true;
    await vi.advanceTimersByTimeAsync(500);

    expect(save.mock.calls.at(-1)?.[0].changeId).toBe(2);
    expect(last()?.kind).toBe("saved");
  });

  it("retry now starts over after giving up", async () => {
    let online = false;
    const { change, controller, last } = setup((snapshot) =>
      online ? accept(snapshot, { keepalive: false }) : Promise.reject(new Error("offline")),
    );
    change();
    await controller.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(last()?.kind).toBe("failed");

    online = true;
    await controller.retryNow();
    expect(last()?.kind).toBe("saved");
  });

  it("a rejected save reports the server's message and does not retry", async () => {
    const { change, controller, save, last } = setup(() =>
      Promise.resolve({ kind: "rejected", message: "Document is too large" }),
    );
    change();
    await controller.flush();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(last()).toEqual({ kind: "failed", message: "Document is too large" });
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("disposal", () => {
  it("cancels scheduled saves and reports nothing afterwards", async () => {
    const { change, controller, save, statuses } = setup(accept);
    change();
    controller.dispose();
    await vi.advanceTimersByTimeAsync(20_000);
    controller.changed();

    expect(save).not.toHaveBeenCalled();
    expect(statuses).toEqual([{ kind: "pending" }]);
  });

  it("a keepalive flush still goes out after disposal", async () => {
    const { change, controller, save } = setup(accept);
    change();
    controller.dispose();
    await controller.flush({ keepalive: true });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports the current status", () => {
    const { change, controller } = setup(accept);
    expect(controller.currentStatus).toEqual({ kind: "idle" });
    change();
    expect(controller.currentStatus).toEqual({ kind: "pending" });
  });
});
