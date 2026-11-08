import type { Clock } from "../persistence/autosave";

/** A clock whose time only moves when a test advances it; due timers run in time order. */
export function manualClock(start = 0) {
  let now = start;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (callback, ms) => {
      const handle = nextHandle++;
      timers.set(handle, { at: now + ms, callback });
      return handle as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as unknown as number);
    },
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      const [handle, timer] = due;
      timers.delete(handle);
      now = Math.max(now, timer.at);
      timer.callback();
    }
    now = until;
  };
  return { clock, advance, pending: () => timers.size, now: () => now };
}
