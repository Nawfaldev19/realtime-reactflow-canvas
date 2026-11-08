import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { normalizeAngle, pointerAngle, snapToCardinal, unwrapDelta } from "../../geometry/angles";
import { boxForLine } from "../../geometry/line";
import type { Vec } from "../../geometry/vector";
import { lineRotationFields } from "../../document/lines";
import { lineProps } from "../../document/nodeData";
import { useEditorStoreApi } from "../EditorStoreContext";

// Dragging a line's rotate handle. On press the pivot (the node's absolute
// centre), the start angle a₀ and the line's stored length are frozen. Each
// move measures the pointer angle a, unwraps a − a₀ into (−180, 180] and adds
// it to the start rotation; the box is rebuilt from the frozen centre and
// length, so the visible length never changes during the drag. Within 7° of
// a cardinal angle a guide previews the snap, and releasing there snaps
// exactly. The release is one operation.

interface Frozen {
  readonly pointerId: number;
  readonly pivot: Vec;
  readonly startAngle: number;
  readonly startRotation: number;
  /** Centre in the parent's coordinates (what node.position uses). */
  readonly centre: Vec;
  readonly length: number;
  raw: number;
}

export interface RotationDrag {
  /** The snapped angle while the pointer is inside a snap window. */
  readonly guide: number | null;
  readonly dragging: boolean;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly onPointerCancel: (event: PointerEvent) => void;
}

export interface RotationContext {
  readonly nodeId: string;
  readonly selected: boolean;
  /** Screen (client) coordinates to canvas coordinates. */
  readonly toFlow: (point: Vec) => Vec;
  /** The node's absolute top-left corner on the canvas. */
  readonly absolutePosition: () => Vec;
}

export function useRotationHandle({ nodeId, selected, toFlow, absolutePosition }: RotationContext): RotationDrag {
  const api = useEditorStoreApi();
  const frozen = useRef<Frozen | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const cancel = useCallback(() => {
    if (!frozen.current) return;
    frozen.current = null;
    setGuide(null);
    setDragging(false);
    api.getState().setLive({ [nodeId]: null });
  }, [api, nodeId]);

  // Deselecting during a drag cancels it and clears the guide.
  useEffect(() => {
    if (!selected) cancel();
  }, [selected, cancel]);

  const onPointerDown = (event: PointerEvent) => {
    const node = api.getState().doc.nodes[nodeId];
    if (event.button !== 0 || !node) return;
    // Never let the press start a canvas pan or a node drag.
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = absolutePosition();
    const pivot = { x: origin.x + node.size.width / 2, y: origin.y + node.size.height / 2 };
    const { rotation, length } = lineProps(node);
    frozen.current = {
      pointerId: event.pointerId,
      pivot,
      startAngle: pointerAngle(pivot, toFlow({ x: event.clientX, y: event.clientY })),
      startRotation: rotation,
      centre: { x: node.position.x + node.size.width / 2, y: node.position.y + node.size.height / 2 },
      length,
      raw: rotation,
    };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent) => {
    const drag = frozen.current;
    if (drag?.pointerId !== event.pointerId) return;
    const angle = pointerAngle(drag.pivot, toFlow({ x: event.clientX, y: event.clientY }));
    drag.raw = drag.startRotation + unwrapDelta(angle - drag.startAngle);
    const snap = snapToCardinal(drag.raw);
    setGuide(snap.snapped ? snap.angle : null);
    const box = boxForLine(drag.centre, drag.length, drag.raw);
    api.getState().setLive({
      [nodeId]: {
        position: { x: box.x, y: box.y },
        size: { width: box.width, height: box.height },
        data: { rotation: normalizeAngle(drag.raw) },
      },
    });
  };

  const onPointerUp = (event: PointerEvent) => {
    const drag = frozen.current;
    if (drag?.pointerId !== event.pointerId) return;
    frozen.current = null;
    setGuide(null);
    setDragging(false);
    const node = api.getState().doc.nodes[nodeId];
    if (!node) return;
    api.getState().commitLive(nodeId, lineRotationFields(node, snapToCardinal(drag.raw).angle));
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (frozen.current?.pointerId === event.pointerId) cancel();
  };

  return { guide, dragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
