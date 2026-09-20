-- CUTOVER ONLY. Do not apply while legacy browser/native JWT access is expected.
-- Backend app APIs continue using their server role and explicit owner checks.
-- This closes direct PostgREST/RPC reads and writes made with old password tokens
-- or another product's delegated JWT; preserving RLS alone would not close them.
BEGIN;
REVOKE ALL ON SCHEMA kestrek FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA kestrek FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA kestrek FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA kestrek FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA kestrek REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA kestrek REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA kestrek REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
COMMIT;
