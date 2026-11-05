import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PdfOperationsDialog, type PdfOperation } from "@/app/dashboard/pdf-operations-dialog";
import { getPdfPageCount, mergePdfs, splitPdf } from "@/lib/pdf-operations";
vi.mock("@/lib/pdf-operations", () => ({ getPdfPageCount: vi.fn(), mergePdfs: vi.fn(), splitPdf: vi.fn() }));
vi.mock("@/app/dashboard/interactive-document-viewer", () => ({ InteractiveDocumentViewer: () => <div>Merged preview</div> }));
const first = { id: "a", name: "A.pdf", previewUrl: "blob:a" };
const second = { id: "b", name: "B.pdf", previewUrl: "blob:b" };
const onSave = vi.fn(); const onClose = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
  vi.mocked(getPdfPageCount).mockResolvedValue(5);
  vi.mocked(mergePdfs).mockResolvedValue(new File(["pdf"], "Merged.pdf"));
  vi.mocked(splitPdf).mockResolvedValue([new File(["a"], "A.pdf"), new File(["b"], "B.pdf")]);
  onSave.mockResolvedValue(undefined);
});
function open(operation: PdfOperation) { render(<PdfOperationsDialog operation={operation} onSave={onSave} onClose={onClose} />); }
it("makes preview optional and keeps saving enabled when the filename changes", async () => {
  open({ mode: "merge", sources: [first, second] });
  const save = screen.getByRole("button", { name: "Save and process merged PDF" });
  await waitFor(() => expect(save).toBeEnabled());
  const preview = screen.getByRole("button", { name: "Preview merged PDF" });
  await waitFor(() => expect(preview).toBeEnabled()); fireEvent.click(preview);
  expect(await screen.findByText("Merged preview")).toBeInTheDocument(); expect(save).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Merged filename"), { target: { value: "Other.pdf" } });
  expect(save).toBeEnabled();
  expect(screen.queryByText("Merged preview")).not.toBeInTheDocument();
  fireEvent.click(save);
  await waitFor(() => expect(mergePdfs).toHaveBeenLastCalledWith(expect.any(Array), "Other.pdf"));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
});
it("saves directly without preview using the current filename and page order", async () => {
  const bytesA = new ArrayBuffer(1), bytesB = new ArrayBuffer(2);
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, arrayBuffer: async () => url === "blob:a" ? bytesA : bytesB })));
  open({ mode: "merge", sources: [first, second] });
  const save = screen.getByRole("button", { name: "Save and process merged PDF" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Move B.pdf up" }));
  fireEvent.change(screen.getByLabelText("Merged filename"), { target: { value: "Direct.pdf" } });
  fireEvent.click(save);
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(mergePdfs).toHaveBeenCalledWith([bytesB, bytesA], "Direct.pdf");
  expect(screen.queryByText("Merged preview")).not.toBeInTheDocument();
});
it("prevents direct saving with a blank filename and reports merge failures", async () => {
  open({ mode: "merge", sources: [first, second] });
  const save = screen.getByRole("button", { name: "Save and process merged PDF" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Merged filename"), { target: { value: " " } });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Merged filename"), { target: { value: "Merged.pdf" } });
  vi.mocked(mergePdfs).mockRejectedValueOnce(new Error("Invalid source PDF"));
  fireEvent.click(save);
  expect(await screen.findByText("Invalid source PDF")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(save).toBeEnabled();
});
it("merges in the reordered source sequence and saves the previewed file", async () => {
  const bytesA = new ArrayBuffer(1), bytesB = new ArrayBuffer(2);
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, arrayBuffer: async () => url === "blob:a" ? bytesA : bytesB })));
  open({ mode: "merge", sources: [first, second] });
  await waitFor(() => expect(screen.getByRole("button", { name: "Preview merged PDF" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Move B.pdf up" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview merged PDF" }));
  await screen.findByText("Merged preview");
  expect(mergePdfs).toHaveBeenCalledWith([bytesB, bytesA], "Merged document.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Save and process merged PDF" }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});
it("passes page ranges to splitting and leaves the dialog open if saving fails", async () => {
  onSave.mockRejectedValue(new Error("Save failed"));
  open({ mode: "split", sources: [first] });
  const save = screen.getByRole("button", { name: "Split and process" });
  await waitFor(() => expect(save).toBeEnabled()); fireEvent.click(save);
  expect(await screen.findByText("Save failed")).toBeInTheDocument();
  expect(splitPdf).toHaveBeenCalledWith(expect.any(ArrayBuffer), [expect.objectContaining({ start: 1, end: 2 }), expect.objectContaining({ start: 3, end: 5 })]);
  expect(onClose).not.toHaveBeenCalled();
});
it("prevents splitting single-page PDFs", async () => {
  vi.mocked(getPdfPageCount).mockResolvedValue(1); open({ mode: "split", sources: [first] });
  expect(await screen.findByText(/single-page PDF/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Split and process" })).toBeDisabled();
});
it("shows inaccessible source file errors", async () => {
  open({ mode: "split", sources: [{ ...first, previewUrl: undefined }] });
  expect(await screen.findByText(/file for A.pdf is unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Split and process" })).toBeDisabled();
});
