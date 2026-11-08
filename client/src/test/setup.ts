import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { animations, installAnimationStubs } from "./animation";
import { PointerEventStub, ResizeObserverStub } from "./resizeObserver";

// jsdom has no layout engine. The canvas library measures with ResizeObserver
// and DOMMatrix, and the editor uses pointer events with pointer capture, so
// tests get minimal stand-ins.
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
vi.stubGlobal("PointerEvent", PointerEventStub);
vi.stubGlobal(
  "DOMMatrixReadOnly",
  class {
    m22 = 1;
  },
);
// jsdom has no 2D canvas; components that draw (the guide overlay) get no context unless a test provides one.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
// No test opens a real socket: pages that start a collaboration session
// without a passed-in transport get one that never connects.
vi.stubGlobal(
  "WebSocket",
  class {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 0;
    protocol = "";
    send() {
      return undefined;
    }
    close() {
      this.readyState = 3;
    }
  },
);
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.hasPointerCapture = () => false;
installAnimationStubs();

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  animations.length = 0;
  vi.restoreAllMocks();
});
