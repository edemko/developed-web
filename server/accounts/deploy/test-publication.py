import importlib.util, pathlib, tempfile, unittest, zipfile
spec=importlib.util.spec_from_file_location('guard',pathlib.Path(__file__).with_name('check-publication.py'));guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
class PublicationTests(unittest.TestCase):
 def test_clean_build_and_well_known(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'index.html').write_text('<!doctype html>');(p/'.well-known').mkdir();(p/'.well-known/security.txt').write_text('Contact: mailto:security@example.test');self.assertEqual(guard.check(p),[])
 def test_secret_without_secret_filename(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'config.js').write_text('const key="sk-proj-'+('a'*45)+'";');self.assertTrue(guard.check(p))
 def test_env_backup_map_and_symlink(self):
  for name in ['.ENV.local','backup.sql','source.js.map','package.json','private.pem']:
   with self.subTest(name=name),tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d);(p/name).write_text('test');self.assertTrue(guard.check(p))
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'file.txt').symlink_to('/etc/hostname');self.assertTrue(guard.check(p))
 def test_archive_private_material_and_personal_index(self):
  for name,data in [('assets/.env','test'),('assets/flutter_assets/assets/manifest.json','["private title"]')]:
   with self.subTest(name=name),tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d)
    with zipfile.ZipFile(p/'app.apk','w') as z:z.writestr(name,data)
    self.assertTrue(guard.check(p))
if __name__=='__main__':unittest.main()
