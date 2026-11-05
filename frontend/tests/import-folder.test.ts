import { beforeEach, expect, it, vi } from "vitest";
import { getSupabaseClient } from "@/lib/supabase";
import { clearImportFolder, getImportFolderFiles, loadImportFolder, saveImportFolder, saveImportFolderName, type ImportDirectoryHandle } from "@/lib/import-folder";
import { queryMock } from "./supabase-mock";
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));
const from = vi.fn();
beforeEach(() => vi.mocked(getSupabaseClient).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>));
it("reads files recursively, including empty folders", async () => {
  const file = new File(["pdf"], "Nested.pdf");
  const empty: ImportDirectoryHandle = { kind: "directory", name: "Empty", queryPermission: async () => "granted", requestPermission: async () => "granted", async *values() {} };
  const child: ImportDirectoryHandle = { ...empty, name: "Child", async *values() { yield { kind: "file" as const, getFile: async () => file }; } };
  const root: ImportDirectoryHandle = { ...empty, async *values() { yield child; yield empty; } };
  expect(await getImportFolderFiles(root)).toEqual([file]);
  expect(await getImportFolderFiles(empty)).toEqual([]);
});
it("saves account preferences and locally remembers and clears the chosen folder", async () => {
  const { query, response } = queryMock({ folder_name: "Inbox" }); from.mockReturnValue(query);
  // A cloneable stand-in for the browser's structured-cloneable FileSystemDirectoryHandle.
  const handle = { kind: "directory", name: "Inbox" } as ImportDirectoryHandle;
  await saveImportFolder("folder-user", handle);
  expect(await loadImportFolder("folder-user")).toMatchObject({ folderName: "Inbox", handle: { name: "Inbox" } });
  expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "folder-user", folder_name: "Inbox" }), { onConflict: "user_id" });
  await clearImportFolder("folder-user");
  response.data = null;
  expect(await loadImportFolder("folder-user")).toEqual({ handle: null, folderName: "" });
});
it("propagates preference database errors", async () => {
  from.mockReturnValue(queryMock(null, new Error("offline")).query);
  await expect(saveImportFolderName("user", "Inbox")).rejects.toThrow("offline");
  await expect(clearImportFolder("user")).rejects.toThrow("offline");
});
