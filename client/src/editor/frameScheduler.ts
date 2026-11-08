// Coalesces rapid updates (pointer moves) into at most one call per
// animation frame. The latest value wins; flush() delivers a pending value
// at once (on release), cancel() drops it.

export interface FrameScheduler<T> {
  schedule: (value: T) => void;
  flush: () => void;
  cancel: () => void;
}

type RequestFrame = (callback: () => void) => number;
type CancelFrame = (handle: number) => void;

const defaultRequest: RequestFrame = (callback) => window.requestAnimationFrame(callback);
const defaultCancel: CancelFrame = (handle) => {
  window.cancelAnimationFrame(handle);
};

export function createFrameScheduler<T>(
  deliver: (value: T) => void,
  requestFrame: RequestFrame = defaultRequest,
  cancelFrame: CancelFrame = defaultCancel,
): FrameScheduler<T> {
  let pending: { value: T } | null = null;
  let handle: number | null = null;
  const run = () => {
    handle = null;
    const next = pending;
    pending = null;
    if (next) deliver(next.value);
  };
  return {
    schedule: (value) => {
      pending = { value };
      handle ??= requestFrame(run);
    },
    flush: () => {
      if (handle !== null) cancelFrame(handle);
      run();
    },
    cancel: () => {
      if (handle !== null) cancelFrame(handle);
      handle = null;
      pending = null;
    },
  };
}
