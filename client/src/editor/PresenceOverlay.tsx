import { useMemo, type CSSProperties } from "react";
import { useStore as useFlowStore, ViewportPortal } from "@xyflow/react";
import { useStore } from "zustand";
import type { PresenceStoreApi } from "../collab/client";
import { absoluteCorner, overlayTransform } from "../collab/coordinates";
import { isStale, peersInOrder, presenceLabel } from "../collab/presence";
import type { Point } from "../document/types";
import { useEditorShallow } from "./EditorStoreContext";

// Collaborators' cursors, name tags and "editing" badges, drawn in the
// canvas's own transformed layer (ViewportPortal), above the steps. Pan and
// zoom come from that layer; each overlay has one transform of its own:
// translate to its canvas point, then scale by 1 / zoom so it keeps its
// screen size (collab/coordinates.ts). Badges sit at the node's absolute
// top-left corner, so they follow nodes inside groups and nodes being dragged.

function CursorArrow() {
  return (
    <svg className="peer-cursor__arrow" width="18" height="22" viewBox="0 0 18 22" aria-hidden="true">
      <path d="M1 1 L1 18 L5.5 13.8 L8.6 20.6 L11.6 19.2 L8.6 12.6 L15 12.4 Z" />
    </svg>
  );
}

export function PresenceOverlay({ presence }: { presence: PresenceStoreApi }) {
  const roster = useStore(presence, (state) => state.roster);
  const now = useStore(presence, (state) => state.now);
  const zoom = useFlowStore((state) => state.transform[2]);
  const { doc, dragPositions, live } = useEditorShallow((state) => ({
    doc: state.doc,
    dragPositions: state.dragPositions,
    live: state.live,
  }));
  const peers = useMemo(() => peersInOrder(roster), [roster]);
  const overrides = useMemo(() => {
    const positions: Record<string, Point> = {};
    for (const [id, fields] of Object.entries(live)) if (fields.position) positions[id] = fields.position;
    return { ...positions, ...dragPositions };
  }, [live, dragPositions]);

  if (peers.length === 0) return null;
  return (
    <ViewportPortal>
      <div className="presence-layer" aria-hidden="true">
        {peers.map((peer) => {
          const node = peer.nodeId === null ? undefined : doc.nodes[peer.nodeId];
          const corner = node ? absoluteCorner(doc, node.id, overrides) : null;
          const label = presenceLabel(peer.name, node ? node.number : null);
          const colors = { "--peer-color": peer.color, "--peer-text": peer.text } as CSSProperties;
          return (
            <div key={peer.sessionId} data-session={peer.sessionId}>
              {corner && (
                <div
                  className="peer-badge"
                  data-node-id={node?.id}
                  data-editing={peer.editing || undefined}
                  style={{ ...colors, transform: overlayTransform(corner, zoom) }}
                >
                  <span className="peer-badge__label">{peer.editing ? `${label} · editing` : label}</span>
                </div>
              )}
              {peer.cursor && (
                <div
                  className={`peer-cursor${isStale(peer, now) ? " peer-cursor--stale" : ""}`}
                  data-member={peer.name}
                  style={{ ...colors, transform: overlayTransform(peer.cursor, zoom) }}
                >
                  <CursorArrow />
                  <span className="peer-cursor__tag">{label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ViewportPortal>
  );
}
