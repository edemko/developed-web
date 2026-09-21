begin;
set local lock_timeout='500ms';
set local statement_timeout='10s';

-- Additive staging: strict legacy rejection is a separate, coordinated switch
-- after the broker and central runtime are installed. Never infer old OAuth
-- session ownership from a user/client/timestamp combination.
alter table accounts.settings add column browser_binding_required boolean not null default false;
create table accounts.browser_families (
  id uuid primary key,
  user_id uuid not null references core.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(id,user_id)
);
create index browser_families_user_idx on accounts.browser_families(user_id);
alter table accounts.sessions add column browser_family_id uuid;
alter table accounts.sessions add constraint sessions_browser_family_user_fk
  foreign key(browser_family_id,user_id) references accounts.browser_families(id,user_id);
create index sessions_browser_family_idx on accounts.sessions(browser_family_id) where browser_family_id is not null;
-- One known live portal session, one new family. This intentionally makes NO
-- claims about existing delegated OAuth sessions; those need a fresh login.
insert into accounts.browser_families(id,user_id)
  select id,user_id from accounts.sessions where user_id is not null and revoked_at is null and expires_at>now();
update accounts.sessions set browser_family_id=id
  where user_id is not null and revoked_at is null and expires_at>now();

create table accounts.oauth_code_bindings (
  code_hash text primary key check(code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references core.profiles(id),
  client_id uuid not null references accounts.oauth_clients(client_id),
  browser_family_id uuid,
  security_version bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  foreign key(browser_family_id,user_id) references accounts.browser_families(id,user_id)
);
create index oauth_code_bindings_family_idx on accounts.oauth_code_bindings(browser_family_id) where browser_family_id is not null;
create index oauth_code_bindings_user_idx on accounts.oauth_code_bindings(user_id);
create index oauth_code_bindings_client_idx on accounts.oauth_code_bindings(client_id);
create index oauth_code_bindings_expiry_idx on accounts.oauth_code_bindings(expires_at);
create table accounts.browser_delegations (
  provider_session_id uuid primary key,
  user_id uuid not null references core.profiles(id),
  client_id uuid not null references accounts.oauth_clients(client_id),
  browser_family_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(browser_family_id,user_id) references accounts.browser_families(id,user_id)
);
create index browser_delegations_family_idx on accounts.browser_delegations(browser_family_id);
create index browser_delegations_user_idx on accounts.browser_delegations(user_id);
create index browser_delegations_client_idx on accounts.browser_delegations(client_id);
-- Tombstones outlive opaque-session housekeeping. No cascade/cleanup here can
-- resurrect delegated access, delete accounts, or affect native/device data.
alter table accounts.browser_families enable row level security;
alter table accounts.oauth_code_bindings enable row level security;
alter table accounts.browser_delegations enable row level security;
revoke all on accounts.browser_families,accounts.oauth_code_bindings,accounts.browser_delegations from public,anon,authenticated;
grant select,insert,update on accounts.browser_families,accounts.oauth_code_bindings,accounts.browser_delegations to developed_accounts;
create policy central_service on accounts.browser_families to developed_accounts using(true) with check(true);
create policy central_service on accounts.oauth_code_bindings to developed_accounts using(true) with check(true);
create policy central_service on accounts.browser_delegations to developed_accounts using(true) with check(true);

-- Keep the existing narrowly owned, non-public RLS helper: ownership policies,
-- native OAuth clients and independent device/integration checks are unchanged.
create or replace function accounts.app_request_allowed(expected_app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from accounts.app_settings a
    where a.app_id=expected_app and (
      not a.enforce_oidc or (
        (select auth.uid()) is not null
        and a.published and a.join_policy<>'closed'
        and exists(select 1 from core.apps c where c.id=a.app_id and c.status='ACTIVE' and c.deleted_at is null)
        and exists(select 1 from auth.users u where u.id=(select auth.uid()) and u.email_confirmed_at is not null)
        and not exists(select 1 from accounts.security_state st where st.user_id=(select auth.uid())
          and (st.locked or st.operation_id is not null or st.require_password_change))
        and exists(select 1 from auth.sessions s join accounts.oauth_clients oc on oc.client_id=s.oauth_client_id
          where s.id::text=(select auth.jwt()->>'session_id') and s.user_id=(select auth.uid())
          and oc.app_id=a.app_id and oc.enabled and oc.client_id::text=(select auth.jwt()->>'client_id')
          and (s.not_after is null or s.not_after>now())
          and s.created_at>coalesce((select st.revoked_before from accounts.security_state st where st.user_id=s.user_id),'-infinity'::timestamptz)
          and (oc.client_kind='native' or (
            exists(select 1 from accounts.browser_delegations d join accounts.browser_families f on f.id=d.browser_family_id
              where d.provider_session_id=s.id and d.user_id=s.user_id and d.client_id=s.oauth_client_id
                and f.user_id=s.user_id and f.revoked_at is null
                and exists(select 1 from accounts.sessions cs join auth.sessions ps on ps.id=cs.provider_session_id and ps.user_id=cs.user_id
                  where cs.browser_family_id=f.id and cs.user_id=f.user_id and cs.mfa_pending is null
                    and cs.revoked_at is null and cs.expires_at>now() and cs.last_seen_at>now()-interval '24 hours'
                    and (ps.not_after is null or ps.not_after>now())))
            or (not (select st.browser_binding_required from accounts.settings st where st.singleton)
              and not exists(select 1 from accounts.browser_delegations d where d.provider_session_id=s.id))
          )))
        and exists(select 1 from core.app_access m where m.user_id=(select auth.uid()) and m.app_id=a.app_id)
        and not exists(select 1 from accounts.entitlements e where e.user_id=(select auth.uid()) and e.app_id=a.app_id
          and (e.suspended or (e.expires_at is not null and e.expires_at<=now())))
      )
    )
  );
$$;
alter function accounts.app_request_allowed(text) owner to developed_accounts;
revoke all on function accounts.app_request_allowed(text) from public,anon;
grant execute on function accounts.app_request_allowed(text) to authenticated;
commit;
