-- Keep original OCR identity independent of the receptionist's patient selection.
alter table public.documents add column if not exists extracted_patient jsonb;

-- Best-effort backfill: never label an unrelated verified selection as extracted.
update public.documents set extracted_patient = jsonb_build_object(
  'name', coalesce(nullif(btrim(concat_ws(' ', demographics->>'firstName', demographics->>'middleName', demographics->>'lastName')), ''),
    case when patient_verified is not true then nullif(btrim(patient_name), '') end),
  'dateOfBirth', coalesce(nullif(demographics->>'dateOfBirth', ''), case when patient_verified is not true then patient_dob else '' end),
  'demographics', demographics
)
where extracted_patient is null and (
  nullif(btrim(concat_ws(' ', demographics->>'firstName', demographics->>'middleName', demographics->>'lastName')), '') is not null
  or (patient_verified is not true and nullif(btrim(patient_name), '') is not null)
);

create or replace function public.file_workspace_document(p_document_id uuid, p_fields jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_doc public.documents%rowtype;
  reviewed public.documents%rowtype;
  report_day date;
begin
  if auth.uid() is null then raise exception 'Sign in before importing a document.'; end if;
  select * into current_doc from public.documents where id = p_document_id for update;
  if not found then raise exception 'Document not found. Refresh the workspace and try again.'; end if;
  if current_doc.uploaded_by is not null and current_doc.uploaded_by <> auth.uid() then
    raise exception 'You do not have permission to import this document.';
  end if;
  if current_doc.status in ('error', 'failed', 'deleted') then
    raise exception 'Resolve the document error or restore it to Queue before importing.';
  end if;
  reviewed := jsonb_populate_record(current_doc, p_fields);

  if nullif(btrim(reviewed.patient_name), '') is null or reviewed.patient_id is null
     or reviewed.patient_verified is not true then
    raise exception 'Select and verify a database patient.';
  end if;
  if not exists (select 1 from public.patients where id = reviewed.patient_id) then
    raise exception 'The selected patient no longer exists. Select a database patient.';
  end if;
  if not exists (select 1 from public.patients p where p.id = reviewed.patient_id
    and lower(btrim(p.full_name)) = lower(btrim(reviewed.patient_name))
    and (nullif(btrim(reviewed.patient_dob), '') is null or p.date_of_birth::text = btrim(reviewed.patient_dob))) then
    raise exception 'The patient name or date of birth does not match the selected database patient. Select the patient again.';
  end if;
  if nullif(btrim(reviewed.report_date), '') is null then raise exception 'Date of report is required.'; end if;
  begin
    if btrim(reviewed.report_date) !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
    report_day := btrim(reviewed.report_date)::date;
  exception when others then raise exception 'Enter a valid date of report.';
  end;
  if nullif(btrim(reviewed.subject), '') is null then raise exception 'Subject is required.'; end if;
  if nullif(btrim(reviewed.source_contact), '') is null then raise exception 'Contact of source is required.'; end if;
  if reviewed.inbox is null or reviewed.inbox not in ('Doctor''s Inbox', 'Patient''s File') then raise exception 'Select a supported inbox type.'; end if;
  if reviewed.store_in is null or reviewed.store_in not in ('Correspondence', 'Investigations') then raise exception 'Select Correspondence or Investigations.'; end if;
  if reviewed.document_category is null or reviewed.document_category not in (
    'Admissions summary', 'Advance care planning', 'Allied health letter', 'Certificate',
    'Clinical notes', 'Clinical photograph', 'Consent form', 'DAS21', 'Discharge summary',
    'ECG', 'Email', 'Form', 'Immunisation', 'Indigenous PIP', 'Letter', 'Medical imaging report',
    'MyHealth registration', 'New PT registration form', 'Pathology results', 'Patient consent',
    'Record request', 'Referral letter', 'Workcover', 'Workcover consent'
  ) then raise exception 'Select a supported category.'; end if;
  if reviewed.inbox <> (case when reviewed.document_category in (
    'Admissions summary', 'Advance care planning', 'Allied health letter', 'Clinical notes',
    'Discharge summary', 'ECG', 'Letter', 'Medical imaging report', 'Pathology results', 'Referral letter'
  ) then 'Doctor''s Inbox' else 'Patient''s File' end) then
    raise exception 'Inbox Type must follow the document category. Select the category again.';
  end if;
  if reviewed.inbox = 'Doctor''s Inbox' then
    if nullif(btrim(reviewed.assigned_user), '') is null or reviewed.doctor_id is null or reviewed.user_verified is not true then
      raise exception 'Select and verify a database GP doctor.';
    end if;
    if not exists (select 1 from public.doctors where id = reviewed.doctor_id and active is not false) then
      raise exception 'The selected GP doctor is unavailable. Select an active database GP doctor.';
    end if;
    if not exists (select 1 from public.doctors d where d.id = reviewed.doctor_id
      and lower(btrim(d.full_name)) = lower(btrim(reviewed.assigned_user))) then
      raise exception 'The GP name does not match the selected database GP. Select the GP again.';
    end if;
  else
    reviewed.doctor_id := null;
    reviewed.assigned_user := '';
    reviewed.user_verified := false;
  end if;

  update public.documents set
    patient_name = btrim(reviewed.patient_name), patient_id = reviewed.patient_id,
    patient_dob = reviewed.patient_dob, patient_verified = reviewed.patient_verified,
    extracted_patient = coalesce(current_doc.extracted_patient, reviewed.extracted_patient),
    matched_identifier_count = reviewed.matched_identifier_count,
    report_date = report_day::text, subject = btrim(reviewed.subject),
    source_contact = btrim(reviewed.source_contact), inbox = reviewed.inbox,
    store_in = reviewed.store_in, document_category = reviewed.document_category,
    assigned_user = btrim(reviewed.assigned_user), doctor_id = reviewed.doctor_id,
    user_verified = reviewed.user_verified, demographics = reviewed.demographics,
    highlights = reviewed.highlights, ocr_character_count = reviewed.ocr_character_count,
    processing_error = null, status = 'imported', updated_at = now()
  where id = p_document_id;
  if not found then raise exception 'You do not have permission to import this document.'; end if;

  insert into public.document_extractions
    (document_id, patient_id, doctor_id, date_of_report, subject, source_contact, inbox_type, store_in, category, needs_review, updated_at)
  values (p_document_id, reviewed.patient_id, reviewed.doctor_id, report_day, btrim(reviewed.subject),
    btrim(reviewed.source_contact), reviewed.inbox, reviewed.store_in, reviewed.document_category, false, now())
  on conflict (document_id) do update set
    patient_id = excluded.patient_id, doctor_id = excluded.doctor_id, date_of_report = excluded.date_of_report,
    subject = excluded.subject, source_contact = excluded.source_contact, inbox_type = excluded.inbox_type,
    store_in = excluded.store_in, category = excluded.category, needs_review = false, updated_at = now();

  insert into public.filings
    (document_id, patient_id, doctor_id, date_of_report, subject, source_contact, inbox_type, store_in, category, approved_by, approved_at, status)
  values (p_document_id, reviewed.patient_id, reviewed.doctor_id, report_day, btrim(reviewed.subject),
    btrim(reviewed.source_contact), reviewed.inbox, reviewed.store_in, reviewed.document_category, auth.uid(), now(), 'filed')
  on conflict (document_id) do update set
    patient_id = excluded.patient_id, doctor_id = excluded.doctor_id, date_of_report = excluded.date_of_report,
    subject = excluded.subject, source_contact = excluded.source_contact, inbox_type = excluded.inbox_type,
    store_in = excluded.store_in, category = excluded.category, approved_by = excluded.approved_by,
    approved_at = excluded.approved_at, status = 'filed';
end;
$$;

revoke all on function public.file_workspace_document(uuid, jsonb) from public, anon;
grant execute on function public.file_workspace_document(uuid, jsonb) to authenticated;
