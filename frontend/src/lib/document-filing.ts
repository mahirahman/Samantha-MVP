import type { DocumentItem } from "./documents";

export const documentCategories = [
  "Admissions summary", "Advance care planning", "Allied health letter", "Certificate",
  "Clinical notes", "Clinical photograph", "Consent form", "DAS21", "Discharge summary",
  "ECG", "Email", "Form", "Immunisation", "Indigenous PIP", "Letter",
  "Medical imaging report", "MyHealth registration", "New PT registration form",
  "Pathology results", "Patient consent", "Record request", "Referral letter",
  "Workcover", "Workcover consent",
] as const;

const doctorReviewCategories = new Set<string>([
  "Admissions summary", "Advance care planning", "Allied health letter", "Clinical notes",
  "Discharge summary", "ECG", "Letter", "Medical imaging report", "Pathology results", "Referral letter",
]);

export function getCategoryRouting(category: string): { inbox: DocumentItem["inbox"]; storeIn: DocumentItem["storeIn"] } | null {
  if (!documentCategories.some((item) => item === category)) return null;
  return doctorReviewCategories.has(category)
    ? { inbox: "Doctor's Inbox", storeIn: "Investigations" }
    : { inbox: "Patient's File", storeIn: "Correspondence" };
}

export type FilingErrors = Partial<Record<"patient" | "reportDate" | "subject" | "contact" | "inbox" | "storeIn" | "category" | "assignedUser" | "status", string>>;

export function validateDocumentFiling(doc: DocumentItem): FilingErrors {
  const errors: FilingErrors = {};
  if (!doc.patient.trim() || !doc.patientId?.trim() || !doc.patientVerified) errors.patient = "Select and verify a database patient.";
  const date = doc.reportDate.trim();
  if (!date) errors.reportDate = "Date of report is required.";
  else {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 1 || parsed.toISOString().slice(0, 10) !== date) errors.reportDate = "Enter a valid date of report.";
  }
  if (!doc.subject.trim()) errors.subject = "Subject is required.";
  if (!doc.contact.trim()) errors.contact = "Contact of source is required.";
  if (!["Doctor's Inbox", "Patient's File"].includes(doc.inbox)) errors.inbox = "Select a supported inbox type.";
  if (!["Correspondence", "Investigations"].includes(doc.storeIn)) errors.storeIn = "Select Correspondence or Investigations.";
  if (!documentCategories.some((category) => category === doc.category)) errors.category = "Select a supported category.";
  if (doc.inbox === "Doctor's Inbox" && (!doc.assignedUser.trim() || !doc.doctorId?.trim() || doc.doctorId.startsWith("fallback-") || !doc.userVerified)) errors.assignedUser = "Select and verify a database GP doctor.";
  if (doc.status === "error" || doc.status === "deleted") errors.status = "Resolve the document error or restore it to Queue before importing.";
  return errors;
}
