-- Additive, staged only. Provider factor secrets remain inaccessible to the
-- portal's SQL role; enrollment/challenge/verification use private Auth APIs.
begin;
alter table accounts.sessions add column mfa_pending text check(mfa_pending in ('enroll','challenge'));
alter table accounts.sessions add column mfa_enrollment_id uuid;
grant select(aal) on auth.sessions to developed_accounts;
grant select(id,user_id,status,factor_type) on auth.mfa_factors to developed_accounts;
create policy developed_accounts_factor_read on auth.mfa_factors for select to developed_accounts using(true);
commit;
