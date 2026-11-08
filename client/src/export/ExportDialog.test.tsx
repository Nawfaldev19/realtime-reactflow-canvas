import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { serializeDocument } from "../document/serialize";
import type { DocumentState } from "../document/types";
import { EditorStoreProvider } from "../editor/EditorStoreContext";
import { createEditorStore } from "../editor/store";
import { node, stateOf } from "../test/fixtures";
import { download, ExportError, exportPdf, exportPng, type PdfRequest } from "./capture";
import { ExportButton } from "./ExportDialog";
import { planPdf } from "./plan";

vi.mock("./capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capture")>()),
  exportPdf: vi.fn(),
  exportPng: vi.fn(),
  download: vi.fn(),
}));

// 21 wide steps, 200 units apart: three Letter pages in portrait.
const TALL = stateOf(
  Array.from({ length: 21 }, (_, index) =>
    node(`s${String(index)}`, {
      number: index + 1,
      position: { x: 0, y: index * 200 },
      size: { width: 1432, height: 120 },
    }),
  ),
);

function renderExport(doc: DocumentState = TALL) {
  const store = createEditorStore();
  store
    .getState()
    .load({ id: "d1", title: "Walnut side table", revision: 1, document: serializeDocument(doc), canEdit: false });
  const beforeCapture = vi.fn();
  render(
    <EditorStoreProvider store={store}>
      <ReactFlowProvider>
        <ExportButton beforeCapture={beforeCapture} />
      </ReactFlowProvider>
    </EditorStoreProvider>,
  );
  return { beforeCapture, store };
}

describe("export", () => {
  it("shows the page count the PDF will have, from the same plan", async () => {
    renderExport();
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.getByTestId("export-page-count")).toHaveTextContent("3 pages");
    await userEvent.selectOptions(screen.getByLabelText("Orientation"), "landscape");
    const pages = planPdf(TALL, "letter", "landscape")?.slices.length ?? 0;
    expect(screen.getByTestId("export-page-count")).toHaveTextContent(`${String(pages)} pages`);
    await userEvent.selectOptions(screen.getByLabelText("Paper"), "a3");
    expect(screen.getByTestId("export-page-count")).toHaveTextContent(
      `${String(planPdf(TALL, "a3", "landscape")?.slices.length ?? 0)} pages`,
    );
  });

  it("finishes the reveal, builds the PDF with the chosen options and downloads it", async () => {
    vi.mocked(exportPdf).mockImplementation((request: PdfRequest) => {
      request.onProgress?.(1, 3);
      return Promise.resolve(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    });
    const { beforeCapture } = renderExport();
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    await userEvent.selectOptions(screen.getByLabelText("Quality"), "3");
    await userEvent.click(screen.getByLabelText("Show page numbers"));
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(beforeCapture).toHaveBeenCalled();
    await waitFor(() => expect(exportPdf).toHaveBeenCalled());
    expect(vi.mocked(exportPdf).mock.calls[0]?.[0]).toMatchObject({
      quality: 3,
      title: "Walnut side table",
      paper: "letter",
      orientation: "portrait",
      pageNumbers: false,
    });
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.any(Blob), "walnut-side-table.pdf"));
    expect(screen.queryByRole("dialog", { name: "Export" })).not.toBeInTheDocument();
  });

  it("exports a PNG of the whole diagram", async () => {
    vi.mocked(exportPng).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    renderExport();
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    await userEvent.click(screen.getByLabelText(/PNG image/));
    expect(screen.queryByLabelText("Paper")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Export PNG" }));
    await waitFor(() => expect(exportPng).toHaveBeenCalled());
    expect(vi.mocked(exportPng).mock.calls[0]?.[0]).toMatchObject({ quality: 2 });
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.any(Blob), "walnut-side-table.png"));
  });

  it("mounts every node while capturing (visible-only rendering is off) and restores it afterwards", async () => {
    const { store } = renderExport();
    const during: boolean[] = [];
    vi.mocked(exportPng).mockImplementation(() => {
      during.push(store.getState().renderAll);
      return Promise.resolve(new Blob(["png"], { type: "image/png" }));
    });
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    await userEvent.click(screen.getByLabelText(/PNG image/));
    await userEvent.click(screen.getByRole("button", { name: "Export PNG" }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(during).toEqual([true]);
    expect(store.getState().renderAll).toBe(false);
  });

  it("explains a failed export and keeps the dialog open", async () => {
    vi.mocked(exportPdf).mockRejectedValue(new ExportError("This diagram is too large for that quality."));
    renderExport();
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("too large");
    expect(screen.getByRole("dialog", { name: "Export" })).toBeInTheDocument();
    vi.mocked(exportPdf).mockRejectedValue(new Error("boom"));
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("too large");
  });

  it("closes with Escape", async () => {
    renderExport();
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Export" })).not.toBeInTheDocument();
  });

  it("cannot export an empty diagram", () => {
    renderExport(stateOf([]));
    expect(screen.getByRole("button", { name: /Export/ })).toBeDisabled();
  });

  it("counts a short diagram as one page", async () => {
    renderExport(stateOf([node("a")]));
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.getByTestId("export-page-count")).toHaveTextContent("1 page,");
  });
});
