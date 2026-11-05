import { getSupabaseClient } from "./supabase";
import type { DocumentHighlight } from "./document-processing";
import type { NewPatientInput } from "./patients";

export type DocumentStatus = "check" | "verified" | "error" | "imported" | "deleted";
export type InboxType = "Doctor's Inbox" | "Patient's File";
export type StoreLocation = "Correspondence" | "Investigations";

export interface DocumentItem {
  id: string;
  name: string;
  status: DocumentStatus;
  previousStatus?: DocumentStatus;
  deletedAt?: string;
  inbox: InboxType;
  patient: string;
  patientId?: string;
  dateOfBirth: string;
  patientVerified: boolean;
  matchedIdentifierCount: number;
  demographics?: NewPatientInput;
  fileSize: number;
  fileLastModified?: number;
  reportDate: string;
  subject: string;
  contact: string;
  storeIn: StoreLocation;
  assignedUser: string;
  doctorId?: string;
  userVerified: boolean;
  category: string;
  ocrCharacterCount?: number;
  processingError?: string;
  mimeType?: string;
  previewUrl?: string;
  highlights?: DocumentHighlight[];
}

interface DocumentRow {
  id: string;
  file_name: string;
  storage_path?: string | null;
  file_size?: number | null;
  file_last_modified?: number | null;
  mime_type?: string | null;
  status: string;
  previous_status?: string | null;
  deleted_at?: string | null;
  category?: string | null;
  document_category?: string | null;
  subject?: string | null;
  source_contact?: string | null;
  report_date?: string | null;
  inbox?: string | null;
  store_in?: string | null;
  patient_name?: string | null;
  patient_dob?: string | null;
  patient_id?: string | null;
  patient_verified?: boolean | null;
  matched_identifier_count?: number | null;
  assigned_user?: string | null;
  doctor_id?: string | null;
  user_verified?: boolean | null;
  ocr_character_count?: number | null;
  processing_error?: string | null;
  highlights?: DocumentHighlight[] | null;
  demographics?: NewPatientInput | null;
  uploaded_by?: string | null;
}

function storageCacheKey(userId?: string): string {
  return `samantha_workspace_docs_${userId || "default"}`;
}

function loadCachedDocuments(userId?: string): DocumentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DocumentItem[]) : [];
  } catch {
    return [];
  }
}

function setCachedDocuments(docs: DocumentItem[], userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageCacheKey(userId), JSON.stringify(docs));
  } catch {
    // Ignore storage quota limits
  }
}

function normalizeStatus(dbStatus: string): DocumentStatus {
  if (dbStatus === "deleted") return "deleted";
  if (dbStatus === "imported" || dbStatus === "filed") return "imported";
  if (dbStatus === "error" || dbStatus === "failed") return "error";
  if (dbStatus === "verified" || dbStatus === "ready_to_file") return "verified";
  return "check";
}

function mapRowToDocumentItem(row: DocumentRow): DocumentItem {
  let previewUrl: string | undefined;

  if (row.storage_path) {
    try {
      const client = getSupabaseClient();
      const { data } = client.storage.from("documents").getPublicUrl(row.storage_path);
      if (data?.publicUrl) {
        previewUrl = data.publicUrl;
      }
    } catch {
      // previewUrl fallback
    }
  }

  return {
    id: row.id,
    name: row.file_name,
    status: normalizeStatus(row.status),
    previousStatus: row.previous_status ? normalizeStatus(row.previous_status) : undefined,
    deletedAt: row.deleted_at || undefined,
    inbox: (row.inbox as InboxType) || "Doctor's Inbox",
    patient: row.patient_name || "",
    patientId: row.patient_id || undefined,
    dateOfBirth: row.patient_dob || "",
    patientVerified: Boolean(row.patient_verified),
    matchedIdentifierCount: row.matched_identifier_count || (row.patient_verified ? 2 : 0),
    demographics: row.demographics || undefined,
    fileSize: Number(row.file_size) || 0,
    fileLastModified: Number(row.file_last_modified) || undefined,
    reportDate: row.report_date || "",
    subject: row.subject || "",
    contact: row.source_contact || "",
    storeIn: (row.store_in as StoreLocation) || "Correspondence",
    assignedUser: row.assigned_user || "",
    doctorId: row.doctor_id || undefined,
    userVerified: Boolean(row.user_verified),
    category: row.category || row.document_category || "",
    ocrCharacterCount: row.ocr_character_count || undefined,
    processingError: row.processing_error || undefined,
    mimeType: row.mime_type || undefined,
    previewUrl,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
  };
}

/**
 * Loads all workspace documents from Supabase.
 * Uses the database as the authority and cache only for preview metadata.
 */
export async function listWorkspaceDocuments(userId?: string, includeDeleted = false): Promise<DocumentItem[]> {
  const cached = loadCachedDocuments(userId);

  try {
    const client = getSupabaseClient();
    const rows: DocumentRow[] = [];
    // Supabase limits each response; duplicate checks must include every page.
    for (let offset = 0; ; offset += 1000) {
      let query = client.from("documents").select("*")
        .order("created_at", { ascending: false }).order("id")
        .range(offset, offset + 999);
      if (!includeDeleted) query = query.neq("status", "deleted");
      if (userId) query = query.or(`uploaded_by.eq.${userId},uploaded_by.is.null`);
      const { data, error } = await query;
      if (error) throw new Error(`Could not load workspace: ${error.message}`);
      rows.push(...((data || []) as DocumentRow[]));
      if (!data || data.length < 1000) break;
    }
    const dbDocs = rows.map(mapRowToDocumentItem);

    // Merge: Preserve any memory previewUrls from current session cache if present
    const cachedMap = new Map(cached.map((d) => [d.id, d]));
    const merged = dbDocs.map((dbDoc) => {
      const match = cachedMap.get(dbDoc.id);
      if (match?.previewUrl && !dbDoc.previewUrl) {
        return { ...dbDoc, previewUrl: match.previewUrl };
      }
      return dbDoc;
    });

    setCachedDocuments(merged, userId);
    return merged;
  } catch (err) {
    console.warn("listWorkspaceDocuments error:", err);
    throw err;
  }
}

/**
 * Uploads a document's file to Supabase Storage if the storage bucket is available.
 */
export async function uploadDocumentFileToStorage(
  file: File,
  userId: string | undefined,
  docId: string,
): Promise<string | null> {
  try {
    const client = getSupabaseClient();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${userId || "workspace"}/${docId}/${cleanFileName}`;

    const { error } = await client.storage
      .from("documents")
      .upload(filePath, file, { upsert: true });

    if (error) {
      console.warn("Supabase storage upload skipped:", error.message);
      return null;
    }

    return filePath;
  } catch (err) {
    console.warn("uploadDocumentFileToStorage error:", err);
    return null;
  }
}

/**
 * Persists a new or updated document to Supabase (and cache).
 */
export async function saveWorkspaceDocument(
  doc: DocumentItem,
  userId?: string,
  file?: File,
): Promise<void> {
  // Update local cache first
  const current = loadCachedDocuments(userId);
  const exists = current.some((d) => d.id === doc.id);
  const nextCache = exists
    ? current.map((d) => (d.id === doc.id ? doc : d))
    : [doc, ...current];
  setCachedDocuments(nextCache, userId);

  let storagePath: string | null = null;
  if (file) {
    storagePath = await uploadDocumentFileToStorage(file, userId, doc.id);
    if (!storagePath) throw new Error("Could not store the document file. Please retry.");
  }

  try {
    const client = getSupabaseClient();
    const rowPayload: Record<string, unknown> = {
      id: doc.id,
      file_name: doc.name,
      file_size: doc.fileSize,
      file_last_modified: doc.fileLastModified ?? 0,
      mime_type: doc.mimeType || null,
      status: doc.status,
      document_category: doc.category,
      subject: doc.subject,
      source_contact: doc.contact,
      report_date: doc.reportDate || null,
      inbox: doc.inbox,
      store_in: doc.storeIn,
      patient_name: doc.patient,
      patient_dob: doc.dateOfBirth || null,
      patient_id: doc.patientId || null,
      patient_verified: doc.patientVerified,
      matched_identifier_count: doc.matchedIdentifierCount,
      assigned_user: doc.assignedUser,
      doctor_id: doc.doctorId || null,
      user_verified: doc.userVerified,
      ocr_character_count: doc.ocrCharacterCount || 0,
      processing_error: doc.processingError || null,
      highlights: doc.highlights || [],
      demographics: doc.demographics || {},
      uploaded_by: userId || null,
      updated_at: new Date().toISOString(),
    };

    if (storagePath) {
      rowPayload.storage_path = storagePath;
    }

    const { error } = await client
      .from("documents")
      .upsert(rowPayload, { onConflict: "id" });

    if (error) {
      throw new Error(`Could not save document: ${error.message}`);
    }

    // Sync to document_extractions table if patient or doctor exists
    void syncDocumentExtraction(doc, client);

    // Sync to filings table if status is imported
    if (doc.status === "imported") {
      void syncFiling(doc, userId, client);
    }
  } catch (err) {
    throw err;
  }
}

/**
 * Persists multiple documents to Supabase (and cache).
 */
export async function saveWorkspaceDocuments(
  docs: DocumentItem[],
  userId?: string,
  files?: File[],
): Promise<void> {
  const fileMap = new Map(files?.map((f) => [f.name.toLowerCase().trim(), f]));

  // Update local cache
  const current = loadCachedDocuments(userId);
  const currentMap = new Map(current.map((d) => [d.id, d]));
  for (const doc of docs) {
    currentMap.set(doc.id, doc);
  }
  setCachedDocuments(Array.from(currentMap.values()), userId);

  // Upsert to Supabase
  for (const doc of docs) {
    const file = fileMap.get(doc.name.toLowerCase().trim());
    await saveWorkspaceDocument(doc, userId, file);
  }
}

/**
 * Updates a document's fields in Supabase and cache.
 */
export async function updateWorkspaceDocumentInDb(
  docId: string,
  updates: Partial<DocumentItem>,
  userId?: string,
): Promise<void> {
  // Update local cache immediately
  const current = loadCachedDocuments(userId);
  const nextCache = current.map((d) => {
    if (d.id === docId) {
      return { ...d, ...updates };
    }
    return d;
  });
  setCachedDocuments(nextCache, userId);
  const updatedDoc = nextCache.find((doc) => doc.id === docId);

  try {
    const client = getSupabaseClient();
    const rowUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.status !== undefined) rowUpdates.status = updates.status;
    if (updates.patient !== undefined) rowUpdates.patient_name = updates.patient;
    if (updates.dateOfBirth !== undefined) rowUpdates.patient_dob = updates.dateOfBirth;
    if (updates.patientId !== undefined) rowUpdates.patient_id = updates.patientId || null;
    if (updates.patientVerified !== undefined) rowUpdates.patient_verified = updates.patientVerified;
    if (updates.matchedIdentifierCount !== undefined) rowUpdates.matched_identifier_count = updates.matchedIdentifierCount;
    if (updates.assignedUser !== undefined) rowUpdates.assigned_user = updates.assignedUser;
    if (updates.doctorId !== undefined) rowUpdates.doctor_id = updates.doctorId || null;
    if (updates.userVerified !== undefined) rowUpdates.user_verified = updates.userVerified;
    if (updates.inbox !== undefined) rowUpdates.inbox = updates.inbox;
    if (updates.storeIn !== undefined) rowUpdates.store_in = updates.storeIn;
    if (updates.category !== undefined) {
      rowUpdates.document_category = updates.category;
    }
    if (updates.subject !== undefined) rowUpdates.subject = updates.subject;
    if (updates.contact !== undefined) rowUpdates.source_contact = updates.contact;
    if (updates.reportDate !== undefined) rowUpdates.report_date = updates.reportDate;
    if (updates.processingError !== undefined) rowUpdates.processing_error = updates.processingError || null;
    if (updates.highlights !== undefined) rowUpdates.highlights = updates.highlights;
    if (updates.demographics !== undefined) rowUpdates.demographics = updates.demographics;

    const { error } = await client.from("documents").update(rowUpdates).eq("id", docId);
    if (error) {
      console.warn("Could not update document in Supabase:", error.message);
    }

    if (updatedDoc) {
      void syncDocumentExtraction(updatedDoc, client);
      if (updatedDoc.status === "imported") {
        void syncFiling(updatedDoc, userId, client);
      }
    }
  } catch (err) {
    console.warn("updateWorkspaceDocumentInDb error:", err);
  }
}

/**
 * Removes documents from Supabase and cache.
 */
export async function deleteWorkspaceDocumentsFromDb(
  docIds: string[],
  userId?: string,
): Promise<void> {
  if (docIds.length === 0) return;

  // Update local cache
  const idSet = new Set(docIds);
  const current = loadCachedDocuments(userId);
  setCachedDocuments(current.filter((d) => !idSet.has(d.id)), userId);

  try {
    const client = getSupabaseClient();
    const { error } = await client.from("documents").update({ status: "deleted" }).in("id", docIds);
    if (error) {
      throw new Error(`Could not remove documents: ${error.message}`);
    }
  } catch (err) {
    throw err;
  }
}

/** Restores a recycled record without overwriting its file or extracted metadata. */
export async function restoreWorkspaceDocumentFromDb(
  docId: string,
  status: Exclude<DocumentStatus, "deleted">,
): Promise<void> {
  const { error } = await getSupabaseClient().from("documents")
    .update({ status }).eq("id", docId).eq("status", "deleted").select("id").single();
  if (error) throw new Error(`Could not restore document: ${error.message}`);
}

/**
 * Helper to sync extraction row in public.document_extractions.
 */
async function syncDocumentExtraction(doc: DocumentItem, client: ReturnType<typeof getSupabaseClient>) {
  try {
    await client.from("document_extractions").upsert(
      {
        document_id: doc.id,
        patient_id: doc.patientId || null,
        doctor_id: doc.doctorId || null,
        date_of_report: doc.reportDate || null,
        subject: doc.subject || null,
        source_contact: doc.contact || null,
        inbox_type: doc.inbox,
        store_in: doc.storeIn,
        category: doc.category || null,
        needs_review: doc.status === "check",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "document_id" },
    );
  } catch {
    // Graceful ignore
  }
}

/**
 * Helper to sync filed document in public.filings.
 */
async function syncFiling(
  doc: DocumentItem,
  userId: string | undefined,
  client: ReturnType<typeof getSupabaseClient>,
) {
  if (!doc.patientId) return;

  try {
    await client.from("filings").upsert(
      {
        document_id: doc.id,
        patient_id: doc.patientId,
        doctor_id: doc.doctorId || null,
        date_of_report: doc.reportDate || new Date().toISOString().slice(0, 10),
        subject: doc.subject || "Medical Document",
        source_contact: doc.contact || null,
        inbox_type: doc.inbox,
        store_in: doc.storeIn,
        category: doc.category || "Correspondence",
        approved_by: userId || null,
        approved_at: new Date().toISOString(),
        status: "filed",
      },
      { onConflict: "document_id" },
    );
  } catch {
    // Graceful ignore
  }
}

