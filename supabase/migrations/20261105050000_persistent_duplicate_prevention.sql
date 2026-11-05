-- Keep filename-based duplicate checks consistent with the upload UI.
-- Existing documents are retained, including any historical duplicates.
create index if not exists documents_active_normalized_filename_idx
  on public.documents (lower(btrim(file_name)), uploaded_by)
  where status <> 'deleted';

create or replace function public.prevent_duplicate_workspace_document()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'deleted' then
    return new;
  end if;
  if TG_OP = 'UPDATE' then
    if old.status <> 'deleted'
       and lower(btrim(old.file_name)) = lower(btrim(new.file_name))
       and old.uploaded_by is not distinct from new.uploaded_by then
      return new;
    end if;
  end if;

  -- Serialize concurrent imports of the same name before checking existence.
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(new.file_name)), 0));
  if exists (
    select 1 from public.documents d
    where lower(btrim(d.file_name)) = lower(btrim(new.file_name))
      and d.id <> new.id
      and d.status <> 'deleted'
      and (d.uploaded_by = new.uploaded_by or d.uploaded_by is null or new.uploaded_by is null)
  ) then
    raise exception 'Document already exists in the workspace: %', new.file_name
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_workspace_document on public.documents;
create trigger prevent_duplicate_workspace_document
  before insert or update of file_name, uploaded_by, status on public.documents
  for each row execute function public.prevent_duplicate_workspace_document();

-- Track edits made through every database client, including status changes.
create or replace function public.touch_workspace_document()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_workspace_document on public.documents;
create trigger touch_workspace_document
  before update on public.documents
  for each row execute function public.touch_workspace_document();
