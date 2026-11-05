import { getSupabaseClient } from "./supabase";

export interface DocumentHighlight {
  id: string;
  fieldName: string;
  fieldLabel: string;
  pageNumber: number;
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DocumentProcessingResult {
  fileName: string;
  mimeType: string;
  ocrCharacterCount: number;
  highlights?: DocumentHighlight[];
  extraction: {
    patientName: string;
    patientDateOfBirth: string;
    patientTitle: string;
    patientFirstName: string;
    patientLastName: string;
    patientMiddleName: string;
    patientPreferredName: string;
    patientGender: string;
    patientAddressLine1: string;
    patientAddressLine2: string;
    patientCity: string;
    patientPostcode: string;
    patientPostalAddress: string;
    patientPostalCity: string;
    patientPostalPostcode: string;
    patientMedicareNumber: string;
    patientMedicareIrn: string;
    patientMedicareExpiry: string;
    patientMobileNumber: string;
    patientHomePhone: string;
    patientWorkPhone: string;
    patientEmail: string;
    patientPensionTypeCode: string;
    patientPensionNumber: string;
    patientPensionExpiry: string;
    patientDvaTypeCode: string;
    patientDvaNumber: string;
    patientExternalId: string;
    reportDate: string;
    subject: string;
    sourceContact: string;
    inboxType: "Doctor's Inbox" | "Patient's File" | "";
    storeIn: "Correspondence" | "Investigations" | "";
    gpDoctor: string;
    category: string;
  };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeExtraction(
  value: unknown,
): DocumentProcessingResult["extraction"] {
  const raw = (value ?? {}) as Record<string, unknown>;
  const inboxType = stringField(raw.inboxType);
  const storeIn = stringField(raw.storeIn);

  return {
    patientName: stringField(raw.patientName),
    patientDateOfBirth: stringField(raw.patientDateOfBirth),
    patientTitle: stringField(raw.patientTitle),
    patientFirstName: stringField(raw.patientFirstName),
    patientLastName: stringField(raw.patientLastName),
    patientMiddleName: stringField(raw.patientMiddleName),
    patientPreferredName: stringField(raw.patientPreferredName),
    patientGender: stringField(raw.patientGender),
    patientAddressLine1: stringField(raw.patientAddressLine1),
    patientAddressLine2: stringField(raw.patientAddressLine2),
    patientCity: stringField(raw.patientCity),
    patientPostcode: stringField(raw.patientPostcode),
    patientPostalAddress: stringField(raw.patientPostalAddress),
    patientPostalCity: stringField(raw.patientPostalCity),
    patientPostalPostcode: stringField(raw.patientPostalPostcode),
    patientMedicareNumber: stringField(raw.patientMedicareNumber),
    patientMedicareIrn: stringField(raw.patientMedicareIrn),
    patientMedicareExpiry: stringField(raw.patientMedicareExpiry),
    patientMobileNumber: stringField(raw.patientMobileNumber),
    patientHomePhone: stringField(raw.patientHomePhone),
    patientWorkPhone: stringField(raw.patientWorkPhone),
    patientEmail: stringField(raw.patientEmail),
    patientPensionTypeCode: stringField(raw.patientPensionTypeCode),
    patientPensionNumber: stringField(raw.patientPensionNumber),
    patientPensionExpiry: stringField(raw.patientPensionExpiry),
    patientDvaTypeCode: stringField(raw.patientDvaTypeCode),
    patientDvaNumber: stringField(raw.patientDvaNumber),
    patientExternalId: stringField(raw.patientExternalId),
    reportDate: stringField(raw.reportDate),
    subject: stringField(raw.subject),
    sourceContact: stringField(raw.sourceContact),
    inboxType: inboxType === "Doctor's Inbox" || inboxType === "Patient's File" ? inboxType : "",
    storeIn: storeIn === "Correspondence" || storeIn === "Investigations" ? storeIn : "",
    gpDoctor: stringField(raw.gpDoctor),
    category: stringField(raw.category),
  };
}

function normalizeHighlights(value: unknown): DocumentHighlight[] {
  if (!Array.isArray(value)) return [];
  const results: DocumentHighlight[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const raw = item as Record<string, unknown>;
    const bbox = (raw.bbox ?? {}) as Record<string, unknown>;
    const x = typeof bbox.x === "number" ? bbox.x : 0;
    const y = typeof bbox.y === "number" ? bbox.y : 0;
    const width = typeof bbox.width === "number" ? bbox.width : 0;
    const height = typeof bbox.height === "number" ? bbox.height : 0;

    results.push({
      id: stringField(raw.id) || `hl-${Math.random().toString(36).substring(2, 9)}`,
      fieldName: stringField(raw.fieldName),
      fieldLabel: stringField(raw.fieldLabel),
      pageNumber: typeof raw.pageNumber === "number" ? raw.pageNumber : 1,
      text: stringField(raw.text),
      bbox: { x, y, width, height },
    });
  }
  return results;
}

export async function processDocumentFile(
  file: File,
): Promise<DocumentProcessingResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("The document-processing API URL is not configured");

  const { data, error } = await getSupabaseClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error("Sign in again before processing documents");
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/documents/process`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    },
  );

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload !== null && "message" in payload
        ? payload.message
        : undefined;
    throw new Error(
      Array.isArray(errorMessage)
        ? errorMessage.join(", ")
        : typeof errorMessage === "string"
          ? errorMessage
          : `Document processing failed (${response.status})`,
    );
  }

  // Normalize defensively: the backend may be running an older build (or a
  // future one) with a different extraction field set, so never trust the
  // response shape blindly - always coerce every field to a safe string.
  const record = (payload ?? {}) as Record<string, unknown>;
  return {
    fileName: stringField(record.fileName),
    mimeType: stringField(record.mimeType),
    ocrCharacterCount:
      typeof record.ocrCharacterCount === "number" ? record.ocrCharacterCount : 0,
    extraction: normalizeExtraction(record.extraction),
    highlights: normalizeHighlights(record.highlights),
  };
}