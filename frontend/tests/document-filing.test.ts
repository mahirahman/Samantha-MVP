import { beforeEach, expect, it, vi } from "vitest";
import { documentCategories, getCategoryRouting, validateDocumentFiling } from "@/lib/document-filing";
import { fileWorkspaceDocument, saveWorkspaceDocument, updateWorkspaceDocumentInDb, type DocumentItem } from "@/lib/documents";
import { getSupabaseClient } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));
const valid: DocumentItem = { id: "doc", name: "Test.pdf", status: "verified", patient: "Test Patient", patientId: "patient", patientVerified: true, dateOfBirth: "", matchedIdentifierCount: 2, assignedUser: "Dr Test", doctorId: "doctor", userVerified: true, inbox: "Doctor's Inbox", storeIn: "Investigations", category: "Letter", reportDate: "2026-11-05", subject: "Report", contact: "Test Clinic", fileSize: 10 };
const rpc = vi.fn();
beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabaseClient>);
  rpc.mockResolvedValue({ error: null });
});
it.each([
  ["patient", " "], ["patientId", undefined], ["patientVerified", false],
  ["reportDate", ""], ["reportDate", "2025-02-29"], ["reportDate", "invalid"],
  ["subject", " "], ["contact", " "], ["category", "Unknown"],
  ["inbox", "Unknown"], ["storeIn", "Unknown"], ["assignedUser", ""],
  ["doctorId", undefined], ["doctorId", "fallback-doc-1"], ["userVerified", false], ["status", "error"], ["status", "deleted"],
])("blocks invalid filing field %s=%s", async (key, value) => {
  const invalid = { ...valid, [key as string]: value };
  expect(Object.keys(validateDocumentFiling(invalid)).length).toBeGreaterThan(0);
  await expect(fileWorkspaceDocument(invalid, "user")).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it("requires Contact of source for both destinations but no GP for Patient's File", () => {
  const patientFile = { ...valid, category: "Consent form", inbox: "Patient's File" as const, assignedUser: "", doctorId: undefined, userVerified: false };
  expect(validateDocumentFiling(patientFile)).toEqual({});
  expect(validateDocumentFiling({ ...patientFile, contact: " " }).contact).toBe("Contact of source is required.");
});
it("normalizes text and caches Imported status only after the awaited RPC succeeds", async () => {
  let finish!: (value: { error: null }) => void;
  rpc.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const pending = fileWorkspaceDocument({ ...valid, contact: " Clinic " }, "user");
  expect(localStorage.getItem("samantha_workspace_docs_user")).toBeNull();
  finish({ error: null });
  const imported = await pending;
  expect(imported).toMatchObject({ status: "imported", contact: "Clinic" });
  expect(rpc).toHaveBeenCalledWith("file_workspace_document", expect.objectContaining({ p_fields: expect.objectContaining({ source_contact: "Clinic" }) }));
  expect(JSON.parse(localStorage.getItem("samantha_workspace_docs_user")!)[0].status).toBe("imported");
});
it("preserves Queue cache after failure and allows retry", async () => {
  localStorage.setItem("samantha_workspace_docs_user", JSON.stringify([valid]));
  rpc.mockResolvedValueOnce({ error: { message: "Database unavailable" } });
  await expect(fileWorkspaceDocument(valid, "user")).rejects.toThrow("Database unavailable");
  expect(JSON.parse(localStorage.getItem("samantha_workspace_docs_user")!)[0].status).toBe("verified");
  await expect(fileWorkspaceDocument(valid, "user")).resolves.toMatchObject({ status: "imported" });
});
it("uses the transaction for all Imported saves and partial updates", async () => {
  await saveWorkspaceDocument({ ...valid, status: "imported" }, "user");
  await updateWorkspaceDocumentInDb(valid.id, { subject: "Updated" }, "user");
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenLastCalledWith("file_workspace_document", expect.objectContaining({ p_fields: expect.objectContaining({ subject: "Updated" }) }));
});
it("does not invent defaults for incomplete previously Imported records", async () => {
  await expect(saveWorkspaceDocument({ ...valid, status: "imported", reportDate: "", subject: "", contact: "" }, "user")).rejects.toThrow("Contact of source is required.");
  expect(rpc).not.toHaveBeenCalled();
});


it.each(documentCategories)("routes category %s consistently while allowing an explicit storage choice", (category) => {
  const clinical = new Set(["Admissions summary", "Advance care planning", "Allied health letter", "Clinical notes", "Discharge summary", "ECG", "Letter", "Medical imaging report", "Pathology results", "Referral letter"]);
  const inbox = clinical.has(category) ? "Doctor's Inbox" : "Patient's File";
  expect(getCategoryRouting(category)).toEqual({ inbox, storeIn: clinical.has(category) ? "Investigations" : "Correspondence" });
  expect(validateDocumentFiling({ ...valid, category, inbox, storeIn: "Correspondence" })).toEqual({});
  expect(validateDocumentFiling({ ...valid, category, inbox: inbox === "Doctor's Inbox" ? "Patient's File" : "Doctor's Inbox" }).inbox).toBeUndefined();
});
