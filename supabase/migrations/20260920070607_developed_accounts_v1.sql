-- Private central account service. Apply only after reviewed core baseline.
-- No auth-user recreation, product data moves, or automatic deletion cascades.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create schema accounts;
revoke all on schema accounts from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'developed_accounts') then
    create role developed_accounts nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

create table accounts.settings (
  singleton boolean primary key default true check (singleton),
  registration_mode text not null default 'closed' check (registration_mode in ('open','invitation','closed')),
  updated_at timestamptz not null default now()
);
insert into accounts.settings(singleton) values (true);
create table accounts.security_state (
  user_id uuid primary key references core.profiles(id),
  locked boolean not null default false,
  security_version bigint not null default 1 check(security_version > 0),
  revoked_before timestamptz not null default '-infinity',
  operation_id uuid,
  operation_started_at timestamptz,
  require_password_change boolean not null default false,
  language text not null default 'en' check(language in ('en','sk','cs','uk')),
  updated_at timestamptz not null default now()
);
create table accounts.sessions (
  id uuid primary key,
  token_hash text not null unique check(length(token_hash)=64),
  csrf_hash text not null check(length(csrf_hash)=64),
  user_id uuid references core.profiles(id),
  provider_session_id uuid,
  provider_tokens text,
  refresh_id uuid,
  refresh_started_at timestamptz,
  security_version bigint,
  created_at timestamptz not null default now(),
  authenticated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check ((user_id is null and provider_tokens is null) or (user_id is not null and provider_session_id is not null and provider_tokens is not null))
);
create index sessions_user_active_idx on accounts.sessions(user_id) where revoked_at is null;
create index sessions_expiry_idx on accounts.sessions(expires_at);
create table accounts.app_settings (
  app_id text primary key references core.apps(id),
  slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  oauth_client_id uuid unique,
  server_key_hash text unique check(server_key_hash is null or length(server_key_hash)=64),
  launch_url text not null check(launch_url ~ '^https://'),
  callback_url text unique check(callback_url is null or callback_url ~ '^https://'),
  published boolean not null default false,
  reportable boolean not null default false,
  enforce_oidc boolean not null default false,
  join_policy text not null default 'closed' check(join_policy in ('free','invitation','closed')),
  free_plan text not null default 'free',
  updated_at timestamptz not null default now()
);
create table accounts.entitlements (
  user_id uuid not null references core.profiles(id),
  app_id text not null references core.apps(id),
  plan text not null,
  source text not null check(source in ('free','manual','legacy','paid')),
  suspended boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id,app_id)
);
create index entitlements_app_idx on accounts.entitlements(app_id,user_id);
create table accounts.credentials (
  token_hash text primary key check(length(token_hash)=64),
  purpose text not null check(purpose in ('verification','recovery','email_change','invitation')),
  user_id uuid references core.profiles(id),
  email text not null,
  security_version bigint,
  return_app_id text references core.apps(id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index credentials_user_idx on accounts.credentials(user_id,purpose);
create index credentials_return_app_idx on accounts.credentials(return_app_id) where return_app_id is not null;
create index credentials_expiry_idx on accounts.credentials(expires_at);
create table accounts.rate_limits (
  bucket_hash text primary key,
  count integer not null check(count>0),
  expires_at timestamptz not null
);
create index rate_limits_expiry_idx on accounts.rate_limits(expires_at);
create table accounts.audit (
  id bigint generated always as identity primary key,
  actor_id uuid references core.profiles(id),
  target_id uuid references core.profiles(id),
  action text not null,
  result text not null check(result in ('started','succeeded','failed','pending')),
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_target_date_idx on accounts.audit(target_id,created_at desc);
create index audit_actor_idx on accounts.audit(actor_id);
create table accounts.outbox (
  id uuid primary key,
  payload text not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_id uuid,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);
create index outbox_pending_idx on accounts.outbox(available_at) where delivered_at is null and failed_at is null;
create table accounts.reports (
  id uuid primary key,
  ticket bigint generated always as identity unique,
  app_id text references core.apps(id), -- NULL is DevelopED itself, not a guessed product.
  idempotency_hash text not null unique,
  payload_hash text not null,
  reporter_id uuid references core.profiles(id),
  contact_email text,
  contact_verified boolean not null default false,
  summary text not null check(length(summary)<=160),
  description text not null check(length(description) between 1 and 10000),
  steps text not null default '' check(length(steps)<=5000),
  expected text not null default '' check(length(expected)<=2000),
  actual text not null default '' check(length(actual)<=2000),
  diagnostics jsonb not null default '{}',
  occurred_at timestamptz,
  status text not null default 'new' check(status in ('new','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_app_date_idx on accounts.reports(app_id,created_at desc);
create index reports_status_date_idx on accounts.reports(status,created_at desc);
create index reports_reporter_date_idx on accounts.reports(reporter_id,created_at desc);
create table accounts.report_notes (
  id uuid primary key,
  report_id uuid not null references accounts.reports(id),
  actor_id uuid not null references core.profiles(id),
  note text not null check(length(note) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index report_notes_report_idx on accounts.report_notes(report_id,created_at);
create index report_notes_actor_idx on accounts.report_notes(actor_id);

-- Unexposed schema, explicit role and RLS as defense in depth. Only this central
-- backend has platform account authority; app roles get no direct table grant.
grant usage on schema accounts to developed_accounts;
do $$ declare t text; begin
  foreach t in array array['settings','security_state','sessions','app_settings','entitlements','credentials','rate_limits','audit','outbox','reports','report_notes'] loop
    execute format('alter table accounts.%I enable row level security', t);
    execute format('create policy central_service on accounts.%I to developed_accounts using (true) with check (true)', t);
    execute format('grant select,insert,update on accounts.%I to developed_accounts', t);
  end loop;
end $$;
revoke update on accounts.audit, accounts.report_notes from developed_accounts;
grant delete on accounts.sessions,accounts.rate_limits to developed_accounts;
grant usage,select on all sequences in schema accounts to developed_accounts;
alter default privileges in schema accounts revoke all on tables from public,anon,authenticated;
alter default privileges in schema accounts revoke execute on functions from public;
grant usage on schema core,auth to developed_accounts;
grant select on core.profiles,core.apps,core.app_access to developed_accounts;
grant update(display_name,photo_url,updated_at) on core.profiles to developed_accounts;
grant insert(id,user_id,app_id,role) on core.app_access to developed_accounts;
create policy developed_accounts_profiles_read on core.profiles for select to developed_accounts using (true);
create policy developed_accounts_profiles_update on core.profiles for update to developed_accounts using (true) with check (true);
create policy developed_accounts_apps_read on core.apps for select to developed_accounts using (true);
create policy developed_accounts_access_read on core.app_access for select to developed_accounts using (true);
create policy developed_accounts_access_insert on core.app_access for insert to developed_accounts with check (
  role = 'USER' and exists(select 1 from accounts.app_settings a where a.app_id = app_access.app_id)
);
-- Provider column grants deliberately exclude password hashes and signing data.
grant select(id,email,email_confirmed_at,created_at) on auth.users to developed_accounts;
grant select(id,user_id,created_at,not_after,oauth_client_id) on auth.sessions to developed_accounts;
-- GoTrue enables RLS on users/sessions. Column grants alone return zero rows.
-- These SELECT-only policies do not permit credential or session mutations.
create policy developed_accounts_identity_read on auth.users for select to developed_accounts using (true);
create policy developed_accounts_session_read on auth.sessions for select to developed_accounts using (true);
grant select(authorization_id,client_id,user_id,redirect_uri,scope,code_challenge_method,nonce,status,expires_at)
  on auth.oauth_authorizations to developed_accounts;

-- Restrictive product RLS companion. Existing ownership policies are retained.
-- The explicit per-app cutover flag preserves legacy access UNTIL reviewed
-- cutover, and is deliberately not mutable through the portal policy endpoint.
create function accounts.app_request_allowed(expected_app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from accounts.app_settings a
    where a.app_id=expected_app and (
      not a.enforce_oidc or (
        (select auth.uid()) is not null
        and a.oauth_client_id::text=(select auth.jwt()->>'client_id')
        and a.published and a.join_policy<>'closed'
        and exists(select 1 from core.apps c where c.id=a.app_id and c.status='ACTIVE' and c.deleted_at is null)
        and exists(select 1 from auth.users u where u.id=(select auth.uid()) and u.email_confirmed_at is not null)
        and not exists(select 1 from accounts.security_state st where st.user_id=(select auth.uid())
          and (st.locked or st.operation_id is not null or st.require_password_change))
        and exists(select 1 from auth.sessions s where s.id::text=(select auth.jwt()->>'session_id')
          and s.user_id=(select auth.uid()) and s.oauth_client_id=a.oauth_client_id
          and (s.not_after is null or s.not_after>now())
          and s.created_at>coalesce((select st.revoked_before from accounts.security_state st where st.user_id=s.user_id),'-infinity'::timestamptz))
        and exists(select 1 from core.app_access m where m.user_id=(select auth.uid()) and m.app_id=a.app_id)
        and not exists(select 1 from accounts.entitlements e where e.user_id=(select auth.uid()) and e.app_id=a.app_id
          and (e.suspended or (e.expires_at is not null and e.expires_at<=now())))
      )
    )
  );
$$;
alter function accounts.app_request_allowed(text) owner to developed_accounts;
revoke all on function accounts.app_request_allowed(text) from public,anon;
grant usage on schema accounts to authenticated;
grant execute on function accounts.app_request_allowed(text) to authenticated;
commit;
