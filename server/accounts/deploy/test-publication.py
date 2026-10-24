import importlib.util, os, pathlib, shlex, subprocess, tempfile, unittest, zipfile
spec=importlib.util.spec_from_file_location('guard',pathlib.Path(__file__).with_name('check-publication.py'));guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
class PublicationTests(unittest.TestCase):
 def test_marketing_assets_are_public_under_private_umask(self):
  hook=pathlib.Path(__file__).with_name('deploy-marketing.sh').read_text()
  command=shlex.split(next(line for line in hook.splitlines() if line.startswith('rsync ')))
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);source=root/'source';target=root/'target'
   source.mkdir();target.mkdir()
   for name in ['new-branding','existing-branding']:
    directory=source/name;directory.mkdir(mode=0o700)
    asset=directory/'logo.svg';asset.write_text('<svg/>');asset.chmod(0o600)
   existing=target/'existing-branding';existing.mkdir(mode=0o700)
   (existing/'logo.svg').write_text('<svg/>');(existing/'logo.svg').chmod(0o600)
   previous=os.umask(0o077)
   try:
    subprocess.run(command[:-2]+[str(source)+'/',str(target)+'/'],check=True,capture_output=True)
   finally:
    os.umask(previous)
   for name in ['new-branding','existing-branding']:
    with self.subTest(directory=name):
     self.assertEqual((target/name).stat().st_mode&0o777,0o755)
     self.assertEqual((target/name/'logo.svg').stat().st_mode&0o777,0o644)
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
