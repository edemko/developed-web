begin;
set local lock_timeout='500ms';
set local statement_timeout='5s';
-- Preserve the existing KešTrek client; allow independent music platform clients.
alter table accounts.oauth_clients add column platform text;
update accounts.oauth_clients set platform='android' where client_kind='native';
alter table accounts.oauth_clients add constraint oauth_native_platform check
 ((client_kind='web' and platform is null) or (client_kind='native' and platform is not null and platform in ('android','macos','ios')));
alter table accounts.oauth_clients drop constraint oauth_clients_check;
alter table accounts.oauth_clients add constraint oauth_clients_check check
 ((client_kind='web' and callback_url ~ '^https://') or
  (client_kind='native' and ((app_id='app_kestrek' and callback_url='sk.kestrek://oauth/callback') or
   (app_id='app_mega_music' and callback_url='sk.developed.megamusic://oauth/callback'))));
drop index accounts.oauth_clients_callback_idx;
create unique index oauth_clients_callback_idx on accounts.oauth_clients(callback_url) where enabled and client_kind='web';
create unique index oauth_clients_native_platform_idx on accounts.oauth_clients(app_id,platform) where enabled and client_kind='native';
create table accounts.product_registrations (
 user_id uuid not null references auth.users(id) on delete cascade,
 app_id text not null references accounts.app_settings(app_id),
 created_at timestamptz not null default now(),
 primary key(user_id,app_id)
);
alter table accounts.product_registrations enable row level security;
revoke all on accounts.product_registrations from public,anon,authenticated;
grant select,insert on accounts.product_registrations to developed_accounts;
create policy central_service on accounts.product_registrations to developed_accounts using(true) with check(true);
commit;
