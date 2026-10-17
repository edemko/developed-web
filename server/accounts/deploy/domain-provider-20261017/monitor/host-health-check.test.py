import importlib.util
import pathlib
import unittest
from unittest.mock import mock_open, patch

spec = importlib.util.spec_from_file_location('health', pathlib.Path(__file__).with_name('host-health-check.py'))
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)
# Existing JASOM fixture stays offline; domain probes have their own mocked tests.
health.ISSUER_PROBES = []


class HealthTests(unittest.TestCase):
    def test_jasom_follows_selected_slot_and_ignores_stopped_standby(self):
        for slot, port in [('blue', 18090), ('green', 18091)]:
            with self.subTest(slot=slot):
                config = f'# BEGIN jasom\n reverse_proxy 127.0.0.1:{port} {{\n }}\n# END jasom\n'
                unit = f'jasom-web-isolated@{slot}.service'
                with patch('builtins.open', mock_open(read_data=config)), \
                     patch.object(health, 'systemctl', side_effect=lambda *args: 'active' if args[-1] == unit else 'inactive') as ctl:
                    failures = []
                    health.jasom_runtime(failures)
                    self.assertEqual(failures, [])
                    ctl.assert_called_once_with('is-active', unit)

    def test_jasom_selected_slot_down_is_reported_even_with_healthy_standby(self):
        for slot in ['blue', 'green']:
            unit = f'jasom-web-isolated@{slot}.service'
            with patch.object(health, 'jasom_active_unit', return_value=unit), \
                 patch.object(health, 'systemctl', side_effect=lambda *args: 'inactive' if args[-1] == unit else 'active'):
                failures = []
                health.jasom_runtime(failures)
                self.assertEqual(failures, [unit + ' is inactive'])

    def test_jasom_switch_during_check_rechecks_new_slot(self):
        blue, green = [f'jasom-web-isolated@{slot}.service' for slot in ['blue', 'green']]
        for old, new in [(blue, green), (green, blue)]:
            with patch.object(health, 'jasom_active_unit', side_effect=[old, new, new, new]), \
                 patch.object(health, 'systemctl', side_effect=['inactive', 'active']):
                failures = []
                health.jasom_runtime(failures)
                self.assertEqual(failures, [])

    def test_jasom_missing_or_ambiguous_route_fails_closed(self):
        block = '# BEGIN jasom\n reverse_proxy 127.0.0.1:18090 {\n }\n# END jasom\n'
        for config in ['', block + block, block.replace('18090', '8091'),
                       block.replace(' }', ' reverse_proxy 127.0.0.1:18091 {\n }')]:
            with patch('builtins.open', mock_open(read_data=config)):
                failures = []
                health.jasom_runtime(failures)
                self.assertEqual(failures, ['jasom routing: cannot determine active web slot'])
        with patch('builtins.open', side_effect=PermissionError):
            failures = []
            health.jasom_runtime(failures)
            self.assertEqual(failures, ['jasom routing: cannot determine active web slot'])

    def test_jasom_routed_http_failure_is_not_hidden_by_active_unit(self):
        checks = [probe for probe in health.EXTRA_PROBES if probe[0].startswith('jasom ')]
        self.assertEqual(len(checks), 2)
        self.assertNotIn('jasom-web-isolated@green.service', health.REQUIRED)
        self.assertIn('jasom-submissions-isolated.service', health.REQUIRED)
        with patch.object(health, 'probes', return_value=checks), \
             patch.object(health, 'sh', return_value='502'), patch.object(health, 'TCP_PROBES', []):
            failures = []
            health.health(failures, [])
            self.assertEqual(len(failures), 2)
            self.assertTrue(all('502 (want 200)' in failure for failure in failures))

    def test_registration_monitor_stopped_stale_or_failed_delivery(self):
        from unittest.mock import mock_open
        with patch.object(health.os.path, 'exists', return_value=True), \
             patch.object(health, 'systemctl', return_value='inactive\n'), \
             patch('builtins.open', mock_open(read_data='{"checked_at":100,"sms_problem":true}')), \
             patch.object(health.time, 'time', return_value=500):
            failures = []
            health.registration_monitor_health(failures, [])
            self.assertEqual(failures, ['registration SMS monitor timer is inactive',
                'registration SMS monitor results are stale',
                'registration SMS monitor has an unconfirmed notification'])

    def test_previous_checker_failure_does_not_prevent_recovery(self):
        with patch.object(health, 'systemctl', return_value='developed-boot-check.service loaded failed\nexample.service loaded failed\n'):
            failures = []
            health.failed_units(failures)
        self.assertEqual(failures, ['failed unit example.service', 'failed user unit example.service'])

    def test_notification_change_recovery_and_reminder(self):
        old = {'failures': ['database down'], 'sent_at': 100}
        self.assertFalse(health.notification_due(['database down'], old, 101))
        self.assertTrue(health.notification_due([], old, 101))
        self.assertTrue(health.notification_due(['another problem'], old, 101))
        self.assertTrue(health.notification_due(['database down'], old, 21700))
        self.assertFalse(health.notification_due([], {'failures': [], 'sent_at': 100}, 100000))

    def test_missing_backup_receipt_is_a_failure(self):
        with patch.object(health.os, 'stat', side_effect=FileNotFoundError), patch.object(health.shutil, 'disk_usage') as disk:
            disk.return_value = type('Disk', (), {'free': 20 * 1024**3, 'total': 100 * 1024**3})()
            failures = []
            health.disk_and_backup(failures, [])
            self.assertEqual(failures, ['off-site backup success receipt is missing'])

    def test_parallel_endpoint_checks_keep_expected_denials_and_timeouts_distinct(self):
        probes = [('ok', ['http://ok.invalid'], 200), ('auth', ['http://auth.invalid'], 401),
                  ('down', ['http://down.invalid'], 200)]
        def request(*args):
            return {'http://ok.invalid': '200', 'http://auth.invalid': '401', 'http://down.invalid': ''}[args[-1]]
        with patch.object(health, 'probes', return_value=probes), patch.object(health, 'sh', side_effect=request), \
             patch.object(health, 'TCP_PROBES', []):
            failures, info = [], []
            health.health(failures, info)
            self.assertEqual(failures, ['down: http://down.invalid -> 000 (want 200)'])
            self.assertEqual(info, ['3 health probes'])

    def test_sms_monitor_is_independently_supervised(self):
        from unittest.mock import mock_open
        with patch.object(health.os.path, 'exists', return_value=True), \
             patch.object(health, 'systemctl', return_value='active\n'), \
             patch('builtins.open', mock_open(read_data='{"checked_at":100,"sms_problem":true}')), \
             patch.object(health.time, 'time', return_value=400):
            failures = []
            health.critical_monitor_health(failures, [])
            self.assertEqual(failures, ['critical SMS monitor results are stale',
                'critical SMS monitor could not confirm an outage notification'])


if __name__ == '__main__':
    unittest.main()
