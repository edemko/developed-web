-- Airsoft Marketplace registration SMS verification. Phone numbers and OTPs
-- never appear in plaintext in the shared database. The application encrypts
-- phone values and stores keyed lookups/hashes for matching and uniqueness.
begin;
set local lock_timeout='500ms';
set local statement_timeout='10s';

create table accounts.sms_challenges (
  id uuid primary key,
  session_id uuid not null,
  app_id text not null references core.apps(id),
  phone_lookup text not null check (length(phone_lookup)=64),
  phone_ciphertext text not null,
  binding_hash text not null check (length(binding_hash)=64),
  code_hash text not null check (length(code_hash)=64),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  status text not null default 'pending' check (status in ('pending','sent','failed','verified','locked','consumed')),
  provider_message_id text check (provider_message_id is null or provider_message_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  provider_status text check (provider_status is null or provider_status ~ '^[a-z0-9_]{1,80}$'),
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index sms_challenges_phone_created_idx on accounts.sms_challenges(phone_lookup,created_at desc);
create index sms_challenges_expiry_idx on accounts.sms_challenges(expires_at);
create unique index sms_challenges_consumed_phone_idx on accounts.sms_challenges(phone_lookup) where status='consumed';

create table accounts.verified_phones (
  user_id uuid primary key references core.profiles(id) on delete cascade,
  phone_lookup text not null unique check (length(phone_lookup)=64),
  phone_ciphertext text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table accounts.sms_challenges enable row level security;
alter table accounts.verified_phones enable row level security;
create policy central_service on accounts.sms_challenges to developed_accounts using (true) with check (true);
create policy central_service on accounts.verified_phones to developed_accounts using (true) with check (true);
grant select,insert,update,delete on accounts.sms_challenges to developed_accounts;
grant select,insert,update on accounts.verified_phones to developed_accounts;

commit;
