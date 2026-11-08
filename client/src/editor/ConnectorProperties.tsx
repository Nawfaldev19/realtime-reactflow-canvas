import { useMemo } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  CornerDownRight,
  Italic,
  Layers,
  SendToBack,
  Spline,
  Underline,
  Waypoints,
  Route as RouteIcon,
} from "lucide-react";
import {
  EDGE_WIDTH,
  edgeLook,
  LABEL_BORDER_WIDTH,
  LABEL_FONT_SIZE,
  LABEL_MAX_WIDTH,
  LABEL_PADDING,
  labelLook,
  MARKER_SIZE,
  MARKERS,
  withLabelKeys,
  withStyleKeys,
  type EdgeLayer,
  type Marker,
} from "../document/connectorData";
import type { EdgeFields } from "../document/operations";
import {
  EDGE_KINDS,
  type DiagramEdge,
  type EdgeKind,
  type EdgeLabel,
  type RouteStyle,
  type TextAlignment,
} from "../document/types";
import { STROKE_PATTERNS, type StrokePattern } from "../geometry/dash";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";
import { ColorField, NumberField, PanelSection, SelectField } from "./fields";

// Every connector property in one place, applied to all selected connectors
// as one operation. Controls show the first selected connector's values.

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const ROUTE_STYLE_OPTIONS: readonly {
  readonly value: RouteStyle;
  readonly label: string;
  readonly Icon: typeof Spline;
}[] = [
  { value: "step", label: "Orthogonal step", Icon: CornerDownRight },
  { value: "polyline", label: "Polyline", Icon: Waypoints },
  { value: "spline", label: "Spline", Icon: Spline },
  { value: "bezier", label: "Bézier spline", Icon: RouteIcon },
];

export const EDGE_KIND_OPTIONS: readonly { readonly value: EdgeKind; readonly label: string }[] = EDGE_KINDS.map(
  (value) => ({
    value,
    label: value === "connector" ? "Editable" : "Floating",
  }),
);

const MARKER_OPTIONS = MARKERS.map((value) => ({
  value,
  label: value === "none" ? "None" : `${capitalize(value)} arrow`,
}));
const PATTERN_OPTIONS = STROKE_PATTERNS.map((value) => ({ value, label: capitalize(value) }));
const ALIGNS: readonly { value: TextAlignment; label: string; Icon: typeof Bold }[] = [
  { value: "left", label: "Align left", Icon: AlignLeft },
  { value: "center", label: "Align centre", Icon: AlignCenter },
  { value: "right", label: "Align right", Icon: AlignRight },
];
const LAYERS: readonly { value: EdgeLayer; label: string; Icon: typeof Bold }[] = [
  { value: "back", label: "Send to back", Icon: SendToBack },
  { value: "normal", label: "Normal layer", Icon: Layers },
  { value: "front", label: "Send to front", Icon: BringToFront },
];

type Update = (fieldsFor: (edge: DiagramEdge) => EdgeFields | null) => void;
type StylePatch = Readonly<Record<string, string | number | boolean | null>>;

function Toggle({
  label,
  pressed,
  onToggle,
  Icon,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  Icon: typeof Bold;
}) {
  return (
    <button
      type="button"
      className="button button-secondary button-icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function LabelSection({ first, update }: { first: DiagramEdge; update: Update }) {
  const look = labelLook(first.label);
  const label = (patch: Partial<EdgeLabel>) => update((edge) => ({ label: withLabelKeys(edge.label, patch) }));
  return (
    <PanelSection title="Label">
      <div className="row">
        <Toggle label="Bold" Icon={Bold} pressed={look.bold} onToggle={() => label({ bold: !look.bold })} />
        <Toggle label="Italic" Icon={Italic} pressed={look.italic} onToggle={() => label({ italic: !look.italic })} />
        <Toggle
          label="Underline"
          Icon={Underline}
          pressed={look.underline}
          onToggle={() => label({ underline: !look.underline })}
        />
        {ALIGNS.map(({ value, label: name, Icon }) => (
          <Toggle
            key={value}
            label={name}
            Icon={Icon}
            pressed={look.align === value}
            onToggle={() => label({ align: value })}
          />
        ))}
      </div>
      <div className="prop-grid">
        <NumberField
          label="Font size"
          value={look.fontSize}
          min={LABEL_FONT_SIZE.min}
          max={LABEL_FONT_SIZE.max}
          onCommit={(fontSize) => label({ fontSize })}
        />
        <NumberField
          label="Max width"
          value={look.maxWidth}
          min={LABEL_MAX_WIDTH.min}
          max={LABEL_MAX_WIDTH.max}
          onCommit={(maxWidth) => label({ maxWidth })}
        />
        <NumberField
          label="Padding"
          value={look.padding}
          min={LABEL_PADDING.min}
          max={LABEL_PADDING.max}
          onCommit={(padding) => label({ padding })}
        />
      </div>
      <ColorField
        label="Label text colour"
        value={look.color}
        fallback="#1c1b19"
        onCommit={(color) => label({ color: color ?? undefined })}
      />
      <ColorField
        label="Label background"
        value={look.background}
        fallback="#ffffff"
        onCommit={(background) => label({ background: background ?? undefined })}
      />
      <label className="prop-check">
        <input type="checkbox" checked={look.border} onChange={(event) => label({ border: event.target.checked })} />
        Border (pill)
      </label>
      {look.border && (
        <>
          <NumberField
            label="Border width"
            value={look.borderWidth}
            min={LABEL_BORDER_WIDTH.min}
            max={LABEL_BORDER_WIDTH.max}
            onCommit={(borderWidth) => label({ borderWidth })}
          />
          <ColorField
            label="Border colour"
            value={look.borderColor}
            fallback="#ddd5c8"
            onCommit={(borderColor) => label({ borderColor: borderColor ?? undefined })}
          />
        </>
      )}
    </PanelSection>
  );
}

function EdgeSelection({ ids }: { ids: readonly string[] }) {
  const api = useEditorStoreApi();
  const allEdges = useEditor((state) => state.doc.edges);
  const edges = useMemo(() => ids.map((id) => allEdges[id]).filter((edge) => edge !== undefined), [allEdges, ids]);
  const [first] = edges;
  if (!first) return null;
  const update: Update = (fieldsFor) => {
    api.getState().updateEdges(ids, fieldsFor);
  };
  const style = (patch: StylePatch) => update((edge) => ({ style: withStyleKeys(edge.style, patch) }));
  const look = edgeLook(first);
  const editable = edges.every((edge) => edge.kind === "connector");

  return (
    <>
      <h2 className="properties__title">{edges.length === 1 ? "Connector" : `${String(edges.length)} connectors`}</h2>
      <PanelSection title="Route">
        <SelectField<EdgeKind>
          label="Connector type"
          value={first.kind}
          options={EDGE_KIND_OPTIONS}
          onCommit={(kind) => update(() => ({ kind }))}
        />
        {editable && (
          <div className="row" role="group" aria-label="Route style">
            {ROUTE_STYLE_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                className="button button-secondary button-icon"
                aria-label={label}
                title={label}
                aria-pressed={first.route.style === value}
                onClick={() => api.getState().setRouteStyle(ids, value)}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </PanelSection>
      <PanelSection title="Line">
        <ColorField
          label="Line colour"
          value={look.color}
          fallback="#6b665e"
          onCommit={(stroke) => style({ stroke })}
        />
        <div className="prop-grid">
          <SelectField<StrokePattern>
            label="Pattern"
            value={look.pattern}
            options={PATTERN_OPTIONS}
            onCommit={(pattern) => style({ pattern })}
          />
          <NumberField
            label="Width"
            value={look.width}
            min={EDGE_WIDTH.min}
            max={EDGE_WIDTH.max}
            onCommit={(width) => style({ width })}
          />
        </div>
        <label className="prop-check">
          <input
            type="checkbox"
            checked={look.animated}
            disabled={look.pattern === "solid"}
            onChange={(event) => style({ animated: event.target.checked ? true : null })}
          />
          Animate (dotted and dashed lines)
        </label>
      </PanelSection>
      <PanelSection title="Arrows">
        <div className="prop-grid">
          <SelectField<Marker>
            label="Start arrow"
            value={look.startMarker}
            options={MARKER_OPTIONS}
            onCommit={(startMarker) => style({ startMarker })}
          />
          <SelectField<Marker>
            label="End arrow"
            value={look.endMarker}
            options={MARKER_OPTIONS}
            onCommit={(endMarker) => style({ endMarker })}
          />
          <NumberField
            label="Arrow size"
            value={look.markerSize}
            min={MARKER_SIZE.min}
            max={MARKER_SIZE.max}
            onCommit={(markerSize) => style({ markerSize })}
          />
        </div>
        <ColorField
          label="Start arrow colour"
          value={look.startMarkerColor}
          fallback="#6b665e"
          onCommit={(startMarkerColor) => style({ startMarkerColor })}
        />
        <ColorField
          label="End arrow colour"
          value={look.endMarkerColor}
          fallback="#6b665e"
          onCommit={(endMarkerColor) => style({ endMarkerColor })}
        />
      </PanelSection>
      <LabelSection first={first} update={update} />
      <PanelSection title="Layer">
        <div className="row">
          {LAYERS.map(({ value, label, Icon }) => (
            <Toggle
              key={value}
              label={label}
              Icon={Icon}
              pressed={look.layer === value}
              onToggle={() => style({ layer: value === "normal" ? null : value })}
            />
          ))}
        </div>
      </PanelSection>
    </>
  );
}

/** The connector section of the properties panel, keyed by the selection so pending edits apply to the connectors they were typed for. */
export function ConnectorProperties() {
  const ids = useEditor((state) => state.selectedEdgeIds);
  if (ids.length === 0) return null;
  return <EdgeSelection key={ids.join(" ")} ids={ids} />;
}
