begin;
set local lock_timeout='500ms';
set local statement_timeout='10s';

-- Independent opt-in browser credential, never a signed-in session by itself.
-- Only its hash is stored. No provider tokens, passwords or factor secrets.
create table accounts.browser_trust (
  id uuid primary key,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references core.profiles(id),
  factor_id uuid not null,
  security_version bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique(id,user_id),
  check(expires_at>created_at and expires_at<=created_at+interval '14 days')
);
create index browser_trust_user_idx on accounts.browser_trust(user_id);
alter table accounts.browser_trust enable row level security;
revoke all on accounts.browser_trust from public,anon,authenticated;
grant select,insert,update on accounts.browser_trust to developed_accounts;
create policy central_service on accounts.browser_trust to developed_accounts using(true) with check(true);

create function accounts.browser_trust_valid(trust_id uuid,owner_id uuid,version bigint) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from accounts.browser_trust t
    join accounts.security_state st on st.user_id=t.user_id
    join auth.mfa_factors f on f.id=t.factor_id and f.user_id=t.user_id
    where t.id=trust_id and t.user_id=owner_id and t.security_version=version
      and t.security_version=st.security_version and not st.locked
      and not st.require_password_change and st.operation_id is null
      and t.created_at>st.revoked_before and t.revoked_at is null and t.expires_at>now()
      and f.status='verified' and f.factor_type='totp');
$$;
revoke all on function accounts.browser_trust_valid(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function accounts.browser_trust_valid(uuid,uuid,bigint) to developed_accounts;

-- Nullable: old/password-only sessions keep their existing policy.
alter table accounts.sessions add column mfa_remember_until timestamptz;
alter table accounts.sessions add column mfa_trust_id uuid;
alter table accounts.sessions add constraint sessions_mfa_trust_user_fk
  foreign key(mfa_trust_id,user_id) references accounts.browser_trust(id,user_id);
create index sessions_mfa_trust_idx on accounts.sessions(mfa_trust_id) where mfa_trust_id is not null;
alter table accounts.sessions add constraint sessions_mfa_remember_valid check (
  mfa_remember_until is null or (
    user_id is not null and provider_session_id is not null and mfa_pending is null
    and mfa_trust_id is not null and browser_family_id is not null
    and mfa_remember_until=expires_at
    and mfa_remember_until>created_at
    and mfa_remember_until<=created_at+interval '14 days'
  )
);

-- Preserve the existing scoped RLS helper and all ownership/client/revocation
-- checks. Only the central remembered-session inactivity rule changes.
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
                    and cs.revoked_at is null and cs.expires_at>now() and (cs.mfa_remember_until>now() or cs.last_seen_at>now()-interval '24 hours')
                    and (cs.mfa_trust_id is null or accounts.browser_trust_valid(cs.mfa_trust_id,cs.user_id,cs.security_version))
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
