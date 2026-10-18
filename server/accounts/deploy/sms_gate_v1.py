"""SMS Gate v1 JSON only. Fixed HTTPS endpoints; no redirect or send retries."""
import json
import os
import re
import stat
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://api.smsgate.sk/json/'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_config(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as file:
        mode = os.fstat(file.fileno())
        if not stat.S_ISREG(mode.st_mode) or mode.st_uid != 0 or mode.st_mode & 0o077:
            raise ValueError('SMS configuration must be a private root-owned file')
        config = json.load(file)
    if set(config) != {'token', 'recipient', 'from'}:
        raise ValueError('Unexpected SMS configuration fields')
    if not isinstance(config['token'], str) or not config['token'] or re.search(r'\s', config['token']):
        raise ValueError('Invalid SMS credential')
    if not re.fullmatch(r'\+[1-9][0-9]{7,14}', config['recipient']) or config['from'] != 'DevelopED':
        raise ValueError('Invalid monitoring SMS destination or identifier')
    return config


def ok(value):
    return (isinstance(value, dict) and str(value.get('status', '')).lower() != 'error'
            and value.get('code', 'OK') == 'OK'
            and (str(value.get('status', '')).lower() == 'success' or value.get('code') == 'OK'))


def safe_code(value, token):
    text = str(value or '')
    return text if re.fullmatch(r'[A-Z0-9_]{1,80}', text) and token not in text else 'PROVIDER_REJECTED'


def post(method, fields, opener=None):
    if method not in ('send_message', 'check_message'):
        raise ValueError('Unapproved SMS Gate method')
    request = urllib.request.Request(BASE + method, method='POST',
        data=urllib.parse.urlencode(fields).encode('ascii'), headers={
            'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'})
    opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=8) as response:
            raw = response.read(65537)
            if len(raw) > 65536:
                return None, 'INVALID_RESPONSE', True
            return json.loads(raw), None, False
    except urllib.error.HTTPError as error:
        # Never include provider bodies, credential-bearing errors or URLs in logs.
        return None, f'HTTP_{error.code}', error.code >= 500
    except Exception:
        # The request may already have reached the provider. Do not resend it.
        return None, 'TRANSPORT_OR_RESPONSE_ERROR', True


def send(config, text, opener=None):
    # One GSM segment: generated text uses only this GSM basic-character subset.
    if not re.fullmatch(r'[A-Za-z0-9 .,:;!/?()+_\-]{1,160}', text):
        raise ValueError('SMS must fit one plain GSM segment')
    return _send(config, text, opener)


def send_registration(config, text, opener=None):
    # Registration addresses are printable ASCII, but may contain @, plus aliases,
    # GSM extension characters or a backtick (which requires Unicode encoding).
    # Permit bounded multipart messages to retain the complete email address.
    if not re.fullmatch(r'[\x20-\x7e]{1,400}', text):
        raise ValueError('Registration SMS must be bounded printable ASCII')
    return _send(config, text, opener, unicode='`' in text)


def _send(config, text, opener=None, unicode=False):
    fields = {'token': config['token'], 'to': config['recipient'], 'from': config['from'],
              'text': text, 'priority': '3', 'validity': '30', 'unicode': str(unicode).lower(), 'callback': 'false'}
    data, error, ambiguous = post('send_message', fields, opener)
    if error:
        return {'status': 'unknown' if ambiguous else 'rejected', 'code': error}
    if not isinstance(data, dict):
        return {'status': 'unknown', 'code': 'INVALID_RESPONSE'}
    if not isinstance(data.get('result'), dict):
        return {'status': 'unknown', 'code': 'INVALID_RESPONSE'}
    if not ok(data.get('result')):
        return {'status': 'rejected', 'code': safe_code((data.get('result') or {}).get('code'), config['token'])}
    messages = data.get('messages')
    if not isinstance(messages, list) or len(messages) != 1 or not isinstance(messages[0], dict):
        return {'status': 'unknown', 'code': 'INVALID_RESPONSE'}
    item = messages[0]
    if not ok(item):
        return {'status': 'rejected', 'code': safe_code(item.get('code'), config['token'])}
    identifier = str(item.get('message_id', ''))
    if not re.fullmatch(r'[0-9]{1,20}', identifier):
        return {'status': 'unknown', 'code': 'INVALID_RESPONSE'}
    return {'status': 'accepted', 'message_id': identifier}


def delivery(config, identifier, opener=None):
    if not re.fullmatch(r'[0-9]{1,20}', str(identifier)):
        raise ValueError('Invalid SMS message ID')
    data, error, _ = post('check_message', {'token': config['token'], 'message_id': str(identifier)}, opener)
    if error or not isinstance(data, dict) or not ok(data.get('result')):
        return {'status': 'unknown', 'code': error or 'STATUS_UNAVAILABLE'}
    code = safe_code(data.get('code'), config['token'])
    if code == 'DELIVERED':
        return {'status': 'delivered', 'code': code}
    if code in ('EXPIRED', 'DELETED', 'UNDELIVERABLE', 'UNDELIVERED', 'DENIED', 'BLACKLISTED'):
        return {'status': 'failed', 'code': code}
    return {'status': 'pending' if code in ('UNSENT', 'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'IN_GROUP', 'PROCESSING', 'ERROR') else 'unknown', 'code': code}
