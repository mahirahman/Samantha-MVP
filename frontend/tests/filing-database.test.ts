// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Real PostgreSQL semantics in an isolated, disposable in-memory database.
const db = new PGlite();
const user = "00000000-0000-4000-8000-000000000001";
const patient = "00000000-0000-4000-8000-000000000002";
const doctor = "00000000-0000-4000-8000-000000000003";
const document = "00000000-0000-4000-8000-000000000004";
const fields = { patient_name: "Test Patient", patient_id: patient, patient_verified: true, assigned_user: "Dr Test", doctor_id: doctor, user_verified: true, report_date: "2026-11-05", subject: "Report", source_contact: "Clinic", inbox: "Doctor's Inbox", store_in: "Investigations", document_category: "Letter" };
async function file(overrides: Record<string, unknown> = {}) {
  return db.query("select public.file_workspace_document($1, $2::jsonb)", [document, JSON.stringify({ ...fields, ...overrides })]);
}
beforeAll(async () => {
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(readFileSync(new URL("../../supabase/migrations/db_schema.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261105070000_atomic_document_filing.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261105080000_strict_identity_and_category_routing.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261105090000_preserve_extracted_patient.sql", import.meta.url), "utf8"));
  await db.exec(`grant select, insert, update on all tables in schema public to authenticated;
    insert into auth.users(id) values ('${user}');
    create function public.simulate_filing_failure() returns trigger language plpgsql as $$ begin
      if new.subject = 'Simulate failure' then raise exception 'Simulated filing write failure'; end if;
      return new;
    end; $$;
    create trigger simulate_filing_failure before insert or update on public.filings
      for each row execute function public.simulate_filing_failure();`);
}, 30_000);
beforeEach(async () => {
  await db.exec(`reset role; truncate public.audit_logs, public.filings, public.document_extractions, public.documents, public.patients, public.doctors;
    insert into public.patients(id, full_name, date_of_birth) values ('${patient}', 'Test Patient', '2000-01-01');
    insert into public.doctors(id, full_name, active) values ('${doctor}', 'Dr Test', true);
    insert into public.documents(id, file_name, uploaded_by, status, subject) values ('${document}', 'Test.pdf', '${user}', 'verified', 'Original');
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${user}', false);`);
});
afterAll(async () => db.close());

it("atomically writes all records and retries without duplicate filings", async () => {
  await file(); await file({ subject: "Updated report" });
  expect((await db.query("select status, subject from public.documents")).rows).toEqual([{ status: "imported", subject: "Updated report" }]);
  expect((await db.query("select subject, source_contact from public.filings")).rows).toEqual([{ subject: "Updated report", source_contact: "Clinic" }]);
  expect((await db.query("select needs_review from public.document_extractions")).rows).toEqual([{ needs_review: false }]);
});
it.each([
  [{ source_contact: " " }, "Contact of source is required"],
  [{ report_date: "2025-02-29" }, "valid date of report"],
  [{ subject: " " }, "Subject is required"],
  [{ document_category: "Unknown" }, "supported category"],
  [{ patient_verified: false }, "verify a database patient"],
  [{ doctor_id: null }, "verify a database GP doctor"],
])("rejects invalid filing fields in the database", async (overrides, message) => {
  await expect(file(overrides)).rejects.toThrow(message);
  expect((await db.query("select status from public.documents")).rows).toEqual([{ status: "verified" }]);
});
it("rolls back document and extraction writes when the filing write fails", async () => {
  await expect(file({ subject: "Simulate failure" })).rejects.toThrow("Simulated filing write failure");
  expect((await db.query("select status, subject from public.documents")).rows).toEqual([{ status: "verified", subject: "Original" }]);
  expect((await db.query("select * from public.document_extractions")).rows).toHaveLength(0);
  expect((await db.query("select * from public.filings")).rows).toHaveLength(0);
});
it("does not require a GP for Patient's File", async () => {
  await file({ document_category: "Consent form", inbox: "Patient's File", doctor_id: null, user_verified: false, assigned_user: "" });
  expect((await db.query("select doctor_id from public.filings")).rows).toEqual([{ doctor_id: null }]);
});
it("rejects inactive doctors and missing patient records", async () => {
  await db.exec("update public.doctors set active = false");
  await expect(file()).rejects.toThrow("active database GP");
  await expect(file({ patient_id: "00000000-0000-4000-8000-000000000099" })).rejects.toThrow("patient no longer exists");
});
it("rejects unauthenticated requests and another user's document", async () => {
  await db.exec("select set_config('request.jwt.claim.sub', '', false)");
  await expect(file()).rejects.toThrow("Sign in before importing");
  await db.exec("select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000099', false)");
  await expect(file()).rejects.toThrow("permission");
});


it("rejects mismatched patient names/DOBs, GP names, and category routing", async () => {
  await expect(file({ patient_name: "Different Patient" })).rejects.toThrow("does not match");
  await expect(file({ patient_dob: "2001-01-01" })).rejects.toThrow("does not match");
  await expect(file({ assigned_user: "Different GP" })).rejects.toThrow("does not match");
  await expect(file({ inbox: "Patient's File" })).rejects.toThrow("must follow the document category");
});


it("preserves the original extraction across filing and metadata updates", async () => {
  const original = { name: "Original OCR Patient", dateOfBirth: "1999-01-01" };
  await db.query("update public.documents set extracted_patient = $1::jsonb", [JSON.stringify(original)]);
  await file({ extracted_patient: { name: "Wrong replacement" } });
  expect((await db.query("select extracted_patient from public.documents")).rows).toEqual([{ extracted_patient: original }]);
});
