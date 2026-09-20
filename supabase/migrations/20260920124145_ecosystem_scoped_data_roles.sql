-- Additive server data roles. No app flag is enabled and no existing role/key
-- is removed here. Apply after app-owned baselines/session migrations.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE app record; relation record; routine record; legacy_policy record; role_name text;
BEGIN
  FOR app IN SELECT * FROM (VALUES
    ('kestrek','kestrek_backend','app_kestrek'),
    ('screentime','screentime_backend','app_screentime'),
    ('voc_builder','vocabulum_backend','app_voc_builder'),
    ('odonto','odonto_backend','app_odonto'),
    ('otazkomat','otazkomat_backend','app_otazkomat')
  ) AS apps(schema_name,role_name,app_id) LOOP
    role_name := app.role_name;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',role_name);
    END IF;
    IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin OR rolinherit)) THEN
      RAISE EXCEPTION 'Unsafe existing role %',role_name;
    END IF;
    -- NOINHERIT alone is insufficient: a member can still SET ROLE. Dedicated
    -- product roles must have no memberships in any other database role.
    IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=role_name) THEN
      RAISE EXCEPTION 'Unexpected role membership for %',role_name;
    END IF;
    -- PostgREST authenticates the signed role claim, then SET LOCAL ROLE.
    EXECUTE format('GRANT %I TO authenticator',role_name);
    IF NOT EXISTS(SELECT FROM pg_namespace WHERE nspname=app.schema_name) THEN
      RAISE EXCEPTION 'Missing app schema %',app.schema_name;
    END IF;
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',app.schema_name,role_name);
    -- UUID defaults and Odonto's unaccent wrapper resolve extension objects as
    -- the caller. USAGE does not grant table access or extension administration.
    EXECUTE format('GRANT USAGE ON SCHEMA extensions TO %I',role_name);
    IF app.schema_name='odonto' THEN
      -- Legacy PUBLIC policies recursively inspect user_profiles. PostgreSQL
      -- expands them even beside an allow-all backend policy, causing infinite
      -- recursion. Keep the same predicates for existing API roles, but exclude
      -- the new dedicated backend. Do not rewrite browser authorization rules.
      FOR legacy_policy IN SELECT tablename,policyname FROM pg_policies
        WHERE schemaname='odonto' AND roles=ARRAY['public']::name[]
      LOOP
        EXECUTE format('ALTER POLICY %I ON odonto.%I TO anon,authenticated,service_role',legacy_policy.policyname,legacy_policy.tablename);
      END LOOP;
    END IF;
    FOR relation IN SELECT c.relname,c.relkind,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=app.schema_name AND c.relkind IN ('r','p','v','m') AND c.relname<>'schema_migrations'
        AND NOT (app.schema_name='voc_builder' AND c.relname='app_users')
    LOOP
      IF relation.relkind IN ('r','p') THEN
        EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I.%I TO %I',app.schema_name,relation.relname,role_name);
        -- Vocabulum deliberately authorizes business data in its server seam.
        -- Preserve existing RLS state there; schema/table ACLs isolate its
        -- backend from every other app. New private session tables already
        -- enable RLS in their own migration and still need the dedicated role.
        IF app.schema_name<>'voc_builder' OR relation.relrowsecurity THEN
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',app.schema_name,relation.relname);
          EXECUTE format('CREATE POLICY ecosystem_backend ON %I.%I TO %I USING(true) WITH CHECK(true)',app.schema_name,relation.relname,role_name);
        END IF;
      ELSE
        -- Existing application views were reviewed for own-app-only output.
        EXECUTE format('GRANT SELECT ON %I.%I TO %I',app.schema_name,relation.relname,role_name);
      END IF;
    END LOOP;
    EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I',app.schema_name,role_name);
    FOR routine IN SELECT p.oid,p.proname,p.prosecdef,p.prorettype FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=app.schema_name AND p.prokind='f'
    LOOP
      -- Session RPCs belong to a distinct Vercel identity-store role, never
      -- the product data backend. Private tables remain in unexposed schemas.
      IF left(routine.proname,19)='ecosystem_identity_' THEN CONTINUE; END IF;
      -- This legacy SECURITY DEFINER routine deletes global auth.users. A
      -- PUBLIC grant would defeat a new role's own-schema-only boundary.
      IF app.schema_name='otazkomat' AND routine.proname='delete_organization_permanently' THEN
        -- Preserve the old trusted backend while removing implicit access for
        -- every newly created role. The central-mode app disables this path.
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',routine.oid::regprocedure);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',routine.oid::regprocedure);
        CONTINUE;
      END IF;
      IF routine.prorettype='trigger'::regtype THEN CONTINUE; END IF;
      -- Reviewed definer routines here touch only the owning app's data.
      -- Other existing definer routines are not implicitly granted.
      IF NOT routine.prosecdef OR (app.schema_name='kestrek' AND routine.proname IN (
        'create_business_selling_atomic','update_business_selling_atomic','delete_business_selling_atomic',
        'insert_business_selling_items_atomic','create_transaction_bundle_atomic','update_transaction_bundle_atomic',
        'insert_transaction_bundle_children_atomic','duplicate_transactions_atomic','merge_transactions_into_bundle_atomic',
        'get_user_subscription','user_has_permission','user_is_admin','can_user_perform_action',
        'increment_folder_transaction_count','decrement_folder_transaction_count'
      )) OR (app.schema_name='screentime' AND routine.proname IN ('ingest_batch','recompute_daily'))
      OR (app.schema_name='otazkomat' AND routine.proname='import_tests_with_questions') THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',routine.oid::regprocedure,role_name);
      END IF;
    END LOOP;
    -- Intentional, filtered identity-directory API. The view's owner reads
    -- selected canonical identity columns; the app never gains auth/core table
    -- privileges or identity writes. It includes only this registered app's
    -- members, never password hashes, sessions, tokens, roles or other apps.
    EXECUTE format('CREATE VIEW %I.identity_directory WITH (security_barrier=true) AS
      SELECT u.id,u.email,u.email_confirmed_at,p.username,p.display_name
      FROM auth.users u JOIN core.app_access a ON a.user_id=u.id AND a.app_id=%L
      JOIN core.profiles p ON p.id=u.id',app.schema_name,app.app_id);
    EXECUTE format('REVOKE ALL ON %I.identity_directory FROM PUBLIC,anon,authenticated,service_role',app.schema_name);
    EXECUTE format('GRANT SELECT ON %I.identity_directory TO %I',app.schema_name,role_name);
  END LOOP;
END $$;

-- Local membership writes must not let a compromised product enumerate
-- canonical profiles by inserting an unrelated UUID into its own membership.
CREATE VIEW voc_builder.ecosystem_app_users WITH (security_barrier=true) AS
  SELECT u.* FROM voc_builder.app_users u WHERE EXISTS(
    SELECT 1 FROM core.app_access a WHERE a.user_id=u.id AND a.app_id='app_voc_builder'
  );
REVOKE ALL ON voc_builder.ecosystem_app_users FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON voc_builder.ecosystem_app_users TO vocabulum_backend;

-- Supabase Storage impersonates the JWT role; permit only each app's bucket.
-- No bucket creation/deletion, global administrative access, or other app data.
DO $$ DECLARE mapping record; BEGIN
  FOR mapping IN SELECT * FROM (VALUES
    ('kestrek_backend',ARRAY['avatars']::text[]),
    ('vocabulum_backend',ARRAY['tts-audio']::text[]),
    ('odonto_backend',ARRAY['study-materials']::text[]),
    ('otazkomat_backend',ARRAY['question-images','content-icons','report-images']::text[])
  ) AS buckets(role_name,bucket_ids) LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA storage TO %I',mapping.role_name);
    EXECUTE format('GRANT SELECT ON storage.buckets TO %I',mapping.role_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO %I',mapping.role_name);
    EXECUTE format('CREATE POLICY %I ON storage.buckets FOR SELECT TO %I USING(id=ANY(%L::text[]))',mapping.role_name||'_buckets',mapping.role_name,mapping.bucket_ids);
    EXECUTE format('CREATE POLICY %I ON storage.objects TO %I USING(bucket_id=ANY(%L::text[])) WITH CHECK(bucket_id=ANY(%L::text[]))',mapping.role_name||'_objects',mapping.role_name,mapping.bucket_ids,mapping.bucket_ids);
    -- A shared instance may already have permissive PUBLIC bucket policies.
    -- Restrictive fences keep those OR-ed policies from broadening this role.
    EXECUTE format('CREATE POLICY %I ON storage.buckets AS RESTRICTIVE FOR SELECT TO %I USING(id=ANY(%L::text[]))',mapping.role_name||'_bucket_fence',mapping.role_name,mapping.bucket_ids);
    EXECUTE format('CREATE POLICY %I ON storage.objects AS RESTRICTIVE TO %I USING(bucket_id=ANY(%L::text[])) WITH CHECK(bucket_id=ANY(%L::text[]))',mapping.role_name||'_object_fence',mapping.role_name,mapping.bucket_ids,mapping.bucket_ids);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
