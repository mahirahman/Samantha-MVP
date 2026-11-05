-- Preserve files, metadata and the previous tab when documents are recycled.
alter table public.documents
  add column if not exists deleted_at timestamptz,
  add column if not exists previous_status text;

create or replace function public.track_document_recycling()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'deleted' and old.status <> 'deleted' then
    new.previous_status = old.status;
    new.deleted_at = now();
  elsif old.status = 'deleted' and new.status <> 'deleted' then
    new.deleted_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists track_document_recycling on public.documents;
create trigger track_document_recycling before update of status on public.documents
  for each row execute function public.track_document_recycling();

create index if not exists documents_recycle_bin_idx
  on public.documents (uploaded_by, deleted_at desc) where status = 'deleted';
