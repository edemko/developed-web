// Only an existing labeled disposable protocol fixture. Never accepts a URL,
// live container, production credentials or publication flag.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const database = process.env.ACCOUNTS_TEST_CONTAINER;
if (!/^developed-identity-test-\d+-db$/.test(database || '')) throw new Error('Explicit disposable fixture required');
const prefix = database.replace(/-db$/,''), network = `${prefix}-network`;
const docker = (args, input, env) => execFileSync('docker',args,{encoding:'utf8',input,env:env?{...process.env,...env}:process.env,stdio:['pipe','pipe','pipe']}).trim();
const inspect = name => JSON.parse(docker(['inspect',name]))[0];
const db = inspect(database);
assert.equal(db.Config.Labels['developed.identity.qualification'],'true');
const environment = value => Object.fromEntries(value.Config.Env.map(item=>[item.slice(0,item.indexOf('=')),item.slice(item.indexOf('=')+1)]));
const dbEnv = environment(db), storage = `${prefix}-storage`, rest = `${prefix}-rest`;
const sql = value => docker(['exec','-i',database,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],value);
const signJwt = (role, secret) => {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const value = `${b64({alg:'HS256',typ:'JWT'})}.${b64({role,iss:'isolated-qualification',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}`;
  return `${value}.${createHmac('sha256',secret).update(value).digest('base64url')}`;
};
const url = (name, port) => `http://127.0.0.1:${inspect(name).NetworkSettings.Ports[`${port}/tcp`][0].HostPort}`;
async function ready(name, port, path) {
  const origin = url(name,port);
  for(let i=0;i<100;i++) {
    try { if((await fetch(origin+path,{signal:AbortSignal.timeout(1000)})).ok) return origin; } catch {}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  // Fixture logs only, redacted before any output.
  let logs = docker(['logs','--tail','12',name]);
  for(const secret of Object.values(environment(inspect(name))).filter(v=>v.length>12)) logs=logs.replaceAll(secret,'[fixture-redacted]');
  throw new Error(`Fixture ${name} failed startup: ${logs}`);
}
if(process.argv.includes('--prepare')) {
  const secret=randomBytes(32).toString('hex'), password=randomBytes(32).toString('hex');
  sql(`alter role authenticator login password '${password}'; grant anon,authenticated,service_role to authenticator;`);
  const common=['--pull=never','-d','--network',network,'--cpus','0.5','--pids-limit','100','--label','developed.identity.qualification=true'];
  const storageEnv={DATABASE_URL:`postgres://postgres:${dbEnv.POSTGRES_PASSWORD}@${database}:5432/postgres`,
    PGRST_JWT_SECRET:secret,ANON_KEY:signJwt('anon',secret),SERVICE_KEY:signJwt('service_role',secret),
    STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/tmp/qualification-storage',FILE_SIZE_LIMIT:'1048576',
    DATABASE_MAX_CONNECTIONS:'3',REGION:'local',GLOBAL_S3_BUCKET:'qualification',TENANT_ID:'qualification',
    ENABLE_IMAGE_TRANSFORMATION:'false',LOG_LEVEL:'error',DB_INSTALL_ROLES:'false'};
  docker(['run',...common,'--name',storage,'--memory','192m','-p','127.0.0.1::5000',...Object.keys(storageEnv).flatMap(key=>['-e',key]),'supabase/storage-api:v1.60.4'],undefined,storageEnv);
  await ready(storage,5000,'/status');
  // Production bootstraps this outside Storage migrations; the minimal fixture
  // deliberately does not install broad managed-platform defaults.
  sql('GRANT USAGE ON SCHEMA storage TO service_role,anon,authenticated;');
  const restEnv={PGRST_DB_URI:`postgres://authenticator:${password}@${database}:5432/postgres`,
    PGRST_DB_SCHEMAS:'kestrek,screentime,voc_builder,odonto,otazkomat',PGRST_DB_ANON_ROLE:'anon',
    PGRST_JWT_SECRET:secret,PGRST_DB_POOL:'3',PGRST_SERVER_PORT:'3000',PGRST_LOG_LEVEL:'error'};
  docker(['run',...common,'--name',rest,'--memory','96m','-p','127.0.0.1::3000',...Object.keys(restEnv).flatMap(key=>['-e',key]),'postgrest/postgrest:v14.12'],undefined,restEnv);
  // OpenAPI may return 401 until the selected role has schema usage; readiness
  // is established by the listener, then by real role requests after migration.
  process.stdout.write(`Prepared ${storage} and ${rest}; role migration not applied.\n`);
} else {
  assert(process.argv.includes('--test'),'Use --prepare or --test');
  for (const name of [storage,rest]) assert.equal(inspect(name).Config.Labels['developed.identity.qualification'],'true');
  const roles=['kestrek_backend','screentime_backend','vocabulum_backend','odonto_backend','otazkomat_backend'];
  const schemas=['kestrek','screentime','voc_builder','odonto','otazkomat'];
  const apps=['app_kestrek','app_screentime','app_voc_builder','app_odonto','app_otazkomat'];
  const own=randomUUID(),other=randomUUID(),organization=randomUUID(),row=randomUUID();
  const migration=readFileSync(new URL('../../../supabase/migrations/20260920124145_ecosystem_scoped_data_roles.sql',import.meta.url),'utf8');
  const roleBlock=migration.slice(migration.indexOf('DO $$'),migration.indexOf('END $$;')+7);
  assert(roleBlock.includes('Unexpected role membership for'));
  // Replay the current source's role block inside a rollback-only transaction,
  // starting with Vocabulum's deliberate no-RLS business-table architecture.
  // Other qualification consumers retain their original fixture state afterward.
  sql(`BEGIN;
    DO $reset$ DECLARE r record; BEGIN
      FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=ANY(ARRAY['kestrek','screentime','voc_builder','odonto','otazkomat']) AND c.relkind IN ('r','p') LOOP
        EXECUTE format('DROP POLICY IF EXISTS ecosystem_backend ON %I.%I',r.nspname,r.relname);
        IF r.nspname='voc_builder' AND r.relname<>'oidc_sessions' THEN
          EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY',r.nspname,r.relname);
        END IF;
      END LOOP;
      FOR r IN SELECT unnest(ARRAY['kestrek','screentime','voc_builder','odonto','otazkomat']) AS nspname LOOP
        EXECUTE format('DROP VIEW %I.identity_directory',r.nspname);
      END LOOP;
    END $reset$;
    ${roleBlock}
    DO $check$ BEGIN
      IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='voc_builder' AND c.relkind IN ('r','p') AND c.relname<>'oidc_sessions' AND c.relrowsecurity) THEN
        RAISE EXCEPTION 'Vocabulum business authorization architecture changed';
      END IF;
      SET LOCAL ROLE vocabulum_backend;
      PERFORM 1 FROM voc_builder.memberships LIMIT 1;
      RESET ROLE;
    END $check$;
    ROLLBACK;`);
  sql(`BEGIN; GRANT service_role TO kestrek_backend;
    DO $test$ BEGIN BEGIN EXECUTE $migration$${roleBlock}$migration$;
      RAISE EXCEPTION 'dangerous membership accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM<>'Unexpected role membership for kestrek_backend' THEN RAISE; END IF;
    END; END $test$; ROLLBACK;`);
  // SQL proof rolls back every fixture row. HTTP proof below uses separately
  // identifiable rows and deletes only those exact rows in finally.
  sql(`BEGIN;
    INSERT INTO auth.users(id,email) VALUES('${own}','${own}@example.invalid'),('${other}','${other}@example.invalid');
    INSERT INTO core.profiles(id) VALUES('${own}'),('${other}') ON CONFLICT DO NOTHING;
    ${apps.map(app=>`INSERT INTO core.apps(id,name,base_path) VALUES('${app}','Role fixture ${app}','/fixture-${app}') ON CONFLICT DO NOTHING;
      INSERT INTO core.app_access(id,user_id,app_id) VALUES('role-${app}-${own}','${own}','${app}');`).join('\n')}
    INSERT INTO otazkomat.organizations(id,name,organization_kind,system_key,is_system,status)
      VALUES('${organization}','Fixture platform','platform','platform_default',true,'active') ON CONFLICT DO NOTHING;
    DO $$ DECLARE r record; t record; BEGIN
      FOR r IN SELECT * FROM (VALUES ${roles.map((role,i)=>`('${role}','${schemas[i]}')`).join(',')}) AS x(role_name,schema_name) LOOP
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r.role_name AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN RAISE EXCEPTION 'unsafe role'; END IF;
        IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.member WHERE p.rolname=r.role_name) THEN RAISE EXCEPTION 'role membership escape'; END IF;
        IF has_table_privilege(r.role_name,'auth.users','SELECT,UPDATE') OR has_table_privilege(r.role_name,'core.app_access','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege(r.role_name,'core.profiles','SELECT,UPDATE') THEN RAISE EXCEPTION 'global identity privilege'; END IF;
        IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='otazkomat' AND p.proname='delete_organization_permanently' AND has_function_privilege(r.role_name,p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'global deletion RPC exposed'; END IF;
        FOR t IN SELECT n.nspname,c.relname,c.relrowsecurity,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=ANY(ARRAY['kestrek','screentime','voc_builder','odonto','otazkomat']) AND c.relkind IN ('r','p','v','m') AND c.relname<>'schema_migrations' LOOP
          IF t.nspname<>r.schema_name AND has_table_privilege(r.role_name,format('%I.%I',t.nspname,t.relname),'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'cross-app privilege'; END IF;
          IF t.nspname=r.schema_name AND t.relname<>'app_users' THEN
            IF t.relkind IN ('r','p') AND (t.nspname<>'voc_builder' OR t.relname='oidc_sessions') AND NOT t.relrowsecurity THEN RAISE EXCEPTION 'missing RLS'; END IF;
            EXECUTE format('SET LOCAL ROLE %I',r.role_name);
            EXECUTE format('SELECT * FROM %I.%I LIMIT 1',t.nspname,t.relname);
            RESET ROLE;
          END IF;
        END LOOP;
        EXECUTE format('SET LOCAL ROLE %I',r.role_name);
        EXECUTE format('SELECT count(*)=1 FROM %I.identity_directory WHERE id=ANY(ARRAY[%L,%L]::uuid[])',r.schema_name,'${own}','${other}') INTO STRICT t;
        IF NOT t."?column?" THEN RAISE EXCEPTION 'identity filter failed'; END IF;
        RESET ROLE;
      END LOOP;
    END $$;
    SET LOCAL ROLE vocabulum_backend;
    INSERT INTO voc_builder.memberships(user_id,role,must_change_password) VALUES('${other}','STUDENT',false);
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM voc_builder.ecosystem_app_users WHERE id='${other}') THEN RAISE EXCEPTION 'guessed membership exposed global identity'; END IF;
      BEGIN PERFORM * FROM voc_builder.app_users; RAISE EXCEPTION 'baseline view readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      PERFORM voc_builder.ensure_oidc_membership('${own}');
    END $$;
    RESET ROLE;
    SET LOCAL ROLE odonto_backend;
    DO $$ BEGIN IF odonto.unaccent_immutable('Žltý')<>'Zlty' THEN RAISE EXCEPTION 'unaccent failed'; END IF; END $$;
    RESET ROLE;
    SET LOCAL ROLE otazkomat_backend;
    SELECT otazkomat.provision_ecosystem_profile('${own}','${own}@example.invalid','Fixture');
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM otazkomat.users WHERE id='${own}' AND role='member' AND status='active' AND NOT is_premium) THEN RAISE EXCEPTION 'unsafe default profile'; END IF;
      IF NOT EXISTS(SELECT 1 FROM otazkomat.user_organization_memberships WHERE user_id='${own}' AND organization_id='${organization}' AND role='member' AND is_active) THEN RAISE EXCEPTION 'missing default membership'; END IF;
      BEGIN PERFORM otazkomat.provision_ecosystem_profile('${other}','${other}@example.invalid','Bad'); RAISE EXCEPTION 'unrelated profile accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Central app membership required' THEN RAISE; END IF; END;
      BEGIN PERFORM otazkomat.provision_ecosystem_profile('${own}','wrong@example.invalid','Bad'); RAISE EXCEPTION 'wrong email accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Central app membership required' THEN RAISE; END IF; END;
    END $$;
    UPDATE otazkomat.users SET role='admin',status='suspended',is_premium=true WHERE id='${own}';
    SELECT otazkomat.provision_ecosystem_profile('${own}','${own}@example.invalid','Changed');
    DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM otazkomat.users WHERE id='${own}' AND role='admin' AND status='suspended' AND is_premium) THEN RAISE EXCEPTION 'existing profile overwritten'; END IF; END $$;
    RESET ROLE;
    ROLLBACK;`);
  process.stdout.write('SQL: all own relations readable, five roles isolated, filtered identity/guessed membership and Ota provisioning checks passed.\n');
  const secret=environment(inspect(rest)).PGRST_JWT_SECRET, restUrl=url(rest,3000), storageUrl=url(storage,5000);
  const request=async (origin,role,path,options={})=>fetch(origin+path,{...options,headers:{Authorization:`Bearer ${signJwt(role,secret)}`,...options.headers},signal:AbortSignal.timeout(5000)});
  async function restCall(role,schema,path,method='GET',body) {
    return request(restUrl,role,path,{method,headers:{'Accept-Profile':schema,'Content-Profile':schema,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  const expectOk=async(response,label)=>{const body=await response.json();assert(response.ok,`${label}: HTTP ${response.status}, ${body.code||body.error||'failure'}`);return body;};
  sql(`INSERT INTO auth.users(id,email) VALUES('${own}','${own}@example.invalid'); INSERT INTO core.profiles(id) VALUES('${own}') ON CONFLICT DO NOTHING;`);
  const buckets=['avatars','tts-audio','study-materials','question-images','content-icons','report-images'];
  const objectName=`qualification-${row}.txt`, createdBuckets=[];
  const policyName=`fixture_${row.replaceAll('-','')}`;
  try {
    const cases=[['kestrek_backend','kestrek','currencies',{id:row,name:'Fixture',code:'FIX',symbol:'F'},'name'],
      ['screentime_backend','screentime','children',{id:row,owner_id:own,display_name:'Fixture'},'display_name'],
      ['vocabulum_backend','voc_builder','languages',{name:'Fixture',code:`q-${row}`},'name'],
      ['odonto_backend','odonto','topics',{id:row,name:'Fixture'},'name'],
      ['otazkomat_backend','otazkomat','users',{id:own,email:`${own}@example.invalid`,first_name:'Fixture',last_name:''},'first_name']];
    for (const [role,schema,table,data,field] of cases) {
      const inserted=await expectOk(await restCall(role,schema,`/${table}`,'POST',data),`${schema} insert`);
      const id=inserted[0].id;
      const changed=await expectOk(await restCall(role,schema,`/${table}?id=eq.${id}`,'PATCH',{[field]:'Updated'}),`${schema} update`);
      assert.equal(changed[0][field],'Updated');
      const cross=await restCall(role,schema==='odonto'?'kestrek':'odonto',schema==='odonto'?'/currencies':'/topics');
      assert.equal(cross.status,403,`${schema} cross-schema read`);
      const rpc=await restCall(role,'otazkomat','/rpc/delete_organization_permanently','POST',{p_organization_id:organization,p_requested_by:own});
      assert([401,403,404].includes(rpc.status),`${schema} deletion RPC denied`);
      await expectOk(await restCall(role,schema,`/${table}?id=eq.${id}`,'DELETE'),`${schema} delete`);
    }
    process.stdout.write('PostgREST: actual signed scoped JWT own CRUD passed for all five roles; cross-app access and global-delete RPC denied.\n');
    for (const bucket of buckets) {
      assert.equal(sql(`SELECT count(*) FROM storage.buckets WHERE id='${bucket}'`),'0','Fixture bucket already exists; refuse to claim it');
      await expectOk(await request(storageUrl,'service_role','/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:false})}),`create fixture ${bucket}`);
      createdBuckets.push(bucket);
      await expectOk(await request(storageUrl,'service_role',`/object/${bucket}/${objectName}`,{method:'POST',headers:{'Content-Type':'text/plain'},body:'private fixture'}),`create fixture object ${bucket}`);
    }
    // Prove restrictions survive an existing permissive PUBLIC storage policy.
    sql(`CREATE POLICY ${policyName} ON storage.buckets TO PUBLIC USING(true) WITH CHECK(true); CREATE POLICY ${policyName} ON storage.objects TO PUBLIC USING(true) WITH CHECK(true);`);
    const mappings=[['kestrek_backend','avatars'],['vocabulum_backend','tts-audio'],['odonto_backend','study-materials'],...['question-images','content-icons','report-images'].map(bucket=>['otazkomat_backend',bucket])];
    for (const [role,bucket] of mappings) {
      const otherBucket=bucket==='avatars'?'tts-audio':'avatars';
      await expectOk(await request(storageUrl,role,`/object/${bucket}/${objectName}`,{method:'POST',headers:{'Content-Type':'text/plain','x-upsert':'true'},body:'fixture'}),`${role} upload`);
      await expectOk(await request(storageUrl,role,`/object/${bucket}/${objectName}`,{method:'POST',headers:{'Content-Type':'text/plain','x-upsert':'true'},body:'updated'}),`${role} upsert`);
      const read=await request(storageUrl,role,`/object/authenticated/${bucket}/${objectName}`);
      assert.equal(read.status,200,`${role} read`);assert.equal(await read.text(),'updated');
      const denied=await request(storageUrl,role,`/object/${otherBucket}/${objectName}`,{method:'POST',headers:{'Content-Type':'text/plain'},body:'denied'});
      assert(!denied.ok,`${role} cross-bucket write accepted`);
      const deniedRead=await request(storageUrl,role,`/object/authenticated/${otherBucket}/${objectName}`);
      assert(!deniedRead.ok,`${role} cross-bucket read accepted`);
      const listed=await expectOk(await request(storageUrl,role,'/bucket'),`${role} bucket listing`);
      assert(listed.every(item=>(role==='otazkomat_backend'?['question-images','content-icons','report-images']:[bucket]).includes(item.id)),`${role} foreign bucket visible`);
      sql(`BEGIN; SET LOCAL ROLE ${role}; DO $$ BEGIN
        BEGIN UPDATE storage.objects SET bucket_id='${otherBucket}' WHERE bucket_id='${bucket}' AND name='${objectName}'; RAISE EXCEPTION 'cross-bucket reassignment accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      END $$; ROLLBACK;`);
      const create=await request(storageUrl,role,'/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:`forbidden-${row}`,name:'forbidden'})});
      assert(!create.ok,`${role} bucket creation accepted`);
      await expectOk(await request(storageUrl,role,`/object/${bucket}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[objectName]})}),`${role} delete object`);
      const deleteBucket=await request(storageUrl,role,`/bucket/${bucket}`,{method:'DELETE'});
      assert(!deleteBucket.ok,`${role} bucket deletion accepted`);
    }
    process.stdout.write('Storage: real scoped JWT upload/upsert/read/delete passed; cross-bucket writes and bucket administration denied.\n');
  } finally {
    // Only exact rows this invocation created. No schema resets or other users.
    sql(`DELETE FROM kestrek.currencies WHERE id='${row}'; DELETE FROM screentime.children WHERE id='${row}'; DELETE FROM voc_builder.languages WHERE code='q-${row}'; DELETE FROM odonto.topics WHERE id='${row}'; DELETE FROM auth.users WHERE id='${own}';`);
    sql(`DROP POLICY IF EXISTS ${policyName} ON storage.buckets; DROP POLICY IF EXISTS ${policyName} ON storage.objects;`);
    for (const bucket of createdBuckets) {
      await request(storageUrl,'service_role',`/object/${bucket}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[objectName]})});
      await request(storageUrl,'service_role',`/bucket/${bucket}`,{method:'DELETE'});
    }
  }
}
