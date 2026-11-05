alter table public.patients enable row level security;

create policy "Authenticated users can view patients"
  on public.patients
  for select
  to authenticated
  using (true);

create policy "Authenticated users can create patients"
  on public.patients
  for insert
  to authenticated
  with check (true);

grant select, insert on public.patients to authenticated;
