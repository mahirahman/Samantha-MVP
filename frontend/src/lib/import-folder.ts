type ImportPermissionState = "granted" | "denied" | "prompt";

import { getSupabaseClient } from "./supabase";

interface ImportFileHandle {
  readonly kind: "file";
  getFile(): Promise<File>;
}

export interface ImportDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  queryPermission(options: { mode: "read" }): Promise<ImportPermissionState>;
  requestPermission(options: { mode: "read" }): Promise<ImportPermissionState>;
  values(): AsyncIterableIterator<ImportDirectoryHandle | ImportFileHandle>;
}

const databaseName = "samantha-import-settings";
const storeName = "settings";

function folderKey(userId: string): string {
  return `source-folder:${userId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadLocalFolderHandle(
  userId: string,
): Promise<ImportDirectoryHandle | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, "readonly")
      .objectStore(storeName)
      .get(folderKey(userId));

    request.onsuccess = () => {
      database.close();
      resolve((request.result as ImportDirectoryHandle | undefined) ?? null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function loadImportFolder(userId: string): Promise<{
  handle: ImportDirectoryHandle | null;
  folderName: string;
}> {
  const [handle, preference] = await Promise.all([
    loadLocalFolderHandle(userId),
    getSupabaseClient()
      .from("import_preferences")
      .select("folder_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (preference.error) throw preference.error;

  return {
    handle,
    folderName: preference.data?.folder_name ?? handle?.name ?? "",
  };
}

export async function saveImportFolder(
  userId: string,
  handle: ImportDirectoryHandle,
): Promise<void> {
  await saveImportFolderName(userId, handle.name);

  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(handle, folderKey(userId));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function saveImportFolderName(
  userId: string,
  folderName: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("import_preferences")
    .upsert(
      {
        user_id: userId,
        folder_name: folderName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) throw error;
}

export async function clearLocalImportFolderHandle(userId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(folderKey(userId));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function clearImportFolder(userId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("import_preferences")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;

  await clearLocalImportFolderHandle(userId);
}

export async function getImportFolderFiles(
  handle: ImportDirectoryHandle,
): Promise<File[]> {
  const files: File[] = [];

  async function readDirectory(directory: ImportDirectoryHandle): Promise<void> {
    for await (const entry of directory.values()) {
      if (entry.kind === "file") {
        files.push(await entry.getFile());
      } else {
        await readDirectory(entry);
      }
    }
  }

  await readDirectory(handle);
  return files;
}