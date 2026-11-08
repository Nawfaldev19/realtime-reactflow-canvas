import type { Marker } from "../../document/connectorData";

// Arrowheads drawn inside each connector's own SVG group, so their fill can
// follow the connector's current colour (including the accent on hover and
// selection) through `currentColor`. The start marker uses the reversed
// orientation, so both arrows point away from the line.

interface MarkerDefProps {
  readonly id: string;
  readonly marker: Marker;
  readonly size: number;
  readonly color: string | null;
}

export function MarkerDef({ id, marker, size, color }: MarkerDefProps) {
  if (marker === "none") return null;
  const paint = color ?? "currentColor";
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={10}
      refY={5}
      markerWidth={size}
      markerHeight={size}
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
      className="connector__marker"
    >
      {marker === "closed" ? (
        <path d="M 0 0 L 10 5 L 0 10 Z" fill={paint} stroke="none" />
      ) : (
        <path
          d="M 1 1 L 9.5 5 L 1 9"
          fill="none"
          stroke={paint}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </marker>
  );
}

export const markerUrl = (id: string, marker: Marker): string | undefined =>
  marker === "none" ? undefined : `url(#${id})`;
