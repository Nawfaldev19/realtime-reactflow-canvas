import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { RequireSession } from "./components/RequireSession";
import { DiagramListPage } from "./pages/DiagramListPage";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignInPage } from "./pages/SignInPage";
import { WorkspaceHome } from "./pages/WorkspaceHome";
import { SkeletonBlock } from "./components/States";

// The editor (and the canvas library) loads only when a diagram is opened.
const EditorPage = lazy(() => import("./pages/EditorPage").then((module) => ({ default: module.EditorPage })));
// The stress page is a development tool, loaded only when visited.
const StressPage = lazy(() => import("./pages/StressPage").then((module) => ({ default: module.StressPage })));
const PreviewPage = lazy(() => import("./pages/PreviewPage").then((module) => ({ default: module.PreviewPage })));

const editorFallback = (
  <div role="status" className="main">
    <span className="visually-hidden">Loading the editor</span>
    <SkeletonBlock height="60vh" />
  </div>
);

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route
        path="/stress"
        element={
          <Suspense fallback={editorFallback}>
            <StressPage />
          </Suspense>
        }
      />
      <Route
        path="/app"
        element={
          <RequireSession>
            <AppLayout />
          </RequireSession>
        }
      >
        <Route index element={<WorkspaceHome />} />
        <Route path="w/:workspaceId" element={<DiagramListPage />} />
        <Route
          path="d/:diagramId"
          element={
            <Suspense fallback={editorFallback}>
              <EditorPage />
            </Suspense>
          }
        />
        <Route
          path="d/:diagramId/preview"
          element={
            <Suspense fallback={editorFallback}>
              <PreviewPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
