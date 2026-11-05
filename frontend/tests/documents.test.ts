import { beforeEach, expect, it, vi } from "vitest";
import { getSupabaseClient } from "@/lib/supabase";
import { deleteWorkspaceDocumentsFromDb, listWorkspaceDocuments, restoreWorkspaceDocumentFromDb, saveWorkspaceDocument, saveWorkspaceDocuments, updateWorkspaceDocumentInDb, type DocumentItem } from "@/lib/documents";
import { queryMock } from "./supabase-mock";
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));
const doc: DocumentItem = { id: "doc", name: "Test.pdf", status: "check", fileSize: 4, fileLastModified: 123, inbox: "Doctor's Inbox", patient: "Test", dateOfBirth: "", patientVerified: false, matchedIdentifierCount: 0, reportDate: "", subject: "", contact: "", storeIn: "Correspondence", assignedUser: "", userVerified: false, category: "Letter" };
const from = vi.fn();
const upload = vi.fn();
beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue({ from, storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: "https://files.example.test/Test.pdf" } }) }) } } as unknown as ReturnType<typeof getSupabaseClient>);
  upload.mockResolvedValue({ error: null });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
it("loads every page and restores legacy statuses and recycle metadata", async () => {
  const rows = Array.from({ length: 1000 }, (_, id) => ({ id: String(id), file_name: "Test.pdf", status: "filed" }));
  from.mockReturnValueOnce(queryMock(rows).query).mockReturnValueOnce(queryMock([{ id: "last", file_name: "Last.pdf", status: "deleted", previous_status: "failed", deleted_at: "2026-11-05", file_last_modified: 123, storage_path: "test.pdf" }]).query);
  const docs = await listWorkspaceDocuments("user", true);
  expect(docs).toHaveLength(1001);
  expect(docs[0].status).toBe("imported");
  expect(docs[1000]).toMatchObject({ status: "deleted", previousStatus: "error", fileLastModified: 123, deletedAt: "2026-11-05", previewUrl: "https://files.example.test/Test.pdf" });
});
it("does not resurrect stale cache entries when the database is empty", async () => {
  localStorage.setItem("samantha_workspace_docs_user", JSON.stringify([doc]));
  const { query } = queryMock([]); from.mockReturnValue(query);
  expect(await listWorkspaceDocuments("user")).toEqual([]);
  expect(query.neq).toHaveBeenCalledWith("status", "deleted");
});
it("surfaces database loading errors instead of allowing stale duplicate checks", async () => {
  from.mockReturnValue(queryMock(null, new Error("offline")).query);
  await expect(listWorkspaceDocuments("user")).rejects.toThrow("offline");
});
it("persists uploaded bytes and uses the real database category column", async () => {
  const { query } = queryMock(null); from.mockReturnValue(query);
  await saveWorkspaceDocument(doc, "user", new File(["test"], doc.name));
  expect(upload).toHaveBeenCalled();
  expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "doc", document_category: "Letter", file_last_modified: 123, storage_path: "user/doc/Test.pdf" }), { onConflict: "id" });
  expect(query.upsert.mock.calls[0][0]).not.toHaveProperty("category");
});
it("does not create a record when file storage fails", async () => {
  upload.mockResolvedValue({ error: { message: "offline" } });
  await expect(saveWorkspaceDocument(doc, "user", new File(["test"], doc.name))).rejects.toThrow("Could not store");
  expect(from).not.toHaveBeenCalled();
});
it("reports duplicate persistence failures", async () => {
  from.mockReturnValue(queryMock(null, new Error("already exists")).query);
  await expect(saveWorkspaceDocument(doc, "user")).rejects.toThrow("already exists");
});
it("persists multiple files and updates edited metadata", async () => {
  const { query } = queryMock(null); from.mockReturnValue(query);
  await saveWorkspaceDocuments([doc, { ...doc, id: "doc2", name: "Other.pdf" }], "user");
  await updateWorkspaceDocumentInDb("doc", { category: "Form", patientVerified: true }, "user");
  expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ document_category: "Form", patient_verified: true }));
});
it("recycles records without deleting the files, and restores only their status", async () => {
  const { query } = queryMock({ id: "doc" }); from.mockReturnValue(query);
  await deleteWorkspaceDocumentsFromDb([], "user"); expect(from).not.toHaveBeenCalled();
  await deleteWorkspaceDocumentsFromDb(["doc"], "user");
  expect(query.update).toHaveBeenCalledWith({ status: "deleted" });
  expect(query.delete).not.toHaveBeenCalled();
  await restoreWorkspaceDocumentFromDb("doc", "verified");
  expect(query.update).toHaveBeenCalledWith({ status: "verified" });
  expect(query.eq).toHaveBeenCalledWith("status", "deleted");
});
it("surfaces recycling and restoration errors", async () => {
  from.mockReturnValue(queryMock(null, new Error("conflict")).query);
  await expect(deleteWorkspaceDocumentsFromDb(["doc"])).rejects.toThrow("conflict");
  await expect(restoreWorkspaceDocumentFromDb("doc", "check")).rejects.toThrow("conflict");
});
