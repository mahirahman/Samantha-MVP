import { expect, it } from "vitest";
import { originalExtractedPatient, patientOptionKey, patientOptions } from "@/lib/patient-selection";
import type { DocumentItem } from "@/lib/documents";

const doc = { patient: "Different Selected Patient", patientVerified: true, patientId: "db-1",
  extractedPatient: { name: "Original OCR Patient", dateOfBirth: "2000-01-01" } } as DocumentItem;

it("offers only this document's original extraction and database records", () => {
  const options = patientOptions(doc, [{ id: "db-1", fullName: "Database Patient", dateOfBirth: "1990-01-01" }]);
  expect(options).toHaveLength(2);
  expect(options[0]).toMatchObject({ kind: "extracted", extracted: { name: "Original OCR Patient" } });
  expect(patientOptionKey(options[1])).toBe("db-1");
});
it("keeps extracted and database choices distinct even when names are identical", () => {
  const options = patientOptions(doc, [{ id: "db-1", fullName: "Original OCR Patient", dateOfBirth: "2000-01-01" }]);
  expect(patientOptionKey(options[0])).not.toBe(patientOptionKey(options[1]));
});
it("does not invent an original name from a previously selected verified patient", () => {
  expect(originalExtractedPatient({ patient: "Selected Database Patient", patientVerified: true } as DocumentItem)).toBeUndefined();
});
