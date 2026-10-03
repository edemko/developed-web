begin;
alter table accounts.reports
  add column source_url text check (length(source_url) <= 4096),
  add column screenshot_ciphertext text check (length(screenshot_ciphertext) <= 2000000);

-- Images are public by unguessable, rotating ID; uploads require an account session.
create table accounts.avatars (
  user_id uuid primary key references core.profiles(id),
  id uuid not null unique,
  image bytea not null check (octet_length(image) between 1 and 131072)
);
alter table accounts.avatars enable row level security;
revoke all on accounts.avatars from public, anon, authenticated;
grant select, insert, update, delete on accounts.avatars to developed_accounts;
create policy central_service on accounts.avatars to developed_accounts using (true) with check (true);
commit;
