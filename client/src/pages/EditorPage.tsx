import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApolloClient, useQuery } from "@apollo/client";
import { ReactFlowProvider } from "@xyflow/react";
import { ArrowLeft, History, Play, SlidersHorizontal } from "lucide-react";
import { CollaborationToggle } from "../editor/CollaborationToggle";
import { PresenceBar } from "../editor/PresenceBar";
import { CollabClientProvider, useCollaboration } from "../editor/useCollaboration";
import { ErrorState, SkeletonBlock } from "../components/States";
import { DiagramCanvas } from "../editor/Canvas";
import { DiagramTitle } from "../editor/DiagramTitle";
import { EditorBanners } from "../editor/EditorBanners";
import { EditorStoreProvider, useEditorStoreApi } from "../editor/EditorStoreContext";
import { EditorToolbar } from "../editor/EditorToolbar";
import { HistoryButtons } from "../editor/HistoryButtons";
import { PropertiesPanel } from "../editor/PropertiesPanel";
import { SaveStatusLabel } from "../editor/SaveStatusLabel";
import { ShapeLibrary } from "../editor/ShapeLibrary";
import { useAutosave } from "../editor/useAutosave";
import { useEditorShortcuts } from "../editor/useEditorShortcuts";
import { useViewSettingsSave } from "../editor/useViewSettingsSave";
import { CompareView } from "../editor/versions/CompareView";
import { usePeriodicVersions } from "../editor/versions/usePeriodicVersions";
import { useVersionHistory } from "../editor/versions/useVersionHistory";
import { VersionPanel } from "../editor/versions/VersionPanel";
import type { VersionSummary } from "../editor/versions/versionList";
import { ExportButton } from "../export/ExportDialog";
import { useNavigationMode } from "../view/useNavigationMode";
import { ViewMenu } from "../view/ViewMenu";
import { DIAGRAM } from "../graphql/operations";
import { useSession } from "../lib/session";
import type { DiagramQuery } from "../graphql/generated/graphql";
import "@xyflow/react/dist/style.css";

type LoadedDiagram = DiagramQuery["diagram"];

function EditorSession({ diagram }: { diagram: LoadedDiagram }) {
  const api = useEditorStoreApi();
  const client = useApolloClient();
  // Load once per session; later cache updates (for example a new revision
  // after a save) must not replace the document being edited.
  useState(() => {
    api.getState().load(diagram);
  });
  const autosave = useAutosave(api, diagram.id);
  const collab = useCollaboration(api, autosave.flush);
  const flushViewSettings = useViewSettingsSave(api, diagram.id);
  useEditorShortcuts(api);
  const { rememberWorkspace } = useSession();
  const navigation = useNavigationMode(diagram.workspace.navigationMode);
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [comparing, setComparing] = useState<VersionSummary | null>(null);

  // Versions are taken of the stored diagram, so what is still waiting is stored first.
  const whenStored = useCallback(async () => {
    await Promise.all([autosave.flush(), collab?.whenSynced()]);
  }, [autosave, collab]);
  const history = useVersionHistory(api, diagram.id, whenStored, historyOpen);
  const { save: saveVersion } = history;
  const saveAutomaticVersion = useCallback(() => saveVersion(null, true), [saveVersion]);
  const versionCaptured = usePeriodicVersions(api, saveAutomaticVersion);

  // The preview reads the saved diagram, so everything waiting is saved first.
  const openPreview = async () => {
    setOpening(true);
    await Promise.all([autosave.flush(), collab?.whenSynced(), flushViewSettings()]);
    void navigate(`/app/d/${diagram.id}/preview`);
  };

  useEffect(() => {
    rememberWorkspace(diagram.workspace.id);
  }, [rememberWorkspace, diagram.workspace.id]);

  const loadLatest = useCallback(async () => {
    const { data } = await client.query({ query: DIAGRAM, variables: { id: diagram.id }, fetchPolicy: "network-only" });
    api.getState().load(data.diagram);
    autosave.reset();
  }, [api, autosave, client, diagram.id]);

  return (
    <CollabClientProvider client={collab}>
      <div className="editor">
        <header className="editor-header">
          <Link to={`/app/w/${diagram.workspace.id}`} className="button button-ghost">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{diagram.workspace.name}</span>
          </Link>
          <DiagramTitle />
          <SaveStatusLabel />
          <HistoryButtons />
          {collab && <PresenceBar presence={collab.presence} />}
          <div className="editor-actions">
            <CollaborationToggle diagramId={diagram.id} canManage={diagram.workspace.role === "OWNER"} />
            <ViewMenu />
            <ExportButton />
            <button
              type="button"
              className="button button-primary"
              disabled={opening}
              onClick={() => void openPreview()}
            >
              <Play size={16} aria-hidden="true" /> Preview
            </button>
          </div>
          <EditorToolbar />
        </header>
        <EditorBanners onRetry={autosave.retryNow} onLoadLatest={() => void loadLatest()} />
        <div className="editor-body">
          <ShapeLibrary />
          <DiagramCanvas navigationMode={navigation.mode} onNavigationMode={navigation.setMode} />
          {/* The side column switches between properties and versions, so the header and the canvas keep their size. */}
          <div className="side-column">
            <div className="side-column__switch" role="group" aria-label="Side panel">
              <button
                type="button"
                className="button button-ghost button-small"
                aria-pressed={!historyOpen}
                onClick={() => setHistoryOpen(false)}
              >
                <SlidersHorizontal size={14} aria-hidden="true" /> Properties
              </button>
              <button
                type="button"
                className="button button-ghost button-small"
                aria-pressed={historyOpen}
                onClick={() => setHistoryOpen(true)}
              >
                <History size={14} aria-hidden="true" /> Versions
              </button>
            </div>
            {historyOpen ? (
              <VersionPanel
                history={history}
                onCompare={setComparing}
                onSaved={() => versionCaptured(api.getState().doc)}
                onClose={() => setHistoryOpen(false)}
              />
            ) : (
              <PropertiesPanel />
            )}
          </div>
        </div>
        {comparing && (
          <CompareView versions={history.versions} initialFrom={comparing.id} onClose={() => setComparing(null)} />
        )}
      </div>
    </CollabClientProvider>
  );
}

export function EditorPage() {
  const { diagramId = "" } = useParams();
  const { data, error, refetch } = useQuery(DIAGRAM, { variables: { id: diagramId }, fetchPolicy: "network-only" });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) {
    return (
      <div role="status" className="main">
        <span className="visually-hidden">Loading the diagram</span>
        <SkeletonBlock height="60vh" />
      </div>
    );
  }
  return (
    <EditorStoreProvider key={data.diagram.id}>
      <ReactFlowProvider>
        <EditorSession diagram={data.diagram} />
      </ReactFlowProvider>
    </EditorStoreProvider>
  );
}
