import type { ViewSettings } from "../viewport/settings";

// Saves the view settings (opening view, background, animation, snapping)
// 500 ms after the last change, the latest value only. View settings have no
// revision check: they never conflict with document edits, and the last
// person to change them wins. A failed save is reported and retried with the
// next change (or by flushing).

export type ViewSettingsSaveStatus = "saving" | "saved" | "failed";

export interface SaverClock {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const browserClock: SaverClock = {
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    window.clearTimeout(handle as number);
  },
};

export interface ViewSettingsSaverOptions {
  readonly save: (settings: ViewSettings) => Promise<void>;
  readonly onStatus: (status: ViewSettingsSaveStatus) => void;
  readonly delayMs?: number;
  readonly clock?: SaverClock;
}

export const VIEW_SETTINGS_DELAY_MS = 500;

export class ViewSettingsSaver {
  private pending: ViewSettings | null = null;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private disposed = false;
  private readonly save: ViewSettingsSaverOptions["save"];
  private readonly onStatus: ViewSettingsSaverOptions["onStatus"];
  private readonly delayMs: number;
  private readonly clock: SaverClock;

  constructor({ save, onStatus, delayMs = VIEW_SETTINGS_DELAY_MS, clock = browserClock }: ViewSettingsSaverOptions) {
    this.save = save;
    this.onStatus = onStatus;
    this.delayMs = delayMs;
    this.clock = clock;
  }

  /** Schedules a save of `settings`, replacing any value still waiting. */
  changed(settings: ViewSettings): void {
    if (this.disposed) return;
    this.pending = settings;
    this.cancelTimer();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  /** Saves the waiting value now (after any save in flight). */
  async flush(): Promise<void> {
    this.cancelTimer();
    if (this.inFlight) await this.inFlight;
    const settings = this.pending;
    if (!settings) return;
    this.pending = null;
    this.inFlight = this.send(settings);
    await this.inFlight;
    this.inFlight = null;
  }

  /** Stops scheduling; a value still waiting is saved once more. */
  dispose(): Promise<void> {
    const done = this.flush();
    this.disposed = true;
    return done;
  }

  private async send(settings: ViewSettings): Promise<void> {
    if (!this.disposed) this.onStatus("saving");
    try {
      await this.save(settings);
      if (!this.disposed) this.onStatus(this.pending ? "saving" : "saved");
    } catch {
      // Keep the value so the next flush or change tries again.
      this.pending ??= settings;
      if (!this.disposed) this.onStatus("failed");
    }
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}
