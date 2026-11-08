import { useRef, useState, type PointerEvent } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { Check, Undo2 } from "lucide-react";
import { SKETCH_SIZE } from "../document/nodeData";
import {
  commitStroke,
  DEFAULT_PRESSURE,
  DEFAULT_STROKE,
  outlineToPath,
  strokeOutline,
  type StrokePoint,
} from "../geometry/freehand";
import type { Vec } from "../geometry/vector";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";

// Draw mode: a full-size overlay above the canvas with a crosshair. Canvas
// panning is blocked while it is open. Samples are recorded in client
// coordinates (so a scrolled page never offsets the stroke) into a ref (so
// the last sample is never lost to a pending render). The live preview is
// drawn at size × zoom, which is exactly how the committed node will look;
// releasing turns the stroke into a sketch node.

const zoomSelector = (state: { transform: [number, number, number] }) => state.transform[2];

function sampleOf(event: PointerEvent): StrokePoint {
  return { x: event.clientX, y: event.clientY, pressure: event.pressure > 0 ? event.pressure : DEFAULT_PRESSURE };
}

export function SketchOverlay() {
  const api = useEditorStoreApi();
  const drawMode = useEditor((state) => state.drawMode);
  const drawStyle = useEditor((state) => state.drawStyle);
  const strokes = useEditor((state) => state.drawnStrokes.length);
  const zoom = useStore(zoomSelector);
  const { screenToFlowPosition } = useReactFlow();
  const stroke = useRef<{ samples: StrokePoint[]; origin: Vec; pointerId: number } | null>(null);
  const [preview, setPreview] = useState("");
  if (!drawMode) return null;

  const redraw = () => {
    const current = stroke.current;
    if (!current) return;
    const local = current.samples.map((sample) => ({
      ...sample,
      x: sample.x - current.origin.x,
      y: sample.y - current.origin.y,
    }));
    setPreview(outlineToPath(strokeOutline(local, { ...DEFAULT_STROKE, size: drawStyle.strokeSize * zoom })));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    stroke.current = {
      samples: [sampleOf(event)],
      origin: { x: bounds.left, y: bounds.top },
      pointerId: event.pointerId,
    };
    redraw();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = stroke.current;
    if (current?.pointerId !== event.pointerId) return;
    current.samples.push(sampleOf(event));
    redraw();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = stroke.current;
    if (current?.pointerId !== event.pointerId) return;
    stroke.current = null;
    setPreview("");
    const flow = current.samples.map((sample) => ({
      ...screenToFlowPosition({ x: sample.x, y: sample.y }),
      pressure: sample.pressure,
    }));
    const committed = commitStroke(flow, drawStyle.strokeSize);
    if (committed) api.getState().addSketch(committed);
  };

  return (
    <div
      className="sketch-overlay"
      data-testid="sketch-overlay"
      aria-label="Drawing area. Press Escape to stop drawing."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        stroke.current = null;
        setPreview("");
      }}
    >
      <svg className="sketch-overlay__preview" aria-hidden="true">
        <path d={preview} style={drawStyle.color ? { fill: drawStyle.color } : undefined} />
      </svg>
      <div
        className="sketch-tools"
        role="toolbar"
        aria-label="Drawing tools"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <label className="sketch-tools__field">
          <span>Colour</span>
          <input
            type="color"
            value={drawStyle.color ?? "#1c1b19"}
            onChange={(event) => api.getState().setDrawStyle({ color: event.target.value })}
          />
        </label>
        <label className="sketch-tools__field">
          <span>Width</span>
          <input
            type="range"
            min={SKETCH_SIZE.min}
            max={SKETCH_SIZE.max}
            value={drawStyle.strokeSize}
            onChange={(event) => api.getState().setDrawStyle({ strokeSize: Number(event.target.value) })}
          />
        </label>
        <button
          type="button"
          className="button button-ghost"
          disabled={strokes === 0}
          onClick={() => api.getState().removeLastStroke()}
        >
          <Undo2 size={16} aria-hidden="true" /> Remove last stroke
        </button>
        <button type="button" className="button button-primary" onClick={() => api.getState().setDrawMode(false)}>
          <Check size={16} aria-hidden="true" /> Done
        </button>
      </div>
    </div>
  );
}
