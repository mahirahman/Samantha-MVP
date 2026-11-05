alter table public.doctors enable row level security;

create policy "Authenticated users can view doctors"
  on public.doctors
  for select
  to authenticated
  using (true);

create policy "Authenticated users can manage doctors"
  on public.doctors
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.doctors to authenticated;

-- Seed default practice GP doctors if none exist
insert into public.doctors (full_name, email, active)
select d.full_name, d.email, true
from (values
  ('Dr Sarah Jenkins', 'sarah.jenkins@caregp.com.au'),
  ('Dr Michael Chang', 'michael.chang@caregp.com.au'),
  ('Dr Emily Taylor', 'emily.taylor@caregp.com.au'),
  ('Dr Robert Wilson', 'robert.wilson@caregp.com.au')
) as d(full_name, email)
where not exists (select 1 from public.doctors);

