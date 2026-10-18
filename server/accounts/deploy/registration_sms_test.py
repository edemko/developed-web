import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import registration_sms as monitor


def event(identifier, app='KešTrek'):
    return {'id': str(identifier), 'app': app, 'email': f'user{identifier}+signup@example.test',
            'created_at': '2026-10-17T10:30:00+02:00'}


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'state.sqlite'
        self.db = monitor.connect(self.path)
        self.sent = []

    def tearDown(self):
        self.db.close()
        self.directory.cleanup()

    def sender(self, config, text):
        self.sent.append(text)
        return {'status': 'accepted', 'message_id': str(len(self.sent))}

    def tick(self, events, now=100, checker=lambda *args: {'status': 'delivered', 'code': 'DELIVERED'}):
        return monitor.tick(self.db, events, {}, now, self.sender, checker)

    def test_baseline_excludes_history_and_restart_deduplicates(self):
        monitor.initialize(self.db, [event(1)], 1)
        self.tick([event(1), event(2)])
        self.assertEqual(len(self.sent), 1)
        self.assertIn('Aplikacia: KesTrek.', self.sent[0])
        self.db.close()
        self.db = monitor.connect(self.path)
        self.tick([event(1), event(2)])
        self.assertEqual(len(self.sent), 1)
        with self.assertRaises(ValueError):
            monitor.initialize(self.db, [], 101)

    def test_late_commit_with_lower_audit_id_is_not_missed(self):
        monitor.initialize(self.db, [event(5)], 1)
        self.tick([event(5), event(8)])
        self.tick([event(5), event(7), event(8)])
        self.assertEqual(len(self.sent), 2)
        self.assertIn('Email: user7+signup@example.test.', self.sent[1])
        self.assertNotIn('Ref:', self.sent[1])

    def test_missing_initialization_refuses_send(self):
        with self.assertRaises(ValueError): self.tick([event(1)])
        self.assertEqual(self.sent, [])

    def test_crash_reservation_is_not_retried(self):
        monitor.initialize(self.db, [], 1)
        def crash(config, text):
            raise RuntimeError('process stopped after provider submission')
        with self.assertRaises(RuntimeError):
            monitor.tick(self.db, [event(1)], {}, 100, crash)
        self.db.close()
        self.db = monitor.connect(self.path)
        result = self.tick([event(1)])
        self.assertEqual(self.sent, [])
        self.assertEqual(result['counts']['unknown'], 1)
        self.assertTrue(result['sms_problem'])

    def test_unknown_rejection_and_delivery_failure_are_visible_and_not_resent(self):
        for response in [{'status': 'unknown'}, {'status': 'rejected'}, {'status': 'accepted', 'message_id': '123'}]:
            with self.subTest(response=response):
                self.db.execute('delete from events')
                self.db.execute('delete from settings')
                self.db.commit()
                monitor.initialize(self.db, [], 1)
                result = monitor.tick(self.db, [event(1)], {}, 100, lambda *args: response,
                                      lambda *args: {'status': 'failed', 'code': 'EXPIRED'})
                self.assertTrue(result['sms_problem'])
                self.tick([event(1)])
                self.assertEqual(self.sent, [])

    def test_backlog_is_preserved_across_runs(self):
        monitor.initialize(self.db, [], 1)
        events = [event(i) for i in range(25)]
        result = self.tick(events)
        self.assertEqual(len(self.sent), 10)
        self.assertEqual(result['counts']['queued'], 15)
        self.tick(events)
        self.tick(events)
        self.assertEqual(len(self.sent), 25)

    def test_gateway_acceptance_is_not_delivery_and_pending_expires(self):
        monitor.initialize(self.db, [], 1)
        result = self.tick([event(1)], checker=lambda *args: {'status': 'pending', 'code': 'SENT'})
        self.assertEqual(result['counts']['pending'], 1)
        result = self.tick([event(1)], now=3700, checker=lambda *args: {'status': 'unknown'})
        self.assertEqual(result['counts']['unknown'], 1)
        self.assertTrue(result['sms_problem'])

    def test_message_names_portal_app_and_email_without_reference(self):
        for app in ['DevelopED', 'Otázkomat', 'Airsoft Marketplace', '<bad>\n' * 100, '']:
            text = monitor.message(event(12345678901234567890, app))
            self.assertLessEqual(len(text), 400)
            self.assertIn('Email: user12345678901234567890+signup@example.test.', text)
            self.assertNotIn('Ref:', text)
            self.assertRegex(text, r'^[\x20-\x7e]+$')
        self.assertIn('Aplikacia: Otazkomat.', monitor.message(event(1, 'Otázkomat')))

    def test_long_and_punctuated_emails_are_preserved(self):
        row = event(1)
        for email in ["a!#$%&'*+/=?^_`{|}~-@example.test",
                      'x' * 64 + '@' + 'a' * 63 + '.' + 'b' * 63 + '.' + 'c' * 56 + '.test']:
            self.assertLessEqual(len(email), 254)
            row['email'] = email
            self.assertIn('Email: ' + email + '.', monitor.message(row))
            self.assertLessEqual(len(monitor.message(row)), 400)
        row['email'] = 'bad\nextra@example.test'
        with self.assertRaises(ValueError): monitor.message(row)

    def test_queued_old_format_is_updated_without_resending_delivered_events(self):
        monitor.initialize(self.db, [], 1)
        with self.db:
            self.db.execute("insert into events(id,status,message) values('1','queued','Old Ref: 1.')")
            self.db.execute("insert into events(id,status,message) values('2','delivered','Old Ref: 2.')")
        self.tick([event(1), event(2)])
        self.assertEqual(len(self.sent), 1)
        self.assertIn('Email: user1+signup@example.test.', self.sent[0])
        self.assertNotIn('Ref:', self.sent[0])

    def test_database_credentials_stay_out_of_arguments_and_read_only_is_enforced(self):
        data = {'role': 'developed_accounts', 'session_role': 'developed_accounts', 'read_only': 'on', 'events': [event(1)]}
        with patch.object(monitor.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = json.dumps(data)
            url = 'postgresql://developed_accounts.oc-prod:fixture-secret@127.0.0.1:5432/postgres'
            self.assertEqual(monitor.registrations(url), [event(1)])
            args, kwargs = run.call_args
            self.assertNotIn('fixture-secret', str(args))
            self.assertIn('default_transaction_read_only=on', kwargs['env']['PGOPTIONS'])
            self.assertIn('begin read only;', kwargs['input'])
            self.assertIn("r.action='registration' and r.result='succeeded'", kwargs['input'])
            data['read_only'] = 'off'
            run.return_value.stdout = json.dumps(data)
            with self.assertRaises(ValueError): monitor.registrations(url)
            with self.assertRaises(ValueError): monitor.registrations(url.replace('127.0.0.1', 'example.test'))


if __name__ == '__main__': unittest.main()
