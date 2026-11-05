-- DESTRUCTIVE DATA RESET: deletes ALL application records and ALL login accounts
-- in this Supabase project, including administrator accounts. There is no undo
-- after COMMIT. Run manually as the database administrator only when intended.
-- As a migration, this also runs if included in a future migration deployment.
-- After resetting, seeds a DEMO login: username admin, password admin.
-- The username aliases admin@example.test in the application's sign-in form.
-- This account has the normal authenticated database role, not superuser access.
--
-- Keeps tables, indexes, functions, triggers, policies, database roles and
-- migration history. Does NOT delete Storage objects, buckets or physical files.
-- Supabase Auth's existing ON DELETE CASCADE relationships remove the deleted
-- users' identities and sessions; this script does not alter managed Auth tables.
--
-- Storage ownership or other unlisted foreign keys can block deleting accounts.
-- Resolve those dependencies through the appropriate service before retrying.
-- Never delete storage.objects rows with SQL: that does not remove actual files.
-- Stop application activity before running. Afterwards, clear browser site data
-- and sign in again; SQL cannot clear browser sessions, caches or folder handles.

begin;
set local lock_timeout = '10s';

-- Restrict the reset to the explicitly listed application tables and Auth users.
-- Do not use TRUNCATE ... CASCADE or DROP SCHEMA, which can affect other services.
lock table
  public.audit_logs,
  public.filings,
  public.document_extractions,
  public.documents,
  public.import_preferences,
  public.patients,
  public.doctors,
  auth.users
in access exclusive mode;

do $$
begin
  -- Remove dependents before the records they reference.
  delete from public.audit_logs;
  delete from public.filings;
  delete from public.document_extractions;
  delete from public.documents;
  delete from public.import_preferences;
  delete from public.patients;
  delete from public.doctors;

  -- Includes every account in this project, not only the currently signed-in user.
  delete from auth.users;
exception when foreign_key_violation then
  -- A failed dependency check rolls back ALL deletions in this block/transaction.
  raise exception using
    errcode = '23503',
    message = 'Reset aborted: another record still references the data being deleted. No reset changes were committed.',
    detail = SQLERRM,
    hint = 'Check the referenced table, including Supabase Storage ownership. Resolve the dependency without deleting Storage metadata directly, then retry.';
end;
$$;

-- Seed the replacement account inside the same transaction: a seed failure also
-- rolls back the reset. Enable pgcrypto in Supabase Database > Extensions first.
do $$
declare
  admin_id uuid := gen_random_uuid();
  admin_hash text;
  crypto_schema text;
begin
  select n.nspname into crypto_schema
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto';
  if crypto_schema is null then
    raise exception 'Enable the pgcrypto extension in Supabase before running this reset. No reset changes have been committed.';
  end if;
  execute format('select %I.crypt($1, %I.gen_salt(''bf''))', crypto_schema, crypto_schema)
    into admin_hash using 'admin';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
    'admin@example.test', admin_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"admin","full_name":"Admin"}'::jsonb, false,
    '', '', '', '', '', '', '', '', now(), now()
  );

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at
  ) values (
    gen_random_uuid(), admin_id::text, admin_id,
    jsonb_build_object('sub', admin_id::text, 'email', 'admin@example.test', 'email_verified', true),
    'email', now(), now()
  );
end;
$$;

-- Seed active GP records with fictional example.com email addresses for demo use.
insert into public.doctors (full_name, email, active)
values
  ('Naomi Heath', 'naomi.heath@example.com', true),
  ('George Stoler', 'george.stoler@example.com', true),
  ('Samantha Kuran', 'samantha.kuran@example.com', true),
  ('Sally Wood', 'sally.wood@example.com', true),
  ('Berry Graham', 'berry.graham@example.com', true),
  ('Paul Tassle', 'paul.tassle@example.com', true),
  ('Blainey White', 'blainey.white@example.com', true);

commit;
