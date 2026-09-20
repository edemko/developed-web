begin;
set local lock_timeout='500ms';
set local statement_timeout='5s';

-- One product entitlement, multiple independently bound OAuth clients.
-- app_settings.oauth_client_id/callback_url remain web-configuration mirrors
-- for old operator artifacts; runtime authorization uses this registry only.
create table accounts.oauth_clients (
  client_id uuid primary key,
  app_id text not null references accounts.app_settings(app_id),
  client_kind text not null check(client_kind in ('web','native')),
  callback_url text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check ((client_kind='web' and callback_url ~ '^https://') or
    (client_kind='native' and app_id='app_kestrek' and callback_url='sk.kestrek://oauth/callback'))
);
create index oauth_clients_app_idx on accounts.oauth_clients(app_id);
create unique index oauth_clients_callback_idx on accounts.oauth_clients(callback_url) where enabled;
create unique index oauth_clients_web_app_idx on accounts.oauth_clients(app_id) where client_kind='web' and enabled;
alter table accounts.oauth_clients enable row level security;
revoke all on accounts.oauth_clients from public,anon,authenticated;
grant select,insert,update on accounts.oauth_clients to developed_accounts;
create policy central_service on accounts.oauth_clients to developed_accounts using(true) with check(true);
insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url)
  select oauth_client_id,app_id,'web',callback_url from accounts.app_settings
  where oauth_client_id is not null and callback_url is not null;

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
grant execute on function accounts.app_request_allowed(text) to authenticated;
commit;
