import type { MouseEvent } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Copy,
  Group,
  Magnet,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  RotateCw,
  Trash2,
  Ungroup,
} from "lucide-react";
import { arrangeable } from "../document/alignment";
import { absoluteBox, canGroup } from "../document/groups";
import { rotateLineBy, snapLine } from "../document/lines";
import type { DocumentState } from "../document/types";
import type { LineUpCommand } from "../geometry/align";
import { useEditorShallow, useEditorStoreApi } from "./EditorStoreContext";

// A compact toolbar floating above the selection: justify and align, spread
// evenly, group and ungroup, line rotation, "snap only to this step",
// duplicate and delete. Only one toolbar is shown, attached to the selected
// node nearest the top. It hides while a node is dragged or edited, and for
// viewers.

type Icon = typeof Copy;

const LINE_UP: readonly { command: LineUpCommand; label: string; Icon: Icon }[] = [
  { command: "left", label: "Justify left", Icon: AlignStartVertical },
  { command: "centre", label: "Justify centre", Icon: AlignCenterVertical },
  { command: "right", label: "Justify right", Icon: AlignEndVertical },
  { command: "top", label: "Align top", Icon: AlignStartHorizontal },
  { command: "middle", label: "Align middle", Icon: AlignCenterHorizontal },
  { command: "bottom", label: "Align bottom", Icon: AlignEndHorizontal },
];

/** The selected node nearest the top (then the left), where the toolbar attaches. */
export function topmostNode(doc: DocumentState, ids: readonly string[]): string | null {
  let best: { id: string; y: number; x: number } | null = null;
  for (const id of ids) {
    const box = absoluteBox(doc, id);
    if (box && (!best || box.y < best.y || (box.y === best.y && box.x < best.x))) best = { id, y: box.y, x: box.x };
  }
  return best?.id ?? null;
}

function ToolButton({
  label,
  Icon,
  onClick,
  pressed,
  disabled = false,
}: {
  label: string;
  Icon: Icon;
  onClick: (event: MouseEvent) => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="selection-toolbar__button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

export function SelectionToolbar() {
  const api = useEditorStoreApi();
  const { doc, ids, hidden, referenceId } = useEditorShallow((state) => ({
    doc: state.doc,
    ids: state.selectedNodeIds,
    hidden:
      !state.canEdit || state.editingNodeId !== null || Object.keys(state.dragPositions).length > 0 || state.drawMode,
    referenceId: state.snapping.referenceId,
  }));
  const anchor = topmostNode(doc, ids);
  if (hidden || anchor === null) return null;

  const movable = arrangeable(doc, ids).length;
  const groupCheck = canGroup(doc, ids);
  const hasGroup = ids.some((id) => doc.nodes[id]?.kind === "group");
  const [only] = ids;
  const single = ids.length === 1 && only !== undefined ? doc.nodes[only] : undefined;
  const run = (action: () => unknown) => () => {
    action();
  };
  const state = () => api.getState();
  const rotate = (degrees: number) => (event: MouseEvent) => {
    state().updateNodes(ids, (node) =>
      node.kind === "line" ? rotateLineBy(node, event.shiftKey ? Math.sign(degrees) : degrees) : null,
    );
  };

  return (
    <NodeToolbar nodeId={anchor} isVisible position={Position.Top} offset={14}>
      <div className="selection-toolbar nodrag nopan" role="toolbar" aria-label="Selection tools">
        {movable >= 2 && (
          <div className="selection-toolbar__group" role="group" aria-label="Align">
            {LINE_UP.map(({ command, label, Icon }) => (
              <ToolButton
                key={command}
                label={label}
                Icon={Icon}
                onClick={run(() => state().lineUpSelection(command))}
              />
            ))}
          </div>
        )}
        {movable >= 3 && (
          <div className="selection-toolbar__group" role="group" aria-label="Distribute">
            <ToolButton
              label="Distribute horizontally"
              Icon={AlignHorizontalDistributeCenter}
              onClick={run(() => state().distributeSelection("horizontal"))}
            />
            <ToolButton
              label="Distribute vertically"
              Icon={AlignVerticalDistributeCenter}
              onClick={run(() => state().distributeSelection("vertical"))}
            />
          </div>
        )}
        {(ids.length >= 2 || hasGroup) && (
          <div className="selection-toolbar__group" role="group" aria-label="Group">
            {ids.length >= 2 && (
              <ToolButton
                label={groupCheck.ok ? "Group" : groupCheck.reason}
                Icon={Group}
                disabled={!groupCheck.ok}
                onClick={run(() => state().groupSelection())}
              />
            )}
            {hasGroup && <ToolButton label="Ungroup" Icon={Ungroup} onClick={run(() => state().ungroupSelection())} />}
          </div>
        )}
        {single?.kind === "line" && (
          <div className="selection-toolbar__group" role="group" aria-label="Line">
            <ToolButton
              label="Snap vertical"
              Icon={MoveVertical}
              onClick={run(() => state().updateNodes(ids, (node) => snapLine(node, "vertical")))}
            />
            <ToolButton
              label="Snap horizontal"
              Icon={MoveHorizontal}
              onClick={run(() => state().updateNodes(ids, (node) => snapLine(node, "horizontal")))}
            />
            <ToolButton label="Rotate 5° left (Shift: 1°)" Icon={RotateCcw} onClick={rotate(-5)} />
            <ToolButton label="Rotate 5° right (Shift: 1°)" Icon={RotateCw} onClick={rotate(5)} />
          </div>
        )}
        <div className="selection-toolbar__group" role="group" aria-label="Edit">
          {single && (
            <ToolButton
              label="Snap only to this step"
              Icon={Magnet}
              pressed={referenceId === single.id}
              onClick={run(() => state().setSnapping({ referenceId: referenceId === single.id ? null : single.id }))}
            />
          )}
          <ToolButton label="Duplicate" Icon={Copy} onClick={run(() => state().duplicateSelection())} />
          <ToolButton label="Delete" Icon={Trash2} onClick={run(() => state().deleteSelection())} />
        </div>
      </div>
    </NodeToolbar>
  );
}
