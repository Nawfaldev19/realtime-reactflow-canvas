import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from "../viewport/settings";
import { ViewSettingsSaver } from "./viewSettingsSaver";

const withPercent = (customPercent: number): ViewSettings => ({
  ...DEFAULT_VIEW_SETTINGS,
  openingView: { ...DEFAULT_VIEW_SETTINGS.openingView, mode: "custom", customPercent },
});

describe("view settings saver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves the latest value 500 ms after typing stops", async () => {
    const save = vi.fn(() => Promise.resolve());
    const onStatus = vi.fn();
    const saver = new ViewSettingsSaver({ save, onStatus });
    saver.changed(withPercent(7));
    await vi.advanceTimersByTimeAsync(300);
    saver.changed(withPercent(75));
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(withPercent(75));
    expect(onStatus.mock.calls.map(([status]) => status as string)).toEqual(["saving", "saved"]);
  });

  it("reports a failure and retries the same value on the next flush", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const saver = new ViewSettingsSaver({ save, onStatus });
    saver.changed(withPercent(90));
    await vi.advanceTimersByTimeAsync(500);
    expect(onStatus).toHaveBeenLastCalledWith("failed");
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(withPercent(90));
    expect(onStatus).toHaveBeenLastCalledWith("saved");
  });

  it("queues a change made while a save is in flight and sends it after", async () => {
    let finish: () => void = () => undefined;
    const save = vi.fn(
      (settings: ViewSettings) =>
        new Promise<void>((resolve) => {
          sent.push(settings.openingView.customPercent);
          finish = resolve;
        }),
    );
    const sent: number[] = [];
    const onStatus = vi.fn();
    const saver = new ViewSettingsSaver({ save, onStatus });
    saver.changed(withPercent(50));
    await vi.advanceTimersByTimeAsync(500);
    saver.changed(withPercent(60));
    const flushing = saver.flush();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(onStatus).toHaveBeenCalledWith("saving");
    finish();
    await flushing;
    expect(sent).toEqual([50, 60]);
  });

  it("flushes nothing when nothing changed", async () => {
    const save = vi.fn(() => Promise.resolve());
    const saver = new ViewSettingsSaver({ save, onStatus: vi.fn() });
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a waiting value on dispose, then ignores changes and stays quiet", async () => {
    const save = vi.fn(() => Promise.resolve());
    const onStatus = vi.fn();
    const saver = new ViewSettingsSaver({ save, onStatus, delayMs: 100 });
    saver.changed(withPercent(120));
    await saver.dispose();
    expect(save).toHaveBeenCalledWith(withPercent(120));
    saver.changed(withPercent(130));
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
