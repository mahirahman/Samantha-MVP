import type { DocumentItem, ExtractedPatient } from "./documents";
import type { PatientRecord } from "./patients";

export type PatientOption = { kind: "extracted"; extracted: ExtractedPatient } | { kind: "database"; patient: PatientRecord };

/** Recover older documents only from extraction demographics or an unverified name. */
export function originalExtractedPatient(doc: DocumentItem): ExtractedPatient | undefined {
  if (doc.extractedPatient?.name.trim()) return doc.extractedPatient;
  const name = [doc.demographics?.firstName, doc.demographics?.middleName, doc.demographics?.lastName].filter(Boolean).join(" ").trim()
    || (!doc.patientVerified ? doc.patient.trim() : "");
  return name ? { name, dateOfBirth: doc.demographics?.dateOfBirth || (!doc.patientVerified ? doc.dateOfBirth : ""), demographics: doc.demographics } : undefined;
}

export function patientOptions(doc: DocumentItem, patients: PatientRecord[]): PatientOption[] {
  const extracted = originalExtractedPatient(doc);
  return [
    ...(extracted ? [{ kind: "extracted" as const, extracted }] : []),
    ...patients.map((patient) => ({ kind: "database" as const, patient })),
  ];
}

export function patientOptionKey(option: PatientOption): string {
  return option.kind === "extracted" ? "original-extracted-patient" : option.patient.id;
}

export function patientOptionLabel(option: PatientOption): string {
  return option.kind === "extracted" ? option.extracted.name : `${option.patient.fullName} (${option.patient.dateOfBirth})`;
}
