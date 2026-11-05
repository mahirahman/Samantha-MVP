import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentWorkspace, getDocumentStatus, isDocumentVerified } from "@/app/dashboard/document-workspace";
import * as documents from "@/lib/documents";
import { processDocumentFile, type DocumentProcessingResult } from "@/lib/document-processing";
import { getImportFolderFiles, loadImportFolder, type ImportDirectoryHandle } from "@/lib/import-folder";

vi.mock("@/app/dashboard/interactive-document-viewer", () => ({ InteractiveDocumentViewer: () => <div>Document preview</div> }));
vi.mock("@/lib/documents", () => ({ listWorkspaceDocuments: vi.fn(), saveWorkspaceDocument: vi.fn(), deleteWorkspaceDocumentsFromDb: vi.fn(), restoreWorkspaceDocumentFromDb: vi.fn() }));
vi.mock("@/lib/document-processing", () => ({ processDocumentFile: vi.fn() }));
vi.mock("@/lib/import-folder", () => ({ loadImportFolder: vi.fn(), saveImportFolderName: vi.fn(), clearLocalImportFolderHandle: vi.fn(), clearImportFolder: vi.fn(), saveImportFolder: vi.fn(), getImportFolderFiles: vi.fn() }));
vi.mock("@/lib/doctors", () => ({ listDoctors: vi.fn(async () => []), matchDoctorByName: vi.fn(() => null) }));
vi.mock("@/lib/patients", async (original) => ({ ...await original<typeof import("@/lib/patients")>(), listPatients: vi.fn(async () => []), matchPatientIdentifiers: vi.fn(async () => null) }));

const doc: documents.DocumentItem & { demographics: ReturnType<typeof import("@/lib/patients").emptyNewPatientInput>; fileLastModified: number } = {
  id: "doc", name: "Test.pdf", status: "check", inbox: "Doctor's Inbox", patient: "Test Patient", dateOfBirth: "", patientVerified: false, matchedIdentifierCount: 0, demographics: {} as ReturnType<typeof import("@/lib/patients").emptyNewPatientInput>, fileSize: 4, fileLastModified: 123, reportDate: "", subject: "", contact: "", storeIn: "Correspondence", assignedUser: "", userVerified: false, category: "", previewUrl: "blob:test", mimeType: "application/pdf",
};
beforeEach(() => {
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([doc]);
  vi.mocked(documents.saveWorkspaceDocument).mockResolvedValue();
  vi.mocked(documents.deleteWorkspaceDocumentsFromDb).mockResolvedValue();
  vi.mocked(documents.restoreWorkspaceDocumentFromDb).mockResolvedValue();
  vi.mocked(loadImportFolder).mockResolvedValue({ handle: null, folderName: "" });
  vi.mocked(processDocumentFile).mockResolvedValue({ extraction: {}, highlights: [], ocrCharacterCount: 4 } as unknown as DocumentProcessingResult);
});
async function openWorkspace() {
  render(<DocumentWorkspace userId="user" email="test@example.test" errorMessage="" onSignOut={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /^Upload$/ })).toBeEnabled());
}
it.each([
  ["Doctor's Inbox", true, true, true], ["Doctor's Inbox", true, false, false],
  ["Patient's File", true, false, true], ["Patient's File", false, true, false],
])("requires the correct patient and doctor verification (%s, %s, %s)", (inbox, patientVerified, userVerified, expected) => {
  expect(isDocumentVerified({ inbox, patientVerified, userVerified })).toBe(expected);
});
it.each(["deleted", "imported", "error"] as const)("preserves terminal status %s", (status) => {
  expect(getDocumentStatus({ ...doc, status, patientVerified: true, userVerified: true })).toBe(status);
});
it("loads persisted documents and excludes recycled records from Queue", async () => {
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([doc, { ...doc, id: "deleted", name: "Deleted.pdf", status: "deleted" }]);
  await openWorkspace();
  expect(screen.getByText("Test.pdf")).toBeInTheDocument();
  expect(screen.queryByText("Deleted.pdf")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Recycle bin/ }));
  expect(screen.getByText("Deleted.pdf")).toBeInTheDocument();
});
it("skips duplicate uploads before OCR, including case differences", async () => {
  await openWorkspace();
  fireEvent.change(screen.getByLabelText("Choose documents to upload"), { target: { files: [new File(["pdf"], "TEST.PDF")] } });
  expect(await screen.findByText(/already exists in Queue/)).toBeInTheDocument();
  expect(processDocumentFile).not.toHaveBeenCalled();
});
it("processes only new files from a mixed upload and skips repeated selections", async () => {
  await openWorkspace();
  fireEvent.change(screen.getByLabelText("Choose documents to upload"), { target: { files: [new File(["pdf"], "Test.pdf"), new File(["new"], "New.pdf"), new File(["new"], "NEW.PDF")] } });
  await waitFor(() => expect(processDocumentFile).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText("New.pdf")).toBeInTheDocument());
});
it("moves selected documents to the browser recycle bin and restores them", async () => {
  await openWorkspace();
  fireEvent.click(screen.getByLabelText("Select Test.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Move to recycle bin" }));
  await waitFor(() => expect(screen.queryByText("Test.pdf")).not.toBeInTheDocument());
  expect(documents.deleteWorkspaceDocumentsFromDb).toHaveBeenCalledWith(["doc"], "user");
  fireEvent.click(screen.getByRole("tab", { name: /Recycle bin/ }));
  fireEvent.click(screen.getByLabelText("Select Test.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Restore selected" }));
  await waitFor(() => expect(documents.restoreWorkspaceDocumentFromDb).toHaveBeenCalledWith("doc", "check"));
});
it("keeps documents visible if recycling fails", async () => {
  vi.mocked(documents.deleteWorkspaceDocumentsFromDb).mockRejectedValue(new Error("Database unavailable"));
  await openWorkspace();
  fireEvent.click(screen.getByLabelText("Select Test.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Move to recycle bin" }));
  expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
  expect(screen.getByText("Test.pdf")).toBeInTheDocument();
});
it("disables uploads if persisted duplicate history cannot be loaded", async () => {
  vi.mocked(documents.listWorkspaceDocuments).mockRejectedValue(new Error("offline"));
  render(<DocumentWorkspace userId="user" email="test@example.test" errorMessage="" onSignOut={vi.fn()} />);
  expect(await screen.findByText(/Could not load workspace/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Upload$/ })).toBeDisabled();
});

it("moves OCR failures to Errors and persists the error message", async () => {
  vi.mocked(processDocumentFile).mockRejectedValue(new Error("OCR unavailable"));
  await openWorkspace();
  fireEvent.change(screen.getByLabelText("Choose documents to upload"), { target: { files: [new File(["pdf"], "Failed.pdf")] } });
  await waitFor(() => expect(screen.getByText("Failed.pdf")).toBeInTheDocument());
  expect(documents.saveWorkspaceDocument).toHaveBeenCalledWith(expect.objectContaining({ name: "Failed.pdf", status: "error", processingError: "OCR unavailable" }), "user");
});
it("keeps empty uploads out of OCR", async () => {
  await openWorkspace();
  fireEvent.change(screen.getByLabelText("Choose documents to upload"), { target: { files: [new File([], "Empty.pdf")] } });
  await waitFor(() => expect(screen.getByText("Empty.pdf")).toBeInTheDocument());
  expect(processDocumentFile).not.toHaveBeenCalled();
});
it("disables bulk allocation when the folder contains only existing files", async () => {
  const handle: ImportDirectoryHandle = { kind: "directory", name: "Inbox", queryPermission: async () => "granted", requestPermission: async () => "granted", async *values() {} };
  vi.mocked(loadImportFolder).mockResolvedValue({ handle, folderName: "Inbox" });
  vi.mocked(getImportFolderFiles).mockResolvedValue([new File(["pdf"], "TEST.pdf")]);
  await openWorkspace();
  fireEvent.click(screen.getByRole("button", { name: "Auto Bulk Import" }));
  expect(await screen.findByText("No new documents to import")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm & Allocate" })).toBeDisabled();
  expect(processDocumentFile).not.toHaveBeenCalled();
});
it("requires verification before filing and persists a verified document as imported", async () => {
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([{ ...doc, patientVerified: true, userVerified: true }]);
  await openWorkspace();
  fireEvent.click(screen.getByText("Test.pdf"));
  const button = screen.getByRole("button", { name: "Import Document" });
  expect(button).toBeEnabled(); fireEvent.click(button);
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenCalledWith(expect.objectContaining({ status: "imported" }), "user"));
});


it("explains missing patient creation fields inline instead of silently disabling creation", async () => {
  await openWorkspace();
  fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.click(screen.getByRole("button", { name: /Create New Patient/i }));
  fireEvent.click(screen.getByRole("button", { name: /Create New Patient/i }));
  expect(await screen.findByText("Date of birth is required.")).toBeInTheDocument();
  expect(screen.getByLabelText(/Date of Birth/)).toHaveAttribute("aria-invalid", "true");
});
