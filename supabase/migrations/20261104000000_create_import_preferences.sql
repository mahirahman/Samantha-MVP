create table public.import_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  folder_name text not null,
  updated_at timestamptz not null default now()
);

alter table public.import_preferences enable row level security;

create policy "Users can manage their own import preference"
  on public.import_preferences
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.import_preferences to authenticated;