import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Vec } from "../../geometry/vector";

// Pointer-captured drags for connector handles. One pointer at a time: a
// second pointer during a drag is ignored. Releasing the pointer, cancelling
// it, or losing the capture (for example when the pointer leaves the
// window) ends the drag and commits. The handles carry the canvas library's
// "nodrag nopan" classes, so a handle drag never pans the canvas or drags a
// step.

export interface DragCallbacks<S> {
  /** Starts a drag; return null to ignore this press. */
  readonly start: (event: ReactPointerEvent) => S | null;
  readonly move: (session: S, client: Vec) => void;
  readonly end: (session: S) => void;
}

export interface DragHandlers {
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onPointerMove: (event: ReactPointerEvent) => void;
  readonly onPointerUp: (event: ReactPointerEvent) => void;
  readonly onPointerCancel: (event: ReactPointerEvent) => void;
  readonly onLostPointerCapture: (event: ReactPointerEvent) => void;
}

export function useHandleDrag<S>(callbacks: DragCallbacks<S>): DragHandlers {
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  });
  const session = useRef<{ readonly pointerId: number; readonly state: S } | null>(null);
  const handlers = useRef<DragHandlers | null>(null);
  if (!handlers.current) {
    const finish = (event: ReactPointerEvent, release: boolean) => {
      const current = session.current;
      if (current?.pointerId !== event.pointerId) return;
      session.current = null;
      // A release also reports where the pointer ended; a cancel or a lost capture does not.
      if (release) latest.current.move(current.state, { x: event.clientX, y: event.clientY });
      latest.current.end(current.state);
    };
    handlers.current = {
      onPointerDown: (event) => {
        if (event.button !== 0 || session.current) return;
        event.stopPropagation();
        const state = latest.current.start(event);
        if (state === null) return;
        event.preventDefault();
        session.current = { pointerId: event.pointerId, state };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event) => {
        const current = session.current;
        if (current?.pointerId !== event.pointerId) return;
        event.stopPropagation();
        latest.current.move(current.state, { x: event.clientX, y: event.clientY });
      },
      onPointerUp: (event) => {
        finish(event, true);
      },
      onPointerCancel: (event) => {
        finish(event, false);
      },
      onLostPointerCapture: (event) => {
        finish(event, false);
      },
    };
  }
  return handlers.current;
}
