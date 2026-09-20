-- Disposable qualification databases ONLY. Real Supabase already provides
-- these platform roles/extensions. This is not a production migration.
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin; end if;
  if not exists(select 1 from pg_roles where rolname='supabase_storage_admin') then create role supabase_storage_admin nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator noinherit nologin; end if;
end $$;
grant usage on schema extensions to anon,authenticated,service_role;
