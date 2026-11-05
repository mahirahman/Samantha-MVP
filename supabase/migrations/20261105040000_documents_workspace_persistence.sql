-- Migration: 20261105040000_documents_workspace_persistence.sql
-- Enables persistence of workspace documents, status changes, OCR highlights,
-- and duplicate prevention tracking across page refreshes.

-- 1. Relax storage_path nullability and set empty string default if needed
alter table public.documents
  alter column storage_path drop not null,
  alter column storage_path set default '';

-- 2. Update status check constraint to support workspace statuses: check, verified, imported, error
alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
  check (status = any (array[
    'check'::text,
    'verified'::text,
    'imported'::text,
    'error'::text,
    'uploaded'::text,
    'processing'::text,
    'needs_review'::text,
    'ready_to_file'::text,
    'filed'::text,
    'failed'::text,
    'deleted'::text
  ]));

alter table public.documents
  alter column status set default 'check'::text;

-- 3. Add workspace columns to public.documents for complete state tracking
alter table public.documents
  add column if not exists file_size bigint default 0,
  add column if not exists file_last_modified bigint default 0,
  add column if not exists patient_name text default '',
  add column if not exists patient_dob text default '',
  add column if not exists patient_id uuid references public.patients(id) on delete set null,
  add column if not exists patient_verified boolean default false,
  add column if not exists matched_identifier_count integer default 0,
  add column if not exists assigned_user text default '',
  add column if not exists doctor_id uuid references public.doctors(id) on delete set null,
  add column if not exists user_verified boolean default false,
  add column if not exists inbox text default 'Doctor''s Inbox',
  add column if not exists store_in text default 'Correspondence',
  add column if not exists subject text default '',
  add column if not exists source_contact text default '',
  add column if not exists report_date text default '',
  add column if not exists ocr_character_count integer default 0,
  add column if not exists processing_error text,
  add column if not exists highlights jsonb default '[]'::jsonb,
  add column if not exists demographics jsonb default '{}'::jsonb;

-- 4. Enable RLS and grant permissions on public.documents
alter table public.documents enable row level security;

drop policy if exists "Authenticated users can select documents" on public.documents;
create policy "Authenticated users can select documents"
  on public.documents
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert documents" on public.documents;
create policy "Authenticated users can insert documents"
  on public.documents
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update documents" on public.documents;
create policy "Authenticated users can update documents"
  on public.documents
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete documents" on public.documents;
create policy "Authenticated users can delete documents"
  on public.documents
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.documents to authenticated;

-- 5. Enable RLS and grant permissions on public.document_extractions
alter table public.document_extractions enable row level security;

drop policy if exists "Authenticated users can manage document_extractions" on public.document_extractions;
create policy "Authenticated users can manage document_extractions"
  on public.document_extractions
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.document_extractions to authenticated;

-- 6. Enable RLS and grant permissions on public.filings
alter table public.filings enable row level security;

drop policy if exists "Authenticated users can manage filings" on public.filings;
create policy "Authenticated users can manage filings"
  on public.filings
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.filings to authenticated;

-- 7. Enable RLS and grant permissions on public.audit_logs
alter table public.audit_logs enable row level security;

drop policy if exists "Authenticated users can manage audit_logs" on public.audit_logs;
create policy "Authenticated users can manage audit_logs"
  on public.audit_logs
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.audit_logs to authenticated;

-- 8. Storage bucket setup for documents
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload documents" on storage.objects;
create policy "Authenticated users can upload documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

drop policy if exists "Authenticated and public users can read documents" on storage.objects;
create policy "Authenticated and public users can read documents"
  on storage.objects for select
  using (bucket_id = 'documents');

drop policy if exists "Authenticated users can update documents" on storage.objects;
create policy "Authenticated users can update documents"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents');

drop policy if exists "Authenticated users can delete documents" on storage.objects;
create policy "Authenticated users can delete documents"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');

