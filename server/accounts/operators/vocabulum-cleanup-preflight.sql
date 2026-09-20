-- Read-only, fixed-target inventory for the owner's approved empty-account cleanup.
-- No personal content, credentials, identity metadata or token values are printed.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '500ms';
SET LOCAL search_path = pg_catalog;
DO $inventory$
DECLARE
  targets constant text[] := ARRAY['c3bf3064-8297-4bd5-8f92-54142598ffed','29cc2004-d4e7-427f-8070-eed2eb7df29a','668c5614-d834-424e-b962-0593d757c517'];
  owner_id constant uuid := '4c3e497a-511d-49dc-85fe-60f3cc37c3ae';
  r record; hits jsonb; scanned integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, a.attname
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
      AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND (a.atttypid='uuid'::regtype OR
        (a.atttypid IN ('text'::regtype,'varchar'::regtype) AND
          a.attname ~* '(id$|^owner$|^user$|^actor$|^subject$)'))
    ORDER BY n.nspname,c.relname,a.attname
  LOOP
    scanned := scanned+1;
    EXECUTE format('SELECT jsonb_object_agg(target, n) FROM (SELECT %1$I::text target,count(*) n FROM %2$I.%3$I WHERE %1$I::text = ANY($1) GROUP BY 1) q',r.attname,r.nspname,r.relname)
      INTO hits USING targets;
    IF hits IS NOT NULL THEN
      RAISE NOTICE '%', jsonb_build_object('table',r.nspname||'.'||r.relname,'column',r.attname,'counts',hits);
    END IF;
  END LOOP;
  RAISE NOTICE '%',jsonb_build_object('reference_columns_scanned',scanned,'snapshot',pg_current_snapshot()::text);
END $inventory$;
SELECT jsonb_build_object('target',p.id,'platform_role',p.role,'app_role',m.role,'app',a.schema_name)
FROM core.profiles p JOIN voc_builder.memberships m ON m.user_id=p.id
JOIN core.app_access aa ON aa.user_id=p.id JOIN core.apps a ON a.id=aa.app_id
WHERE p.id IN ('c3bf3064-8297-4bd5-8f92-54142598ffed','29cc2004-d4e7-427f-8070-eed2eb7df29a','668c5614-d834-424e-b962-0593d757c517') ORDER BY p.id;
SELECT jsonb_build_object('owner_folders',(SELECT count(*) FROM voc_builder.folders WHERE "teacherId"='4c3e497a-511d-49dc-85fe-60f3cc37c3ae'),
 'owner_words',(SELECT count(*) FROM voc_builder.words w JOIN voc_builder.folders f ON f.id=w."folderId" WHERE f."teacherId"='4c3e497a-511d-49dc-85fe-60f3cc37c3ae'),
 'owner_sentences',(SELECT count(*) FROM voc_builder.sentences s JOIN voc_builder.folders f ON f.id=s."folderId" WHERE f."teacherId"='4c3e497a-511d-49dc-85fe-60f3cc37c3ae'),
 'owner_tests',(SELECT count(*) FROM voc_builder.tests WHERE "teacherId"='4c3e497a-511d-49dc-85fe-60f3cc37c3ae'),
 'owner_classes',(SELECT count(*) FROM voc_builder.classes WHERE "createdById"='4c3e497a-511d-49dc-85fe-60f3cc37c3ae'));
WITH RECURSIVE refs AS (
 SELECT 'auth.users'::regclass::oid oid
 UNION SELECT c.conrelid FROM pg_constraint c JOIN refs r ON r.oid=c.confrelid WHERE c.contype='f'
)
SELECT jsonb_build_object('parent',pn.nspname||'.'||p.relname,'child',cn.nspname||'.'||ch.relname,'constraint',c.conname,'delete_action',c.confdeltype,'definition',pg_get_constraintdef(c.oid))
FROM pg_constraint c JOIN refs r ON r.oid=c.confrelid JOIN pg_class p ON p.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace JOIN pg_class ch ON ch.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=ch.relnamespace
WHERE c.contype='f' ORDER BY 1::text;
COMMIT;
