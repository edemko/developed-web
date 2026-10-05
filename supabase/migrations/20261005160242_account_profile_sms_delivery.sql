begin;
set local lock_timeout='500ms';
set local statement_timeout='10s';
-- Keep gateway diagnostics in the existing private, RLS-protected table.
-- Existing rows cannot be backfilled: the old sender discarded message IDs.
alter table accounts.profile_phone_challenges
  add column provider_message_id text,
  add column delivery_status text not null default 'unknown'
    check(delivery_status in ('accepted','sent','delivered','failed','unknown')),
  add column delivery_error_code text,
  add column delivery_checked_at timestamptz;
commit;
