import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EdgeLabelRenderer, useReactFlow, useStore } from "@xyflow/react";
import { Pencil, Trash2 } from "lucide-react";
import { LABEL_TEXT_MAX, labelLook, labelWeight, withLabelKeys } from "../../document/connectorData";
import type { DiagramEdge } from "../../document/types";
import { projectOntoPath, type PathMeasure } from "../../geometry/path";
import { distance, type Vec } from "../../geometry/vector";
import { useEditor, useEditorStoreApi } from "../EditorStoreContext";
import { useLabelFade } from "../../preview/reveal";
import type { ConnectorPhase } from "../../reveal/timeline";
import { useHandleDrag } from "./useHandleDrag";

// A connector's label: an HTML box centred on a point of the path.
//
// - Drag slides it along the connector: the pointer is projected onto the
//   path and the position is stored as a fraction of the path length, so it
//   re-flows when the route changes.
// - Click opens the quick editor above the label (preset words, labels used
//   elsewhere, a text field, special characters, delete); a second click
//   within 200 ms edits in place instead, so a double-click never also opens
//   the quick editor.
// - In-place editing: Enter or leaving the field saves, Escape cancels.

export const DOUBLE_CLICK_MS = 200;
const DRAG_THRESHOLD = 3;

export const PRESET_WORDS = ["Yes", "No", "Maybe", "Done"] as const;

export const SPECIAL_CHARACTERS: readonly { readonly char: string; readonly name: string }[] = [
  { char: "→", name: "Rightwards arrow" },
  { char: "←", name: "Leftwards arrow" },
  { char: "↑", name: "Upwards arrow" },
  { char: "↓", name: "Downwards arrow" },
  { char: "✓", name: "Check mark" },
  { char: "✗", name: "Ballot X" },
  { char: "≈", name: "Almost equal to" },
  { char: "≠", name: "Not equal to" },
  { char: "≤", name: "Less-than or equal to" },
  { char: "≥", name: "Greater-than or equal to" },
  { char: "±", name: "Plus-minus sign" },
  { char: "×", name: "Multiplication sign" },
  { char: "÷", name: "Division sign" },
  { char: "°", name: "Degree sign" },
  { char: "…", name: "Horizontal ellipsis" },
  { char: "•", name: "Bullet" },
];

const zoomOf = (state: { transform: readonly [number, number, number] }) => state.transform[2];

interface QuickEditorProps {
  readonly edge: DiagramEdge;
  readonly onSave: (text: string) => void;
  readonly onClose: () => void;
  readonly onDelete: () => void;
}

function QuickEditor({ edge, onSave, onClose, onDelete }: QuickEditorProps) {
  const [text, setText] = useState(edge.label?.text ?? "");
  const input = useRef<HTMLInputElement>(null);
  const edges = useEditor((state) => state.doc.edges);
  const used = useMemo(() => {
    const texts = new Set<string>();
    for (const other of Object.values(edges)) {
      const value = other.label?.text.trim();
      if (other.id !== edge.id && value && !(PRESET_WORDS as readonly string[]).includes(value)) texts.add(value);
    }
    return [...texts].sort((a, b) => a.localeCompare(b)).slice(0, 8);
  }, [edges, edge.id]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const insert = (char: string) => {
    const field = input.current;
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${char}${text.slice(end)}`;
    setText(next);
    window.requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + char.length, start + char.length);
    });
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onClose();
  };

  return (
    <div
      className="label-editor"
      role="dialog"
      aria-label="Edit connector label"
      onBlur={onBlur}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div className="label-editor__row">
        {PRESET_WORDS.map((word) => (
          <button
            key={word}
            type="button"
            className="button button-secondary button-small"
            onClick={() => onSave(word)}
          >
            {word}
          </button>
        ))}
      </div>
      {used.length > 0 && (
        <div className="label-editor__row" aria-label="Labels used in this diagram">
          {used.map((word) => (
            <button key={word} type="button" className="button button-ghost button-small" onClick={() => onSave(word)}>
              {word}
            </button>
          ))}
        </div>
      )}
      <form
        className="label-editor__row"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(text);
        }}
      >
        <input
          ref={input}
          className="input"
          aria-label="Label text"
          value={text}
          maxLength={LABEL_TEXT_MAX}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="button button-primary button-small">
          Save
        </button>
      </form>
      <div className="label-editor__chars" role="group" aria-label="Special characters">
        {SPECIAL_CHARACTERS.map(({ char, name }) => (
          <button
            key={char}
            type="button"
            className="label-editor__char"
            title={name}
            aria-label={name}
            onClick={() => insert(char)}
          >
            {char}
          </button>
        ))}
      </div>
      <button type="button" className="button button-danger button-small" onClick={onDelete}>
        <Trash2 size={14} aria-hidden="true" /> Delete connector
      </button>
    </div>
  );
}

/** Keeps the quick editor at a constant screen size above the label, whatever the zoom (only it follows the zoom). */
function QuickEditorAnchor({ children }: { children: ReactNode }) {
  const zoom = useStore(zoomOf);
  return (
    <div className="label-editor-anchor nodrag nopan nowheel nokey" style={{ transform: `scale(${String(1 / zoom)})` }}>
      {children}
    </div>
  );
}

function InlineEditor({
  initial,
  style,
  onSave,
  onCancel,
}: {
  initial: string;
  style: CSSProperties;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      onCancel();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      field.current?.blur();
    }
  };
  return (
    <textarea
      ref={field}
      className="connector-label__field nodrag nopan nowheel nokey"
      aria-label="Label text"
      defaultValue={initial}
      maxLength={LABEL_TEXT_MAX}
      rows={Math.max(1, initial.split("\n").length)}
      style={style}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!cancelled.current) onSave(event.target.value);
      }}
    />
  );
}

export interface EdgeLabelProps {
  readonly edge: DiagramEdge;
  readonly position: Vec;
  /** Unit normal of the path at the label, so the "add label" button sits beside the path, clear of its handles. */
  readonly normal: Vec;
  readonly measure: PathMeasure;
  readonly selected: boolean;
  /** Hidden while a route handle is dragged, and until the reveal animation's line is halfway. */
  readonly hidden: boolean;
  /** The reveal phase of the connector: the label fades in when it reaches "labelling". */
  readonly phase?: ConnectorPhase;
  /** Shows the label at a dragged fraction (or back at its stored place with null). */
  readonly onSlide: (t: number | null) => void;
}

interface LabelPress {
  readonly start: Vec;
  moved: boolean;
  t: number | null;
}

/** Distance of the "add label" button from the path. */
const PENCIL_OFFSET = 24;

export function EdgeLabel({
  edge,
  position,
  normal,
  measure,
  selected,
  hidden,
  phase = "shown",
  onSlide,
}: EdgeLabelProps) {
  const api = useEditorStoreApi();
  const canEdit = useEditor((state) => state.canEdit);
  const mode = useEditor((state) => (state.labelEditing?.edgeId === edge.id ? state.labelEditing.mode : null));
  const { screenToFlowPosition } = useReactFlow();
  const clickTimer = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useLabelFade(box, phase);
  const text = edge.label?.text ?? "";
  const look = labelLook(edge.label);

  useEffect(
    () => () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    },
    [],
  );

  const save = (next: string) => {
    api.getState().stopLabelEdit();
    const trimmed = next.trim() === "" ? "" : next;
    if (trimmed === text) return;
    api.getState().updateEdges([edge.id], (current) => ({
      label: trimmed === "" && !current.label ? null : withLabelKeys(current.label, { text: trimmed }),
    }));
  };

  const drag = useHandleDrag<LabelPress>({
    start: (event) =>
      canEdit && mode !== "inline" ? { start: { x: event.clientX, y: event.clientY }, moved: false, t: null } : null,
    move: (press, client) => {
      if (!press.moved && distance(press.start, client) < DRAG_THRESHOLD) return;
      press.moved = true;
      const projection = projectOntoPath(measure, screenToFlowPosition(client));
      press.t = measure.total > 0 ? projection.length / measure.total : 0;
      onSlide(press.t);
    },
    end: (press) => {
      if (press.moved) {
        const t = press.t;
        onSlide(null);
        if (t !== null)
          api.getState().updateEdges([edge.id], (current) => ({
            label: withLabelKeys(current.label, { t: Math.round(t * 10_000) / 10_000 }),
          }));
        return;
      }
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
        api.getState().startLabelEdit(edge.id, "inline");
        return;
      }
      clickTimer.current = window.setTimeout(() => {
        clickTimer.current = null;
        api.getState().startLabelEdit(edge.id, "quick");
      }, DOUBLE_CLICK_MS);
    },
  });

  const textStyle: CSSProperties = {
    fontSize: look.fontSize,
    fontWeight: labelWeight(look),
    fontStyle: look.italic ? "italic" : "normal",
    textDecoration: look.underline ? "underline" : "none",
    textAlign: look.align,
    maxWidth: look.maxWidth,
    padding: look.padding,
    ...(look.color ? { color: look.color } : {}),
    ...(look.background ? { background: look.background } : {}),
    ...(look.border
      ? {
          borderStyle: "solid",
          borderWidth: look.borderWidth,
          borderRadius: 999,
          ...(look.borderColor ? { borderColor: look.borderColor } : {}),
        }
      : {}),
  };

  const empty = text === "";
  const showPencil = empty && canEdit && selected && mode === null;
  if (hidden || (empty && !showPencil && mode === null)) return null;

  return (
    <EdgeLabelRenderer>
      <div
        className="connector-label-anchor"
        style={{ transform: `translate(${String(position.x)}px, ${String(position.y)}px)` }}
      >
        {mode === "inline" ? (
          <InlineEditor
            initial={text}
            style={textStyle}
            onSave={save}
            onCancel={() => api.getState().stopLabelEdit()}
          />
        ) : showPencil ? (
          <button
            type="button"
            className="connector-label__pencil nodrag nopan"
            style={{ left: normal.x * PENCIL_OFFSET, top: normal.y * PENCIL_OFFSET }}
            aria-label="Add a label"
            onClick={() => api.getState().startLabelEdit(edge.id, "quick")}
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
        ) : (
          !empty && (
            <div
              ref={box}
              className={[
                "connector-label nodrag nopan",
                ...(selected ? ["connector-label--selected"] : []),
                ...(canEdit ? ["connector-label--editable"] : []),
              ].join(" ")}
              data-testid="connector-label"
              data-edge-id={edge.id}
              style={textStyle}
              {...drag}
            >
              {text}
            </div>
          )
        )}
        {mode === "quick" && (
          <QuickEditorAnchor>
            <QuickEditor
              edge={edge}
              onSave={save}
              onClose={() => api.getState().stopLabelEdit()}
              onDelete={() => {
                api.getState().stopLabelEdit();
                api.getState().deleteElements([], [edge.id]);
              }}
            />
          </QuickEditorAnchor>
        )}
      </div>
    </EdgeLabelRenderer>
  );
}
