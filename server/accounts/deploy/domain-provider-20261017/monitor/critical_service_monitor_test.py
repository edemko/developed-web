import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import critical_service_monitor as monitor

EMPTY = {'version': 1, 'observations': {}, 'attempts': []}
MAIL = 'developed-accounts-mail-worker.service is failed'
CONFIG = {'token': 'fixture-token', 'recipient': '+421900000000', 'from': 'DevelopED'}


class MonitorTests(unittest.TestCase):
    def test_jasom_both_slots_share_incident_and_maintenance_scope(self):
        failures = [f'jasom-web-isolated@{slot}.service is inactive' for slot in ['blue', 'green']]
        self.assertEqual(monitor.failure_identity(failures[0]), monitor.failure_identity(failures[1]))
        for failure in failures + ['jasom routing: cannot determine active web slot',
                                  'jasom web: http://127.0.0.1/health -> 502 (want 200)',
                                  'jasom-submissions-isolated.service is inactive']:
            self.assertEqual(monitor.scope_for(failure), 'jasom')
            remaining, muted = monitor.suppress([failure, MAIL], {'jasom': {'until': 2000}}, 1000)
            self.assertEqual(remaining, [MAIL])
            self.assertEqual(len(muted), 1)
            self.assertTrue(monitor.candidates(self.observed([failure]), 1060))
        state = self.observed([failures[0]])
        monitor.reserve(state, monitor.candidates(state, 1060), 1060)
        state = monitor.observe(state, [failures[1]], 1120, 'boot-a')
        self.assertFalse(monitor.candidates(state, 2000))

    def observed(self, failures=(MAIL,)):
        state = monitor.observe(EMPTY, failures, 1000, 'boot-a')
        return monitor.observe(state, failures, 1060, 'boot-a')

    def test_two_failed_checks_required_and_transient_failure_does_not_alert(self):
        state = monitor.observe(EMPTY, [MAIL], 1000, 'boot-a')
        self.assertFalse(monitor.candidates(state, 1000))
        quick = monitor.observe(state, [MAIL], 1001, 'boot-a')
        self.assertFalse(monitor.candidates(quick, 1001))
        state = monitor.observe(state, [], 1060, 'boot-a')
        self.assertFalse(monitor.candidates(state, 1060))
        self.assertTrue(monitor.candidates(self.observed(), 1060))

    def test_http_status_changes_and_release_ids_do_not_create_new_outages(self):
        a = monitor.failure_identity('kestrek api: https://kestrek.sk/api -> 503 (want 200)')
        b = monitor.failure_identity('kestrek api: https://kestrek.sk/api -> 502 (want 200)')
        self.assertEqual(a, b)
        self.assertEqual(monitor.failure_identity('developed-kestrek@abcdef123456.service is failed'),
                         monitor.failure_identity('developed-kestrek@123456abcdef.service is failed'))

    def test_reserved_send_survives_restarts_and_reboot_without_duplicates(self):
        state = self.observed()
        keys = monitor.candidates(state, 1060)
        monitor.reserve(state, keys, 1060)
        self.assertFalse(monitor.candidates(state, 9000))
        state = monitor.observe(state, [MAIL], 9000, 'boot-b')
        state = monitor.observe(state, [MAIL], 9060, 'boot-b')
        self.assertFalse(monitor.candidates(state, 9060))

    def test_recovery_requires_two_checks_and_flapping_respects_cooldown(self):
        state = self.observed()
        monitor.reserve(state, monitor.candidates(state, 1060), 1060)
        state = monitor.observe(state, [], 1120, 'boot-a')
        self.assertTrue(state['observations'])
        state = monitor.observe(state, [], 1180, 'boot-a')
        self.assertFalse(state['observations'])
        state = monitor.observe(state, [MAIL], 1240, 'boot-a')
        state = monitor.observe(state, [MAIL], 1300, 'boot-a')
        self.assertFalse(monitor.candidates(state, 1300))
        self.assertTrue(monitor.candidates(state, 1661))

    def test_daily_cap_and_backward_clock(self):
        state = self.observed()
        state['attempts'] = [{'at': 1000-i*1000, 'status': 'rejected', 'keys': []} for i in range(10)]
        self.assertFalse(monitor.candidates(state, 2000))
        self.assertFalse(monitor.candidates(state, 900))
        self.assertTrue(monitor.candidates(state, 90000))

    def test_boot_gap_requires_fresh_confirmation(self):
        state = monitor.observe(EMPTY, [MAIL], 1000, 'boot-a')
        state = monitor.observe(state, [MAIL], 2000, 'boot-a')
        self.assertFalse(monitor.candidates(state, 2000))
        self.assertTrue(monitor.candidates(monitor.observe(state, [MAIL], 2060, 'boot-a'), 2060))

    def test_scope_exclusions_and_single_segment(self):
        for failure in ['failed unit phonetech.service', 'failed user unit developed-release-poll.service',
                        'off-site backup success is older than 30 hours', 'failed unit frontend-build.service',
                        'development-preview.service is failed', 'container fixture-db unhealthy',
                        'developed-kestrek@dev.service is failed', 'mega-youtube-build.service is failed']:
            self.assertIsNone(monitor.failure_identity(failure))
        failures = [f'kestrek endpoint-{i}: https://example.invalid -> 503 (want 200)' for i in range(30)]
        state = self.observed(failures)
        text = monitor.message(state, monitor.candidates(state, 1060))
        self.assertLessEqual(len(text), 160)
        self.assertTrue(text.isascii())

    def test_corrupt_state_is_not_silently_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'state.json'
            path.write_text('{broken')
            with self.assertRaises(ValueError): monitor.read_state(path)

    def test_real_cycle_reserves_before_send_and_polls_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); state_path = root/'state.json'
            def state_reader():
                if not state_path.exists(): return json.loads(json.dumps(EMPTY))
                return json.loads(state_path.read_text())
            def submit(config, text):
                reserved = json.loads(state_path.read_text())
                self.assertEqual(reserved['attempts'][-1]['code'], 'RESERVED_BEFORE_SEND')
                self.assertEqual(os.stat(state_path).st_mode & 0o777, 0o600)
                return {'status': 'accepted', 'message_id': '123'}
            with patch.multiple(monitor, STATE_DIR=root, STATE=state_path, STATUS=root/'status.json'), \
                 patch.object(monitor, 'maintenance_windows', return_value={}), \
                 patch.object(monitor, 'read_state', side_effect=state_reader), \
                 patch.object(monitor, 'load_config', return_value=CONFIG), \
                 patch.object(monitor, 'bounded_collect', return_value={'failures': [MAIL], 'info': []}), \
                 patch.object(monitor, 'send', side_effect=submit) as sender, \
                 patch.object(monitor, 'delivery', return_value={'status': 'delivered', 'code': 'DELIVERED'}), \
                 patch.object(monitor.time, 'time', side_effect=[1000, 1060, 1120]), \
                 patch('builtins.print'):
                self.assertEqual(monitor.main([]), 0)
                self.assertEqual(monitor.main([]), 0)
                self.assertEqual(monitor.main([]), 0)
                self.assertEqual(sender.call_count, 1)
            self.assertEqual(state_reader()['attempts'][-1]['status'], 'delivered')

    def test_crash_after_submission_does_not_trigger_another_send(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); path = root/'state.json'
            initial = self.observed()
            initial['boot_id'] = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
            monitor.atomic_json(path, initial)
            def read(): return json.loads(path.read_text())
            with patch.multiple(monitor, STATE_DIR=root, STATE=path, STATUS=root/'status.json'), \
                 patch.object(monitor, 'maintenance_windows', return_value={}), \
                 patch.object(monitor, 'read_state', side_effect=read), \
                 patch.object(monitor, 'load_config', return_value=CONFIG), \
                 patch.object(monitor, 'bounded_collect', return_value={'failures': [MAIL], 'info': []}), \
                 patch.object(monitor.time, 'time', return_value=1120), \
                 patch.object(monitor, 'send', side_effect=RuntimeError('simulated crash')) as sender:
                with self.assertRaises(RuntimeError): monitor.main([])
                self.assertEqual(sender.call_count, 1)
            self.assertFalse(monitor.candidates(read(), 10000))

    def test_maintenance_mutes_only_affected_production_app_and_expires(self):
        windows = {'kestrek': {'until': 2000, 'source': 'manual maintenance'}}
        failures = ['kestrek api: http://127.0.0.1:3164/api -> 503 (want 200)',
                    'developed-kestrek@abcdef123456.service is failed',
                    'caddy.service is inactive', MAIL]
        remaining, muted = monitor.suppress(failures, windows, 1000)
        self.assertEqual(remaining, failures[2:])
        self.assertEqual(len(muted), 2)
        self.assertEqual(monitor.suppress(failures, windows, 2001), (failures, []))
        # Expiry starts a fresh confirmation, instead of releasing a burst.
        state = monitor.observe(EMPTY, [], 1900, 'boot-a')
        state = monitor.observe(state, failures[:2], 2001, 'boot-a')
        self.assertFalse(monitor.candidates(state, 2001))
        self.assertTrue(monitor.candidates(monitor.observe(state, failures[:2], 2061, 'boot-a'), 2061))

    def test_active_deploy_lock_is_scoped_and_stale_or_unrelated_pid_is_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); lock = root/'kestrek.deploy.lock'; lock.mkdir()
            (lock/'pid').write_text(str(os.getpid())); os.utime(lock, (1000, 1000))
            # This Python test process is not a deployment, despite a live PID.
            self.assertEqual(monitor.deployment_windows(1001, root), {})
            with patch.object(Path, 'read_bytes', return_value=b'node\0/opt/developed-control/developed-release-abc1234/developed-release.mjs\0poll\0'):
                self.assertEqual(set(monitor.deployment_windows(1001, root)), {'kestrek'})
                self.assertEqual(monitor.deployment_windows(1901, root), {})
                (lock/'pid').write_text('999999999')
                self.assertEqual(monitor.deployment_windows(1001, root), {})

    def test_manual_window_duration_is_bounded_and_resume_removes_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.multiple(monitor, STATE_DIR=root, MAINTENANCE=root/'maintenance.json'), \
                 patch.object(monitor.time, 'time', return_value=1000), patch('builtins.print'):
                self.assertEqual(monitor.main(['--maintenance', 'kestrek', '--minutes', '30']), 0)
                self.assertEqual(monitor.maintenance_windows(1001)['kestrek']['until'], 2800)
                self.assertEqual(monitor.maintenance_windows(2801), {})
                with self.assertRaises(ValueError): monitor.main(['--maintenance', 'all', '--minutes', '241'])
                self.assertEqual(monitor.main(['--resume', 'kestrek']), 0)
                self.assertEqual(monitor.maintenance_windows(1001), {})


if __name__ == '__main__': unittest.main()
