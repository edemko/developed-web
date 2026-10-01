#!/usr/bin/env python3
"""Create private synthetic learning data for the designated demo identity only.
Default: print a summary. --apply: one guarded transaction via local psql.
Never resets, deletes, updates, publishes, or grants school privileges.
"""
import argparse
import collections
import json
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

USER = '1c10d8f6-2689-4ac3-947c-3b10777844e8'
NAMESPACE = uuid.UUID('7ab8789f-b5b4-44cb-81a5-714d8fb34d28')
def ident(key): return str(uuid.uuid5(NAMESPACE, key))
def literal(value):
    if value is None: return 'NULL'
    if isinstance(value, bool): return 'true' if value else 'false'
    if isinstance(value, int): return str(value)
    return "'" + str(value).replace("'", "''") + "'"
def stamp(value): return value.isoformat()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
data = json.loads(Path(__file__).with_name('content.json').read_text())
now = datetime.now(timezone.utc).replace(hour=9, minute=0, second=0, microsecond=0)
rows = collections.defaultdict(list)
word_sets = []
for fi, folder in enumerate(data):
    folder_id = ident(f'folder:{fi}')
    rows['folders'].append(dict(id=folder_id, name=folder['name'], teacherId=USER,
        languageId=folder['languageId'], organisationId=None, isPublic=False,
        createdAt=stamp(now-timedelta(days=30-fi)), updatedAt=stamp(now-timedelta(days=1))))
    words = []
    for wi, (foreign, translation) in enumerate(folder['words']):
        word = dict(id=ident(f'word:{fi}:{wi}'), folderId=folder_id, foreignWord=foreign,
            translation=translation, createdAt=stamp(now-timedelta(days=30-fi)), updatedAt=stamp(now-timedelta(days=1)))
        words.append(word); rows['words'].append(word)
    word_sets.append(words)
    for si, (foreign, translation) in enumerate(folder['sentences']):
        rows['sentences'].append(dict(id=ident(f'sentence:{fi}:{si}'), folderId=folder_id,
            foreignSentence=foreign, translation=translation, createdAt=stamp(now-timedelta(days=25)), updatedAt=stamp(now-timedelta(days=1))))
    rows['tests'].append(dict(id=ident(f'test:{fi}'), name=folder['test'], studentId=USER, teacherId=None,
        languageId=folder['languageId'], organisationId=None, testType='TYPING', gradingMode='STANDARD',
        questionCount=10, passPercentage=70, isPublic=False, allowReview=True, immediateAnswerFeedback=True,
        createdAt=stamp(now-timedelta(days=24)), updatedAt=stamp(now-timedelta(days=1))))
    rows['test_folders'].append(dict(testId=ident(f'test:{fi}'), folderId=folder_id))

# Each test has an early and later attempt; answers, scores and mistake state agree.
history = collections.defaultdict(list)
for ai in range(12):
    fi = ai % 6
    correct = [6,7,7,8,8,7,9,9,10,9,10,9][ai]
    at = now-timedelta(days=23-ai*2)
    attempt_id = ident(f'attempt:{ai}')
    rows['test_attempts'].append(dict(id=attempt_id, testId=ident(f'test:{fi}'), studentId=USER,
        score=correct, totalWords=10, passed=correct>=7, startedAt=stamp(at), completedAt=stamp(at+timedelta(minutes=3)),
        clientToken=f'developed-demo-v1-{ai}'))
    for wi, word in enumerate(word_sets[fi][:10]):
        success = wi < correct
        answer = word['translation'] if success else word['translation'][:-1]+'?'
        rows['attempt_answers'].append(dict(id=ident(f'answer:{ai}:{wi}'), attemptId=attempt_id, wordId=word['id'],
            studentAnswer=answer, isCorrect=success, isAiGraded=False, aiGradingFailed=False, slotType='TYPING'))
        history[word['id']].append((success, at, data[fi]['languageId']))
for word_id, events in history.items():
    wrong = [event for event in events if not event[0]]
    if not wrong: continue
    fixed = events[-1][0]
    rows['student_mistakes'].append(dict(id=ident(f'mistake:{word_id}'), studentId=USER, wordId=word_id,
        languageId=events[-1][2], mistakeCount=len(wrong), isFixed=fixed,
        fixedAt=stamp(events[-1][1]+timedelta(minutes=3)) if fixed else None, lastMistakenAt=stamp(wrong[-1][1])))
summary = {table:len(values) for table, values in rows.items()}
summary['activeMistakes'] = sum(not row['isFixed'] for row in rows['student_mistakes'])
print(json.dumps({'mode':'apply' if args.apply else 'preview','synthetic':True,'counts':summary},ensure_ascii=False))
if not args.apply: raise SystemExit()

sql = ['BEGIN;', "SET LOCAL lock_timeout='2s';", "SET LOCAL statement_timeout='30s';",
       'SET LOCAL ROLE vocabulum_backend;',
       f"SELECT pg_advisory_xact_lock(hashtext('developed-vocabulum-demo-v1'));",
       f'''DO $guard$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM voc_builder.ecosystem_app_users WHERE id='{USER}' AND email='demo@developed.sk' AND role='STUDENT' AND "organisationId" IS NULL) THEN
           RAISE EXCEPTION 'Demo identity or membership mismatch'; END IF;
         IF EXISTS (SELECT 1 FROM voc_builder.folders WHERE "teacherId"='{USER}') OR
            EXISTS (SELECT 1 FROM voc_builder.tests WHERE "studentId"='{USER}') OR
            EXISTS (SELECT 1 FROM voc_builder.test_attempts WHERE "studentId"='{USER}') THEN
           RAISE EXCEPTION 'Demo already has content; refusing to overwrite or duplicate it'; END IF;
       END $guard$;''']
for table, values in rows.items():
    keys = list(values[0])
    columns = ','.join('"'+key+'"' for key in keys)
    payload = ',\n'.join('('+','.join(literal(row[key]) for key in keys)+')' for row in values)
    sql.append(f'INSERT INTO voc_builder.{table} ({columns}) VALUES {payload};')
sql += ['RESET ROLE;', 'SET LOCAL ROLE developed_accounts;',
        f'''INSERT INTO accounts.audit(target_id,action,result,context) VALUES ('{USER}','operator_demo_data_seed','succeeded',
        {literal(json.dumps({'app':'vocabulum','fixture':'developed-demo-v1','synthetic':True,'counts':summary}))}::jsonb);''', 'COMMIT;']
result = subprocess.run(['docker','exec','-i','supabase-db','psql','-U','supabase_admin','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1'],
    input='\n'.join(sql),text=True,capture_output=True)
if result.returncode:
    print('Transaction failed and rolled back. No data was removed. Inspect the preconditions before retrying.')
    # Server messages for this fixed synthetic-only transaction contain no credentials.
    print(result.stderr[-1800:])
    raise SystemExit(1)
print('Committed synthetic demo data. No existing account data modified.')
