import type { NodeKind, Size } from "./types";

// One table describes what each node kind can do. Bodies, the flow adapter,
// the properties panel and the connection rules all read it, so a new kind
// plugs in by adding a row and a body component.

export interface KindTraits {
  readonly label: string;
  /** Has the four connection handles and can be an edge endpoint. */
  readonly connectable: boolean;
  /** Holds editable text (double-click or Enter to edit). */
  readonly hasText: boolean;
  /** Grows while its text is edited and offers the fit-height button. */
  readonly autoHeight: boolean;
  readonly minSize: Size;
  /** Shown while the text is empty. */
  readonly placeholder: string;
  /** Box border and fill can be styled. */
  readonly boxStyle: boolean;
}

const box = (label: string, overrides: Partial<KindTraits> = {}): KindTraits => ({
  label,
  connectable: true,
  hasText: true,
  autoHeight: true,
  minSize: { width: 25, height: 25 },
  placeholder: "",
  boxStyle: true,
  ...overrides,
});

export const KIND_TRAITS: Readonly<Record<NodeKind, KindTraits>> = {
  step: box("Step", { placeholder: "Untitled step" }),
  decision: box("Decision", { minSize: { width: 40, height: 40 }, placeholder: "Decide?" }),
  "start-end": box("Start or end", { placeholder: "Start" }),
  note: box("Sticky note", { connectable: false, placeholder: "Write a note" }),
  label: box("Text label", { connectable: false, placeholder: "Untitled text" }),
  shape: box("Shape", { minSize: { width: 40, height: 40 } }),
  line: box("Line", {
    connectable: false,
    hasText: false,
    autoHeight: false,
    minSize: { width: 20, height: 20 },
    boxStyle: false,
  }),
  sketch: box("Sketch", {
    connectable: false,
    hasText: false,
    autoHeight: false,
    minSize: { width: 10, height: 10 },
    boxStyle: false,
  }),
  group: box("Group", { autoHeight: false, minSize: { width: 60, height: 60 }, placeholder: "Group" }),
};

/** Corner radius in pixels. A start/end pill always uses half its height, so its ends stay round. */
export function cornerRadius(kind: NodeKind, height: number): number {
  switch (kind) {
    case "start-end":
      return height / 2;
    case "note":
    case "label":
      return 4;
    case "step":
    case "group":
      return 8;
    default:
      return 0;
  }
}
