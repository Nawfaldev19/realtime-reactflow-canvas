import { act, renderHook } from "@testing-library/react";
import { serializeDocument } from "../../document/serialize";
import { sampleState } from "../../test/fixtures";
import { createEditorStore } from "../store";
import { usePeriodicVersions } from "./usePeriodicVersions";

const MINUTE = 60_000;

function setup({ canEdit = true, save = vi.fn(() => Promise.resolve()) } = {}) {
  const store = createEditorStore();
  store
    .getState()
    .load({ id: "d1", title: "Walnut table", revision: 1, document: serializeDocument(sampleState()), canEdit });
  let now = 0;
  const hook = renderHook(() => usePeriodicVersions(store, save, { interval: 10 * MINUTE, now: () => now }));
  /** One local edit at the given minute: "c" moves to x. */
  const editAt = (minute: number, x = minute) => {
    now = minute * MINUTE;
    store.getState().apply({ type: "node.update", id: "c", fields: { position: { x, y: 100 } } });
  };
  return { store, save, hook, editAt };
}

describe("usePeriodicVersions", () => {
  it("asks for an automatic version after ten minutes of editing, once, and starts over after it", async () => {
    const { save, editAt } = setup();
    for (let minute = 0; minute < 10; minute += 1) editAt(minute);
    expect(save).not.toHaveBeenCalled();

    editAt(10);
    editAt(10.5);
    expect(save).toHaveBeenCalledTimes(1);
    await act(() => Promise.resolve());

    for (let minute = 11; minute < 20; minute += 1) editAt(minute);
    expect(save).toHaveBeenCalledTimes(1);
    editAt(21);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does not ask when the diagram looks as it did at the last version, and a manual version restarts the clock", () => {
    const { save, editAt, hook, store } = setup();
    // Ten minutes of moving "c" about, ending where it started (x 600).
    for (let minute = 0; minute < 10; minute += 1) editAt(minute, minute + 1);
    editAt(10, 600);
    expect(save).not.toHaveBeenCalled();

    for (let minute = 11; minute < 20; minute += 1) editAt(minute);
    act(() => hook.result.current(store.getState().doc));
    editAt(21);
    expect(save).not.toHaveBeenCalled();
  });

  it("tries again on the next edit when saving failed", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const { editAt } = setup({ save });
    for (let minute = 0; minute <= 10; minute += 1) editAt(minute);
    expect(save).toHaveBeenCalledTimes(1);
    await act(() => Promise.resolve());

    editAt(11);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("never asks for a viewer", () => {
    const { save, store } = setup({ canEdit: false });
    store.setState({ localSeq: 5 });

    expect(save).not.toHaveBeenCalled();
  });
});
