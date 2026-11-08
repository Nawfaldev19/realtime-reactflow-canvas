import { computeLayered, type LayoutRequestMessage } from "./layeredJob";

// The layered engine's worker: one message in, one layout out.
self.addEventListener("message", (event: MessageEvent<LayoutRequestMessage>) => {
  self.postMessage(computeLayered(event.data));
});
