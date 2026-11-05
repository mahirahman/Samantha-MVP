import { getSupabaseClient } from "./supabase";

export interface DocumentProcessingResult {
  fileName: string;
  mimeType: string;
  ocrCharacterCount: number;
  extraction: {
    patientName: string;
    reportDate: string;
    subject: string;
    sourceContact: string;
    inboxType: "Doctor's Inbox" | "Patient's File" | "";
    storeIn: "Correspondence" | "Investigations" | "";
    gpDoctor: string;
    category: string;
  };
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

  return payload as DocumentProcessingResult;
}