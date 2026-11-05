import { beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentWorkspace, getDocumentStatus, isDocumentVerified } from "@/app/dashboard/document-workspace";
import * as documents from "@/lib/documents";
import { listPatients, matchPatientIdentifiers } from "@/lib/patients";
import { listDoctors } from "@/lib/doctors";
import { processDocumentFile, type DocumentProcessingResult } from "@/lib/document-processing";
import { getImportFolderFiles, loadImportFolder, type ImportDirectoryHandle } from "@/lib/import-folder";

vi.mock("@/app/dashboard/interactive-document-viewer", () => ({ InteractiveDocumentViewer: () => <div>Document preview</div> }));
vi.mock("@/lib/documents", () => ({ listWorkspaceDocuments: vi.fn(), fileWorkspaceDocument: vi.fn(), saveWorkspaceDocument: vi.fn(), deleteWorkspaceDocumentsFromDb: vi.fn(), restoreWorkspaceDocumentFromDb: vi.fn() }));
vi.mock("@/lib/document-processing", () => ({ processDocumentFile: vi.fn() }));
vi.mock("@/lib/import-folder", () => ({ loadImportFolder: vi.fn(), saveImportFolderName: vi.fn(), clearLocalImportFolderHandle: vi.fn(), clearImportFolder: vi.fn(), saveImportFolder: vi.fn(), getImportFolderFiles: vi.fn() }));
vi.mock("@/lib/doctors", () => ({ listDoctors: vi.fn(async () => []), matchDoctorByName: vi.fn(() => null) }));
vi.mock("@/lib/patients", async (original) => ({ ...await original<typeof import("@/lib/patients")>(), listPatients: vi.fn(async () => []), matchPatientIdentifiers: vi.fn(async () => null) }));

const doc: documents.DocumentItem & { demographics: ReturnType<typeof import("@/lib/patients").emptyNewPatientInput>; fileLastModified: number } = {
  id: "doc", name: "Test.pdf", status: "check", inbox: "Doctor's Inbox", patient: "Test Patient", dateOfBirth: "", patientVerified: false, matchedIdentifierCount: 0, demographics: {} as ReturnType<typeof import("@/lib/patients").emptyNewPatientInput>, fileSize: 4, fileLastModified: 123, reportDate: "", subject: "", contact: "", storeIn: "Correspondence", assignedUser: "", userVerified: false, category: "", previewUrl: "blob:test", mimeType: "application/pdf",
};
beforeEach(() => {
  vi.mocked(listPatients).mockResolvedValue([]);
  vi.mocked(listDoctors).mockResolvedValue([]);
  vi.mocked(matchPatientIdentifiers).mockResolvedValue(null);
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([doc]);
  vi.mocked(documents.saveWorkspaceDocument).mockResolvedValue();
  vi.mocked(documents.fileWorkspaceDocument).mockImplementation(async (document) => ({ ...document, status: "imported" }));
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
  expect(isDocumentVerified({ inbox, patientVerified, userVerified, patientId: "p1", doctorId: "d1" })).toBe(expected);
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
it("opens import settings before bulk import when no folder is configured", async () => {
  await openWorkspace();
  fireEvent.click(screen.getByRole("button", { name: "Auto Bulk Import" }));
  expect(await screen.findByRole("heading", { name: "Import settings" })).toBeInTheDocument();
  expect(screen.queryByText("Bulk Import Ready")).not.toBeInTheDocument();
  const file = new File(["pdf"], "New.pdf");
  Object.defineProperty(file, "webkitRelativePath", { value: "Inbox/New.pdf" });
  fireEvent.change(screen.getByLabelText("Choose import folder"), { target: { files: [file] } });
  expect(await screen.findByText("1 new document selected")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Import settings" })).not.toBeInTheDocument());
});
it("requires verification before filing and persists a verified document as imported", async () => {
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([{ ...doc, patientVerified: true, patientId: "patient", userVerified: true, doctorId: "doctor", assignedUser: "Dr Test", reportDate: "2026-11-05", subject: "Report", contact: "Clinic", category: "Letter" }]);
  await openWorkspace();
  fireEvent.click(screen.getByText("Test.pdf"));
  const button = screen.getByRole("button", { name: "Import Document" });
  expect(button).toBeEnabled(); fireEvent.click(button);
  await waitFor(() => expect(documents.fileWorkspaceDocument).toHaveBeenCalledWith(expect.objectContaining({ patientId: "patient", contact: "Clinic" }), "user"));
});


it("explains missing patient creation fields inline instead of silently disabling creation", async () => {
  await openWorkspace();
  fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.click(screen.getByRole("button", { name: /Create New Patient/i }));
  fireEvent.click(screen.getByRole("button", { name: /Create New Patient/i }));
  expect(await screen.findByText("Date of birth is required.")).toBeInTheDocument();
  expect(screen.getByLabelText(/Date of Birth/)).toHaveAttribute("aria-invalid", "true");
});


it("blocks filing when Contact of source is missing even if patient and doctor are verified", async () => {
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([{ ...doc, patientVerified: true, patientId: "patient", userVerified: true, doctorId: "doctor", assignedUser: "Dr Test", reportDate: "2026-11-05", subject: "Report", contact: " ", category: "Letter" }]);
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  expect(screen.getByRole("button", { name: "Import Document" })).toBeDisabled();
  expect(screen.getByLabelText(/Contact of source/)).toBeRequired();
  expect(screen.getAllByText("Contact of source is required.").length).toBeGreaterThan(0);
  expect(documents.fileWorkspaceDocument).not.toHaveBeenCalled();
});

it("keeps an import pending until persistence completes, reports failures, and allows retry", async () => {
  const complete = { ...doc, patientVerified: true, patientId: "patient", userVerified: true, doctorId: "doctor", assignedUser: "Dr Test", reportDate: "2026-11-05", subject: "Report", contact: "Clinic", category: "Letter" };
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([complete]);
  let rejectSave!: (reason: Error) => void;
  vi.mocked(documents.fileWorkspaceDocument).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Import Document" }));
  await waitFor(() => expect(documents.fileWorkspaceDocument).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Importing..." })).toBeDisabled();
  expect(screen.queryByText("Document imported successfully")).not.toBeInTheDocument();
  const { act } = await import("@testing-library/react");
  await act(async () => rejectSave(new Error("Filing save failed")));
  expect(await screen.findByText("Filing save failed")).toBeInTheDocument();
  expect(screen.getByLabelText("Select Test.pdf")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Import Document" }));
  expect(await screen.findByText("Document imported successfully")).toBeInTheDocument();
});


it("requires database IDs even if old verification flags are true", () => {
  expect(isDocumentVerified({ inbox: "Doctor's Inbox", patientVerified: true, userVerified: true })).toBe(false);
  expect(isDocumentVerified({ inbox: "Doctor's Inbox", patientId: "p1", doctorId: "fallback-doc-1", patientVerified: true, userVerified: true })).toBe(false);
});
it("selects same-name patients by ID and clears the old ID when selection is cleared", async () => {
  vi.mocked(listPatients).mockResolvedValue([
    { id: "p1", fullName: "Same Name", dateOfBirth: "2000-01-01" },
    { id: "p2", fullName: "Same Name", dateOfBirth: "2001-02-03" },
  ]);
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Patient/ }));
  fireEvent.click(await screen.findByRole("option", { name: /ID: p2/ }));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenCalledWith(expect.objectContaining({ patientId: "p2", patient: "Same Name", dateOfBirth: "2001-02-03" }), "user"));
  fireEvent.click(screen.getByTitle("Clear patient selection"));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenLastCalledWith(expect.objectContaining({ patientId: undefined, patientVerified: false }), "user"));
});
it("category changes update routing, reset default storage and clear the GP when no review is needed", async () => {
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([{ ...doc, category: "Letter", doctorId: "d1", assignedUser: "Dr Test", userVerified: true }]);
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Category/ }));
  fireEvent.click(screen.getByRole("option", { name: "Consent form" }));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenLastCalledWith(expect.objectContaining({ category: "Consent form", inbox: "Patient's File", storeIn: "Correspondence", doctorId: undefined, userVerified: false }), "user"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Category/ }));
  fireEvent.click(screen.getByRole("option", { name: "Medical imaging report" }));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenLastCalledWith(expect.objectContaining({ inbox: "Doctor's Inbox", storeIn: "Investigations", doctorId: undefined, userVerified: false }), "user"));
  expect(screen.getByRole("radiogroup", { name: "Inbox Type" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Doctor's Inbox" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Doctor's Inbox" })).toBeEnabled();
  expect(screen.getByRole("radio", { name: "Patient's File" })).toBeEnabled();
});
it("applies a storage selection only to selected Queue documents", async () => {
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([doc, { ...doc, id: "other", name: "Other.pdf" }]);
  await openWorkspace(); fireEvent.click(screen.getByLabelText("Select Test.pdf"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "Batch Store in" }));
  fireEvent.click(screen.getByRole("option", { name: "Investigations" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply to selected" }));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenCalledWith(expect.objectContaining({ id: "doc", storeIn: "Investigations" }), "user"));
  expect(documents.saveWorkspaceDocument).not.toHaveBeenCalledWith(expect.objectContaining({ id: "other" }), "user");
});
it("bulk storage overrides never override category-driven Inbox Type", async () => {
  const handle: ImportDirectoryHandle = { kind: "directory", name: "Inbox", queryPermission: async () => "granted", requestPermission: async () => "granted", async *values() {} };
  vi.mocked(loadImportFolder).mockResolvedValue({ handle, folderName: "Inbox" });
  vi.mocked(getImportFolderFiles).mockResolvedValue([new File(["pdf"], "New.pdf")]);
  vi.mocked(processDocumentFile).mockResolvedValue({ extraction: { category: "Medical imaging report", inboxType: "Patient's File", storeIn: "Investigations" }, highlights: [], ocrCharacterCount: 4 } as unknown as DocumentProcessingResult);
  await openWorkspace(); fireEvent.click(screen.getByRole("button", { name: "Auto Bulk Import" }));
  await screen.findByText("1 new document selected");
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "Store in for this batch" }));
  fireEvent.click(screen.getByRole("option", { name: "Correspondence" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Allocate" }));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenCalledWith(expect.objectContaining({ name: "New.pdf", inbox: "Doctor's Inbox", storeIn: "Correspondence" }), "user"));
});


it("selects duplicate-name GPs by ID without verifying typed names", async () => {
  vi.mocked(listDoctors).mockResolvedValue([{ id: "d1", fullName: "Dr Same", email: "first@example.test" }, { id: "d2", fullName: "Dr Same", email: "second@example.test" }]);
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /^User/ }));
  fireEvent.click(await screen.findByRole("option", { name: /ID: d2/ }));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenLastCalledWith(expect.objectContaining({ doctorId: "d2", userVerified: true, assignedUser: "Dr Same" }), "user"));
  fireEvent.click(screen.getByTitle("Clear GP selection"));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenLastCalledWith(expect.objectContaining({ doctorId: undefined, userVerified: false }), "user"));
});
it("does not let a stale DOB verification replace a later explicit patient selection", async () => {
  vi.mocked(listPatients).mockResolvedValue([{ id: "p1", fullName: "First Patient", dateOfBirth: "2000-01-01" }, { id: "p2", fullName: "Second Patient", dateOfBirth: "2001-02-03" }]);
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([{ ...doc, patient: "First Patient", patientId: "p1", dateOfBirth: "2000-01-01", patientVerified: true }]);
  let finish!: (value: Awaited<ReturnType<typeof matchPatientIdentifiers>>) => void;
  vi.mocked(matchPatientIdentifiers).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.change(screen.getByLabelText(/^Date of birth/), { target: { value: "2002-01-01" } });
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenCalledWith(expect.objectContaining({ patientId: undefined, patientVerified: false }), "user"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Patient/ }));
  fireEvent.click(await screen.findByRole("option", { name: /ID: p2/ }));
  const { act } = await import("@testing-library/react");
  await act(async () => finish({ patient: { id: "p1", fullName: "First Patient", dateOfBirth: "2002-01-01" }, matchedIdentifierCount: 2, totalIdentifiers: 2 }));
  expect(screen.getByRole("combobox", { name: /^Patient/ })).toHaveValue("Second Patient (2001-02-03)");
});


it("can return to this document's original extraction after choosing a database patient and create its record", async () => {
  vi.mocked(listPatients).mockResolvedValue([{ id: "p1", fullName: "Database Patient", dateOfBirth: "1990-01-01" }]);
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([
    { ...doc, patient: "Original OCR Patient", extractedPatient: { name: "Original OCR Patient", dateOfBirth: "2000-03-04" } },
    { ...doc, id: "other", name: "Other.pdf", patient: "Unrelated Unverified Name" },
  ]);
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  const patientInput = screen.getByRole("combobox", { name: /^Patient/ });
  fireEvent.change(patientInput, { target: { value: "" } });
  fireEvent.mouseDown(patientInput);
  expect(screen.queryByRole("option", { name: /Unrelated Unverified Name/ })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("option", { name: /ID: p1/ }));
  fireEvent.change(patientInput, { target: { value: "" } });
  fireEvent.mouseDown(patientInput);
  fireEvent.click(await screen.findByRole("option", { name: /Original extracted patient/ }));
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenLastCalledWith(expect.objectContaining({ patient: "Original OCR Patient", patientId: undefined, patientVerified: false, dateOfBirth: "2000-03-04", extractedPatient: { name: "Original OCR Patient", dateOfBirth: "2000-03-04" } }), "user"));
  fireEvent.click(screen.getByRole("button", { name: "Create New Patient" }));
  expect(screen.getByLabelText(/^First Name/)).toHaveValue("Original");
  expect(screen.getByLabelText(/^Last Name/)).toHaveValue("OCR Patient");
  expect(screen.getByLabelText(/^Date of Birth/)).toHaveValue("2000-03-04");
});
it("never lists unverified extracted GP names or fallback/inactive doctors", async () => {
  vi.mocked(listDoctors).mockResolvedValue([
    { id: "d1", fullName: "Dr Database", active: true },
    { id: "fallback-doc-1", fullName: "Dr Fallback", active: true },
    { id: "d2", fullName: "Dr Inactive", active: false },
  ]);
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([{ ...doc, assignedUser: "Dr Extracted Only" }]);
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /^User/ }));
  expect(await screen.findByRole("option", { name: /Dr Database/ })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Dr Extracted Only|Dr Fallback|Dr Inactive/ })).not.toBeInTheDocument();
});


it("makes imported documents read-only while keeping preview and navigation available", async () => {
  vi.mocked(listPatients).mockResolvedValue([{ id: "p1", fullName: "Test Patient", dateOfBirth: "2000-01-01" }]);
  vi.mocked(listDoctors).mockResolvedValue([{ id: "d1", fullName: "Dr Test", active: true }]);
  const imported = { ...doc, status: "imported" as const, patientId: "p1", patientVerified: true, doctorId: "d1", userVerified: true, assignedUser: "Dr Test", category: "Letter", subject: "Original subject", reportDate: "2026-11-05", contact: "Clinic" };
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([imported, { ...imported, id: "second", name: "Second.pdf" }]);
  await openWorkspace(); fireEvent.click(screen.getByRole("tab", { name: /Imported/ }));
  fireEvent.click(screen.getByText("Test.pdf"));
  for (const label of [/^Patient(?:\s|$)/, /^User/, /^Category/, /^Date of birth/, /^Date of report/, /^Subject/, /^Contact of source/, /^Store in/]) {
    const field = screen.getByLabelText(label);
    if (field.getAttribute("role") === "combobox" && field.tagName !== "INPUT") {
      expect(field).toHaveAttribute("aria-disabled", "true");
    } else expect(field).toBeDisabled();
  }
  expect(screen.getByRole("radiogroup", { name: "Inbox Type" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Doctor's Inbox" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Doctor's Inbox" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Patient's File" })).toBeDisabled();
  for (const name of ["Reprocess Document", "Reset to Default", "Report Error"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
  expect(screen.getByRole("button", { name: "Show Patient Record" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Next document" })).toBeEnabled();
  expect(screen.getByText("Document preview")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Subject/), { target: { value: "Changed" } });
  await waitFor(() => expect(screen.getByLabelText(/^Subject/)).toHaveValue("Original subject"));
  expect(documents.saveWorkspaceDocument).not.toHaveBeenCalled();
  expect(processDocumentFile).not.toHaveBeenCalled();
});


it("does not scan the saved folder automatically", async () => {
  vi.useFakeTimers();
  try {
    const handle: ImportDirectoryHandle = { kind: "directory", name: "Inbox", queryPermission: vi.fn(async () => "granted" as const), requestPermission: vi.fn(), async *values() {} };
    vi.mocked(loadImportFolder).mockResolvedValue({ handle, folderName: "Inbox" });
    await act(async () => { render(<DocumentWorkspace userId="user" email="test@example.test" errorMessage="" onSignOut={vi.fn()} />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(screen.queryByLabelText("Automatic folder scan status")).not.toBeInTheDocument();
    expect(getImportFolderFiles).not.toHaveBeenCalled();
    expect(processDocumentFile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Auto Bulk Import" })).toBeEnabled();
  } finally { cleanup(); vi.useRealTimers(); }
});

it("allows Inbox Type radio overrides in Queue and requires a verified GP when switching back", async () => {
  vi.mocked(documents.listWorkspaceDocuments).mockResolvedValue([{ ...doc, category: "Letter", patientId: "p1", patientVerified: true, doctorId: "d1", assignedUser: "Dr Test", userVerified: true, subject: "Report", contact: "Clinic", reportDate: "2026-11-05" }]);
  await openWorkspace(); fireEvent.click(screen.getByText("Test.pdf"));
  fireEvent.click(screen.getByRole("radio", { name: "Patient's File" }));
  expect(screen.getByRole("radio", { name: "Patient's File" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Import Document" })).toBeEnabled();
  await waitFor(() => expect(documents.saveWorkspaceDocument).toHaveBeenLastCalledWith(expect.objectContaining({ inbox: "Patient's File", category: "Letter", doctorId: undefined, userVerified: false }), "user"));
  fireEvent.click(screen.getByRole("radio", { name: "Doctor's Inbox" }));
  expect(screen.getByRole("radio", { name: "Doctor's Inbox" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Import Document" })).toBeDisabled();
});
