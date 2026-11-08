import { useMemo, type MouseEvent } from "react";
import { ArrowDown, ArrowUp, BringToFront, Group, RotateCcw, RotateCw, SendToBack, Ungroup } from "lucide-react";
import { absoluteBox, canGroup } from "../document/groups";
import { lineResizeFields, lineRotationFields, rotateLineBy, snapLine } from "../document/lines";
import {
  BORDER_STYLES,
  BORDER_WIDTH,
  boxStyle,
  FONT_SIZE,
  LINE_STYLES,
  LINE_THICKNESS,
  lineProps,
  shapeOf,
  SKETCH_SIZE,
  sketchProps,
  textFormat,
  TEXT_ALIGNS,
  type BorderStyle,
  type TextAlign,
} from "../document/nodeData";
import { KIND_TRAITS } from "../document/nodeKinds";
import { absolutePosition, type NodeFields } from "../document/operations";
import type { DiagramNode, DocumentState } from "../document/types";
import type { ArrangeCommand } from "../document/zorder";
import { SHAPE_KINDS, type ShapeKind } from "../geometry/shapes";
import { clampSize } from "../geometry/sizing";
import { ConnectorProperties } from "./ConnectorProperties";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";
import { ColorField, NumberField, PanelSection, RangeField, SelectField } from "./fields";
import { sharedValue } from "./properties";

// Precise editing of the selected nodes. With several nodes selected each
// field shows the value they share, or is blank when they differ; editing a
// field applies it to all of them as one operation. Positions are absolute
// canvas coordinates, also for nodes inside groups.

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const BORDER_OPTIONS = BORDER_STYLES.map((value) => ({ value, label: capitalize(value) }));
const ALIGN_OPTIONS = TEXT_ALIGNS.map((value) => ({ value, label: value === "center" ? "Centre" : capitalize(value) }));
const SHAPE_OPTIONS = SHAPE_KINDS.map((value) => ({ value, label: capitalize(value) }));

const ARRANGE: readonly { command: ArrangeCommand; label: string; Icon: typeof ArrowUp }[] = [
  { command: "front", label: "Bring to front", Icon: BringToFront },
  { command: "forward", label: "Bring forward", Icon: ArrowUp },
  { command: "backward", label: "Send backward", Icon: ArrowDown },
  { command: "back", label: "Send to back", Icon: SendToBack },
];

type Update = (fieldsFor: (node: DiagramNode) => NodeFields | null) => void;

/** Style is replaced as one field, so a change merges into the node's current style; null removes a key. */
const withStyle = (node: DiagramNode, patch: Record<string, string | number | boolean | null>): NodeFields => {
  const merged = Object.entries({ ...node.style, ...patch }).filter(
    (entry): entry is [string, string | number | boolean] => entry[1] !== null,
  );
  return { style: Object.fromEntries(merged) };
};

function GeometrySection({
  doc,
  nodes,
  update,
}: {
  doc: DocumentState;
  nodes: readonly DiagramNode[];
  update: Update;
}) {
  const read = (key: "x" | "y" | "width" | "height") =>
    sharedValue(nodes, (node) => absoluteBox(doc, node.id)?.[key] ?? 0);
  const move = (axis: "x" | "y") => (value: number) =>
    update((node) => {
      const origin = node.parentId === null ? { x: 0, y: 0 } : absolutePosition(doc, node.parentId);
      return { position: { ...node.position, [axis]: value - origin[axis] } };
    });
  const resize = (dimension: "width" | "height") => (value: number) =>
    update((node) => {
      const { minSize } = KIND_TRAITS[node.kind];
      const size = clampSize(
        dimension === "width" ? value : node.size.width,
        dimension === "height" ? value : node.size.height,
        { minWidth: minSize.width, minHeight: minSize.height },
      );
      return node.kind === "line" ? lineResizeFields(node, { ...node.position, ...size }) : { size };
    });
  return (
    <PanelSection title="Size and position">
      <div className="prop-grid">
        <NumberField label="X" value={read("x")} onCommit={move("x")} />
        <NumberField label="Y" value={read("y")} onCommit={move("y")} />
        <NumberField label="W" value={read("width")} onCommit={resize("width")} min={1} />
        <NumberField label="H" value={read("height")} onCommit={resize("height")} min={1} />
      </div>
      <label className="prop-check">
        <input
          type="checkbox"
          checked={sharedValue(nodes, (node) => boxStyle(node).keepAspectRatio) === true}
          onChange={(event) =>
            update((node) => withStyle(node, { keepAspectRatio: event.target.checked ? true : null }))
          }
        />
        Keep aspect ratio
      </label>
    </PanelSection>
  );
}

function StyleSection({ nodes, update }: { nodes: readonly DiagramNode[]; update: Update }) {
  const isGroup = nodes.every((node) => node.kind === "group");
  return (
    <PanelSection title="Style">
      <ColorField
        label="Fill"
        value={sharedValue(nodes, (node) => boxStyle(node).fill)}
        fallback="#ffffff"
        onCommit={(fill) => update((node) => withStyle(node, { fill }))}
      />
      <ColorField
        label="Border colour"
        value={sharedValue(nodes, (node) => boxStyle(node).stroke)}
        fallback="#ddd5c8"
        onCommit={(stroke) => update((node) => withStyle(node, { stroke }))}
      />
      <div className="prop-grid">
        <NumberField
          label="Border width"
          value={sharedValue(nodes, (node) => boxStyle(node).borderWidth ?? 1)}
          min={BORDER_WIDTH.min}
          max={BORDER_WIDTH.max}
          onCommit={(borderWidth) => update((node) => withStyle(node, { borderWidth }))}
        />
        <SelectField<BorderStyle>
          label="Border style"
          value={sharedValue(nodes, (node) => boxStyle(node).borderStyle ?? "solid")}
          options={BORDER_OPTIONS}
          onCommit={(borderStyle) => update((node) => withStyle(node, { borderStyle }))}
        />
      </div>
      {isGroup && (
        <RangeField
          label="Background opacity"
          value={sharedValue(nodes, (node) => boxStyle(node).opacity) ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          format={(value) => `${String(Math.round(value * 100))}%`}
          onCommit={(opacity) => update((node) => withStyle(node, { opacity }))}
        />
      )}
    </PanelSection>
  );
}

function TextSection({ nodes, update }: { nodes: readonly DiagramNode[]; update: Update }) {
  const bold = sharedValue(nodes, (node) => textFormat(node).bold) === true;
  const italic = sharedValue(nodes, (node) => textFormat(node).italic) === true;
  return (
    <PanelSection title="Text">
      <div className="row">
        <button
          type="button"
          className="button button-secondary button-small"
          aria-pressed={bold}
          onClick={() => update((node) => withStyle(node, { fontWeight: bold ? "normal" : "bold" }))}
        >
          <strong>Bold</strong>
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          aria-pressed={italic}
          onClick={() => update((node) => withStyle(node, { fontStyle: italic ? "normal" : "italic" }))}
        >
          <em>Italic</em>
        </button>
      </div>
      <div className="prop-grid">
        <SelectField<TextAlign>
          label="Align"
          value={sharedValue(nodes, (node) => textFormat(node).align)}
          options={ALIGN_OPTIONS}
          onCommit={(textAlign) => update((node) => withStyle(node, { textAlign }))}
        />
        <NumberField
          label="Font size"
          value={sharedValue(nodes, (node) => textFormat(node).fontSize)}
          min={FONT_SIZE.min}
          max={FONT_SIZE.max}
          onCommit={(fontSize) => update((node) => withStyle(node, { fontSize }))}
        />
      </div>
      <ColorField
        label="Text colour"
        value={sharedValue(nodes, (node) => textFormat(node).color)}
        fallback="#1c1b19"
        onCommit={(color) => update((node) => withStyle(node, { color }))}
      />
    </PanelSection>
  );
}

function LineSection({ node, update }: { node: DiagramNode; update: Update }) {
  const { rotation, thickness, lineStyle, color } = lineProps(node);
  const rotateBy = (degrees: number) => (event: MouseEvent) =>
    update((current) => rotateLineBy(current, event.shiftKey ? Math.sign(degrees) : degrees));
  const data = (patch: Record<string, unknown>) => update(() => ({ data: patch }));
  return (
    <PanelSection title="Line">
      <RangeField
        label="Rotation"
        value={Math.round(rotation)}
        min={0}
        max={359}
        marks={[0, 90, 180, 270]}
        format={(value) => `${String(value)}°`}
        onCommit={(angle) => update((current) => lineRotationFields(current, angle))}
      />
      <NumberField
        label="Angle"
        value={Math.round(rotation * 10) / 10}
        min={-360}
        max={720}
        suffix="°"
        onCommit={(angle) => update((current) => lineRotationFields(current, angle))}
      />
      <div className="row">
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => update((current) => rotateLineBy(current, -45))}
        >
          −45°
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={rotateBy(-5)}
          title="Rotate 5° left (Shift: 1°)"
        >
          <RotateCcw size={14} aria-hidden="true" /> 5°
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={rotateBy(5)}
          title="Rotate 5° right (Shift: 1°)"
        >
          <RotateCw size={14} aria-hidden="true" /> 5°
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => update((current) => rotateLineBy(current, 45))}
        >
          +45°
        </button>
      </div>
      <div className="row">
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => update((current) => snapLine(current, "vertical"))}
        >
          Snap vertical
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => update((current) => snapLine(current, "horizontal"))}
        >
          Snap horizontal
        </button>
      </div>
      <RangeField
        label="Thickness"
        value={thickness}
        min={LINE_THICKNESS.min}
        max={LINE_THICKNESS.max}
        onCommit={(value) => data({ thickness: value })}
      />
      <SelectField
        label="Line style"
        value={lineStyle}
        options={BORDER_OPTIONS.filter((option) => LINE_STYLES.includes(option.value))}
        onCommit={(value) => data({ lineStyle: value })}
      />
      <ColorField
        label="Line colour"
        value={color}
        fallback="#1c1b19"
        onCommit={(value) => data({ color: value ?? undefined })}
      />
    </PanelSection>
  );
}

function SketchSection({ node, update }: { node: DiagramNode; update: Update }) {
  const { color, strokeSize } = sketchProps(node);
  return (
    <PanelSection title="Ink">
      <ColorField
        label="Ink colour"
        value={color}
        fallback="#1c1b19"
        onCommit={(value) => update(() => ({ data: { color: value ?? undefined } }))}
      />
      <RangeField
        label="Stroke width"
        value={strokeSize}
        min={SKETCH_SIZE.min}
        max={SKETCH_SIZE.max}
        onCommit={(value) => update(() => ({ data: { strokeSize: value } }))}
      />
    </PanelSection>
  );
}

function ArrangeSection({ doc, ids }: { doc: DocumentState; ids: readonly string[] }) {
  const api = useEditorStoreApi();
  const groupCheck = canGroup(doc, ids);
  const hasGroup = ids.some((id) => doc.nodes[id]?.kind === "group");
  return (
    <PanelSection title="Arrange">
      <div className="row">
        {ARRANGE.map(({ command, label, Icon }) => (
          <button
            key={command}
            type="button"
            className="button button-secondary button-icon"
            aria-label={label}
            title={label}
            onClick={() => api.getState().arrangeSelection(command)}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="row">
        {ids.length > 1 && (
          <button
            type="button"
            className="button button-secondary button-small"
            disabled={!groupCheck.ok}
            title={groupCheck.ok ? "Group the selected nodes" : groupCheck.reason}
            onClick={() => api.getState().groupSelection()}
          >
            <Group size={14} aria-hidden="true" /> Group
          </button>
        )}
        {hasGroup && (
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => api.getState().ungroupSelection()}
          >
            <Ungroup size={14} aria-hidden="true" /> Ungroup
          </button>
        )}
      </div>
      {ids.length > 1 && !groupCheck.ok && <p className="field-hint">{groupCheck.reason}</p>}
    </PanelSection>
  );
}

function SelectionProperties({ doc, ids }: { doc: DocumentState; ids: readonly string[] }) {
  const api = useEditorStoreApi();
  const nodes = useMemo(() => ids.map((id) => doc.nodes[id]).filter((node) => node !== undefined), [doc, ids]);
  const update: Update = (fieldsFor) => {
    api.getState().updateNodes(ids, fieldsFor);
  };
  const [only] = nodes;
  if (!only) return null;
  const single = nodes.length === 1 ? only : null;
  const kinds = new Set(nodes.map((node) => node.kind));
  const styled = nodes.every((node) => KIND_TRAITS[node.kind].boxStyle);
  const texted = nodes.every((node) => KIND_TRAITS[node.kind].hasText);
  const shapes = nodes.every((node) => node.kind === "shape");

  return (
    <>
      <h2 className="properties__title">
        {single ? `${KIND_TRAITS[single.kind].label} ${String(single.number)}` : `${String(nodes.length)} nodes`}
      </h2>
      <GeometrySection doc={doc} nodes={nodes} update={update} />
      {shapes && (
        <PanelSection title="Shape">
          <SelectField<ShapeKind>
            label="Outline"
            value={sharedValue(nodes, (node) => shapeOf(node))}
            options={SHAPE_OPTIONS}
            onCommit={(shape) => update(() => ({ data: { shape } }))}
          />
        </PanelSection>
      )}
      {styled && <StyleSection nodes={nodes} update={update} />}
      {texted && <TextSection nodes={nodes} update={update} />}
      {single?.kind === "line" && <LineSection node={single} update={update} />}
      {single?.kind === "sketch" && kinds.size === 1 && <SketchSection node={single} update={update} />}
      <ArrangeSection doc={doc} ids={ids} />
    </>
  );
}

export function PropertiesPanel() {
  const canEdit = useEditor((state) => state.canEdit);
  const doc = useEditor((state) => state.doc);
  const ids = useEditor((state) => state.selectedNodeIds);
  const edgeCount = useEditor((state) => state.selectedEdgeIds.length);
  if (!canEdit) return null;
  return (
    <aside className="properties" aria-label="Properties">
      {ids.length === 0 && edgeCount === 0 && (
        <p className="properties__empty">
          Select a node or a connector to edit its size, style, text and stacking order.
        </p>
      )}
      {/* Remount per selection, so a pending field edit always applies to the nodes it was typed for. */}
      {ids.length > 0 && <SelectionProperties key={ids.join(" ")} doc={doc} ids={ids} />}
      <ConnectorProperties />
    </aside>
  );
}
