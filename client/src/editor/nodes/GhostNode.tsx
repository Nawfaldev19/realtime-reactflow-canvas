import { memo } from "react";
import { ConnectionPorts } from "./NodeShell";

// The placeholder step shown where a connection was dropped on empty canvas,
// while the shape menu is open. It is not part of the document.

function GhostNodeView() {
  return (
    <>
      <ConnectionPorts hidden />
      <div className="node node--ghost" data-testid="ghost-node" aria-hidden="true" />
    </>
  );
}

export const GhostNode = memo(GhostNodeView);
