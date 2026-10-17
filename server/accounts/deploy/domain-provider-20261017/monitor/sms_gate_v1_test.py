import io
import json
import unittest
import urllib.error
import urllib.parse
from sms_gate_v1 import send, delivery, NoRedirect

CONFIG = {'token': 'fixture-secret-token', 'recipient': '+421900000000', 'from': 'DevelopED'}


class Gateway:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.requests = response, error, []

    def open(self, request, timeout):
        self.requests.append(request)
        if self.error:
            raise self.error
        return io.BytesIO(json.dumps(self.response).encode())


class SmsTests(unittest.TestCase):
    def test_v1_post_identifier_and_recipient(self):
        gateway = Gateway({'result': {'status': 'success', 'code': 'OK'},
                           'messages': [{'status': 'success', 'code': 'OK', 'message_id': 123, 'parts': 1}]})
        self.assertEqual(send(CONFIG, 'sam TEST: monitoring delivery check.', gateway),
                         {'status': 'accepted', 'message_id': '123'})
        request = gateway.requests[0]
        self.assertEqual(request.full_url, 'https://api.smsgate.sk/json/send_message')
        self.assertEqual(request.method, 'POST')
        fields = urllib.parse.parse_qs(request.data.decode())
        self.assertEqual(fields['from'], ['DevelopED'])
        self.assertEqual(fields['to'], [CONFIG['recipient']])
        self.assertNotIn('sender', fields)
        self.assertNotIn(CONFIG['token'], request.full_url)

    def test_uncertain_sends_are_not_retried(self):
        gateway = Gateway(error=TimeoutError('private credential must not escape'))
        result = send(CONFIG, 'sam CRITICAL: database.', gateway)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(len(gateway.requests), 1)
        self.assertNotIn('private credential', str(result))

    def test_provider_rejection_and_malformed_success(self):
        for data, expected in [({'result': {'status': 'error', 'code': 'INVALID_SENDER'}}, 'rejected'),
                               ({'result': {'status': 'success', 'code': 'OK'}, 'messages': []}, 'unknown'),
                               (None, 'unknown')]:
            self.assertEqual(send(CONFIG, 'sam TEST.', Gateway(data))['status'], expected)

    def test_only_delivered_code_proves_delivery(self):
        for code, expected in [('DELIVERED', 'delivered'), ('SENT', 'pending'), ('EXPIRED', 'failed')]:
            result = delivery(CONFIG, '123', Gateway({'result': {'code': 'OK'}, 'code': code,
                                                     'deliveryDateTime': '2026-10-15 10:00:00'}))
            self.assertEqual(result['status'], expected)

    def test_segment_limits_and_redirect_refusal(self):
        for text in ['x' * 161, 'text\nextra', 'Unicode \u010d', '']:
            with self.assertRaises(ValueError): send(CONFIG, text, Gateway())
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'https://untrusted.invalid/'))


if __name__ == '__main__': unittest.main()
