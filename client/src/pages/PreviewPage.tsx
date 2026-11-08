import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { ReactFlowProvider } from "@xyflow/react";
import { ArrowLeft, Pencil } from "lucide-react";
import { ErrorState, SkeletonBlock } from "../components/States";
import { EditorStoreProvider, useEditor, useEditorStoreApi } from "../editor/EditorStoreContext";
import { ExportButton } from "../export/ExportDialog";
import { DIAGRAM } from "../graphql/operations";
import type { DiagramQuery } from "../graphql/generated/graphql";
import { PreviewCanvas } from "../preview/PreviewCanvas";
import { useReveal } from "../preview/useReveal";
import { useNavigationMode } from "../view/useNavigationMode";
import { useViewChrome } from "../view/useViewChrome";
import "@xyflow/react/dist/style.css";

// The read-only presentation of a diagram: the opening view the author chose,
// the build-up animation when it is switched on, view controls and export.
// The diagram is fetched again whenever the window regains focus, so the
// preview follows saved changes; a refetch updates the drawing but never
// replays the animation.

type LoadedDiagram = DiagramQuery["diagram"];

function PreviewSession({ diagram }: { diagram: LoadedDiagram }) {
  const api = useEditorStoreApi();
  // Loaded read-only before the first render, so the opening view and the animation plan see the diagram.
  const loaded = useRef<LoadedDiagram | null>(null);
  useState(() => {
    loaded.current = diagram;
    api.getState().load({ ...diagram, canEdit: false });
  });
  useEffect(() => {
    if (loaded.current === diagram) return;
    loaded.current = diagram;
    api.getState().load({ ...diagram, canEdit: false });
  }, [api, diagram]);

  const navigation = useNavigationMode(diagram.workspace.navigationMode);
  const doc = useEditor((state) => state.doc);
  const openingView = useEditor((state) => state.viewSettings.openingView);
  const animateOnOpen = useEditor((state) => state.viewSettings.animateOnOpen);
  const view = useViewChrome({ context: "preview", mode: navigation.mode, doc, openingView });
  const reveal = useReveal(doc, { enabled: animateOnOpen, ready: view.opened });

  return (
    <div className="editor preview">
      <header className="editor-header">
        <Link to={`/app/w/${diagram.workspace.id}`} className="button button-ghost">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{diagram.workspace.name}</span>
        </Link>
        <div className="diagram-title">
          <h1>{diagram.title}</h1>
        </div>
        <span className="badge">Preview</span>
        <div className="editor-tools">
          <ExportButton beforeCapture={reveal.skip} />
          {diagram.canEdit && (
            <Link to={`/app/d/${diagram.id}`} className="button button-secondary">
              <Pencil size={16} aria-hidden="true" /> Edit
            </Link>
          )}
        </div>
      </header>
      <div className="editor-body">
        <PreviewCanvas
          view={view}
          reveal={reveal}
          navigationMode={navigation.mode}
          onNavigationMode={navigation.setMode}
        />
      </div>
    </div>
  );
}

export function PreviewPage() {
  const { diagramId = "" } = useParams();
  const { data, error, refetch } = useQuery(DIAGRAM, {
    variables: { id: diagramId },
    fetchPolicy: "network-only",
    nextFetchPolicy: "cache-first",
  });

  useEffect(() => {
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) {
    return (
      <div role="status" className="main">
        <span className="visually-hidden">Loading the preview</span>
        <SkeletonBlock height="60vh" />
      </div>
    );
  }
  return (
    <EditorStoreProvider key={data.diagram.id}>
      <ReactFlowProvider>
        <PreviewSession diagram={data.diagram} />
      </ReactFlowProvider>
    </EditorStoreProvider>
  );
}
