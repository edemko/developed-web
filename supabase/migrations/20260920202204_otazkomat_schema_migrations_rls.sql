-- The administrative ledger becomes part of an exposed schema. Preserve its
-- owner and ACLs: owner/BYPASSRLS administration is unchanged; no app gets access.
ALTER TABLE otazkomat.schema_migrations ENABLE ROW LEVEL SECURITY;
