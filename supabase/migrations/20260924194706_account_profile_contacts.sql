-- Central verified contacts; existing numbers keep slot 1 and ciphertext context.
begin;
set local lock_timeout='500ms';
set local statement_timeout='10s';
alter table accounts.verified_phones add column id uuid not null default gen_random_uuid(),
  add column slot smallint not null default 1 check(slot between 1 and 3);
alter table accounts.verified_phones drop constraint verified_phones_pkey;
alter table accounts.verified_phones add primary key(id), add unique(user_id,slot);
grant delete on accounts.verified_phones to developed_accounts;
create table accounts.profile_phone_challenges (
  id uuid primary key, user_id uuid not null references core.profiles(id) on delete cascade,
  security_version bigint not null, replace_id uuid,
  phone_lookup text not null, phone_ciphertext text not null, code_hash text not null,
  attempts smallint not null default 0 check(attempts between 0 and 5),
  status text not null default 'pending' check(status in ('pending','sent','failed','consumed','locked')),
  created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index profile_phone_user_created on accounts.profile_phone_challenges(user_id,created_at desc);
create index profile_phone_lookup_created on accounts.profile_phone_challenges(phone_lookup,created_at desc);
alter table accounts.profile_phone_challenges enable row level security;
create policy central_service on accounts.profile_phone_challenges to developed_accounts using(true) with check(true);
grant select,insert,update,delete on accounts.profile_phone_challenges to developed_accounts;
commit;
