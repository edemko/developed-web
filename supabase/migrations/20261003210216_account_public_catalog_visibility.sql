-- Separate anonymous discovery from signed-in availability. Existing apps retain
-- their current public visibility. Private apps can still be published to users.
BEGIN;
ALTER TABLE accounts.app_settings ADD COLUMN IF NOT EXISTS public_listing boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN accounts.app_settings.public_listing IS 'Show in anonymous catalog; independent of published authenticated availability';
COMMIT;
