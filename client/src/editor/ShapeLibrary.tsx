import { useMemo, useState, type DragEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { PanelLeftClose, Shapes } from "lucide-react";
import { DEFAULT_SIZES } from "../document/factory";
import { LIBRARY, SHAPE_DRAG_TYPE, encodeLibraryPayload, filterLibrary, type LibraryItem } from "../document/library";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";
import { ShapePreview } from "./ShapePreview";

// The shape library drawer on the left of the canvas. Items are dragged onto
// the canvas with the browser's drag and drop (our own data type, so other
// drops are ignored); the new step's top-left lands at the drop point. Items
// are also buttons: Enter or a click adds the item at the centre of the view.
// The drag-and-drop wiring follows the React Flow drag-and-drop example (MIT).

export function ShapeLibrary() {
  const api = useEditorStoreApi();
  const canEdit = useEditor((state) => state.canEdit);
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const sections = useMemo(() => filterLibrary(LIBRARY, filter), [filter]);
  const { screenToFlowPosition } = useReactFlow();
  if (!canEdit) return null;

  const addAtCentre = (item: LibraryItem) => {
    const pane = document.querySelector(".editor-canvas")?.getBoundingClientRect();
    const centre = pane
      ? screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 })
      : { x: 0, y: 0 };
    const size = DEFAULT_SIZES[item.kind];
    api
      .getState()
      .addFromLibrary(item, { x: Math.round(centre.x - size.width / 2), y: Math.round(centre.y - size.height / 2) });
  };
  const onDragStart = (item: LibraryItem) => (event: DragEvent) => {
    event.dataTransfer.setData(SHAPE_DRAG_TYPE, encodeLibraryPayload(item));
    event.dataTransfer.effectAllowed = "move";
  };

  if (!open) {
    return (
      <div className="library-rail">
        <button
          type="button"
          className="button button-ghost library-rail__tab"
          aria-expanded={false}
          aria-controls="shape-library"
          onClick={() => setOpen(true)}
        >
          <Shapes size={16} aria-hidden="true" />
          <span>Shapes</span>
        </button>
      </div>
    );
  }

  return (
    <aside id="shape-library" className="library" aria-label="Shape library">
      <div className="library__header">
        <h2 className="library__title">Shapes</h2>
        <button
          type="button"
          className="button button-ghost button-icon"
          aria-label="Hide shapes"
          aria-expanded
          onClick={() => setOpen(false)}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
        </button>
      </div>
      <input
        className="input input-compact"
        type="search"
        aria-label="Filter shapes"
        placeholder="Filter shapes"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {sections.length === 0 && <p className="field-hint">No shapes match.</p>}
      {sections.map((section) => (
        <section key={section.title} className="library__section" aria-label={section.title}>
          <h3 className="library__section-title">{section.title}</h3>
          <ul className="library__items">
            {section.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="library-item"
                  draggable
                  title={`${item.description} Drag to the canvas, or press Enter to add it.`}
                  onDragStart={onDragStart(item)}
                  onClick={() => addAtCentre(item)}
                >
                  <ShapePreview item={item} />
                  <span className="library-item__name">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
