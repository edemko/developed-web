import importlib.util,json,pathlib,unittest
from unittest.mock import patch,MagicMock
import critical_service_monitor as monitor
spec=importlib.util.spec_from_file_location('domain_health',pathlib.Path(__file__).with_name('host-health-check.py'))
health=importlib.util.module_from_spec(spec);spec.loader.exec_module(health)
ISSUER='https://auth.developed.sk/auth/v1'
def metadata():
 return {'issuer':ISSUER,'authorization_endpoint':ISSUER+'/oauth/authorize','token_endpoint':ISSUER+'/oauth/token','jwks_uri':ISSUER+'/.well-known/jwks.json'}
class DomainMonitorTests(unittest.TestCase):
 def response(self,value,status=200):
  r=MagicMock();r.__enter__.return_value=r;r.status=status;r.read.return_value=value;return r
 def test_strict_discovery_fields(self):
  for probe in health.ISSUER_PROBES:
   with patch.object(health,'sh',return_value=json.dumps(metadata())):
    self.assertIsNone(health.issuer_discovery(probe))
   for field in metadata():
    broken=metadata();broken[field]='https://sam-api.developed162.bid/auth/v1'
    with patch.object(health,'sh',return_value=json.dumps(broken)):
     self.assertIn('invalid discovery',health.issuer_discovery(probe))
 def test_bad_unbounded_and_unavailable_response_are_sanitized(self):
  for value,status in [(b'x'*65537,200),(b'invalid-json-secret',200),(b'{}',503),(b'[]',200)]:
   with patch.object(health,'sh',return_value=value.decode()):
    result=health.issuer_discovery(health.ISSUER_PROBES[0]);self.assertIn('invalid discovery',result);self.assertNotIn('secret',result)
  with patch.object(health,'sh',side_effect=OSError('private detail')):
   self.assertNotIn('private detail',health.issuer_discovery(health.ISSUER_PROBES[0]))
 def test_additions_keep_existing_provider_and_expected_scope(self):
  for unit in ['developed-auth-domain.service','domain-provider-boundary.service']:
   self.assertIn(unit,health.REQUIRED);self.assertIn(unit,monitor.INFRA_UNITS);self.assertEqual(monitor.scope_for(unit+' is inactive'),'infra')
  self.assertIn('developed-auth-green.service',health.REQUIRED)
  self.assertIn('developed-auth-green',monitor.CONTAINERS);self.assertIn('developed-auth-domain',monitor.CONTAINERS)
  for label,url in health.ISSUER_PROBES:self.assertEqual(monitor.scope_for(label+': '+url+' -> invalid discovery'),'developed-accounts')
  self.assertEqual(monitor.scope_for('data-boundary public api auth denial: https://api.developed.sk/auth/v1/user -> 200 (want 403)'),'infra')
 def test_no_post_mutation_or_credentials_in_new_probes(self):
  additions=[p for p in health.EXTRA_PROBES if 'auth-domain' in p[0] or 'public api' in p[0]]
  self.assertEqual(len(additions),2)
  for label,args,status in additions:self.assertEqual(len(args),1);self.assertNotIn('token',args[0])
if __name__=='__main__':unittest.main()
