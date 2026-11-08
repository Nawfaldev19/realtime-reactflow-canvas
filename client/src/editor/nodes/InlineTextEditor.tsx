import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronsUpDown } from "lucide-react";
import { nodeText, textFormat } from "../../document/nodeData";
import { KIND_TRAITS } from "../../document/nodeKinds";
import type { DiagramNode } from "../../document/types";
import { centredOffset } from "../../geometry/shapes";
import { fitHeight, grownHeight, isOverflowing } from "../../geometry/sizing";
import { readEditableText } from "../editableText";
import { useEditor, useEditorStoreApi } from "../EditorStoreContext";

// A node's text, shown or edited in place.
//
// - Double-click (or Enter on a focused node) edits it. The editor focuses
//   and selects all; Escape or clicking outside ends editing. Keystrokes
//   only update a draft; ending the edit commits the text and any grown
//   height as one operation.
// - Auto height: one ResizeObserver watches the content. While editing, a
//   node whose content becomes taller grows to content + 17px and never
//   shrinks on its own. When not editing, an overflowing node shows a fit
//   button that sets the height to exactly fit, growing or shrinking.
// - In "shape" layout the text flows between two float guides (passed as
//   `guides`) and is centred vertically with a top margin.

export type TextLayout = "box" | "shape" | "title";

interface InlineTextEditorProps {
  readonly node: DiagramNode;
  /** Vertical space around the content: padding plus borders. */
  readonly chrome: number;
  readonly layout?: TextLayout;
  readonly guides?: ReactNode;
  /** An SVG path the text is clipped to, so no glyph ever renders outside a shape's outline. */
  readonly clip?: string;
}

const MOD_SHORTCUTS: Readonly<Record<string, (node: DiagramNode) => Record<string, string>>> = {
  b: (node) => ({ fontWeight: textFormat(node).bold ? "normal" : "bold" }),
  i: (node) => ({ fontStyle: textFormat(node).italic ? "normal" : "italic" }),
};

export function InlineTextEditor({ node, chrome, layout = "box", guides, clip }: InlineTextEditorProps) {
  const api = useEditorStoreApi();
  const editing = useEditor((state) => state.editingNodeId === node.id);
  const canEdit = useEditor((state) => state.canEdit);
  const content = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const { autoHeight, placeholder, minSize } = KIND_TRAITS[node.kind];
  const text = nodeText(node);
  const format = textFormat(node);
  const { width, height } = node.size;
  const measure = autoHeight || layout === "shape";

  useEffect(() => {
    const element = content.current;
    if (!measure || !element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setContentHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, editing]);

  // Grow while editing; never shrink on its own.
  useEffect(() => {
    if (!editing || !autoHeight || contentHeight === null) return;
    const grown = grownHeight(contentHeight, chrome, height);
    if (grown !== null) api.getState().setLive({ [node.id]: { size: { width, height: grown } } });
  }, [api, autoHeight, chrome, contentHeight, editing, height, node.id, width]);

  // Entering the editor: show the stored text, focus and select it all. Only
  // on entering: later prop changes must not reset the content or move the caret.
  const latestText = useRef(text);
  useLayoutEffect(() => {
    latestText.current = text;
  });
  useLayoutEffect(() => {
    const element = content.current;
    if (!editing || !element) return;
    element.textContent = latestText.current;
    element.focus();
    window.getSelection()?.selectAllChildren(element);
  }, [editing]);

  const finish = () => api.getState().finishEditing();
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    const shortcut = MOD_SHORTCUTS[event.key.toLowerCase()];
    if (shortcut && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      api.getState().updateNodes([node.id], (current) => ({ style: { ...current.style, ...shortcut(current) } }));
    }
  };

  const textStyle: CSSProperties = {
    textAlign: format.align,
    fontWeight: format.bold ? 600 : 400,
    fontStyle: format.italic ? "italic" : "normal",
    fontSize: format.fontSize,
    ...(format.color ? { color: format.color } : {}),
    ...(layout === "shape" && contentHeight !== null ? { marginTop: centredOffset(height, contentHeight) } : {}),
  };
  const overflowing = contentHeight !== null && autoHeight && isOverflowing(contentHeight, chrome, height);
  const showPlaceholder = !editing && text === "" && canEdit;

  return (
    <>
      <div className={`node-text node-text--${layout}`} style={clip ? { clipPath: `path("${clip}")` } : undefined}>
        {guides}
        {editing ? (
          <div
            ref={content}
            className="node-text__content node-text__editor nodrag nopan nowheel nokey"
            style={textStyle}
            contentEditable="plaintext-only"
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={`${KIND_TRAITS[node.kind].label} text`}
            onInput={(event) => api.getState().setEditDraft(readEditableText(event.currentTarget))}
            onBlur={finish}
            onKeyDown={onKeyDown}
          />
        ) : (
          <div
            ref={content}
            className={showPlaceholder ? "node-text__content node-text__placeholder" : "node-text__content"}
            style={textStyle}
          >
            {showPlaceholder ? placeholder : text}
          </div>
        )}
      </div>
      {overflowing && !editing && canEdit && (
        <button
          type="button"
          className="node-fit nodrag nopan"
          aria-label="Fit height to text"
          title="Fit height to text"
          onClick={() =>
            api.getState().updateNodes([node.id], () => ({
              size: { width, height: fitHeight(contentHeight, chrome, minSize.height) },
            }))
          }
        >
          <ChevronsUpDown size={14} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
