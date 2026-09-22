#!/usr/bin/python3
"""Fail closed on unexpected files or known secret formats in a static release.

Print paths and finding classes only, never matched credential values.
Use with a curated build output, not a server source directory.
"""
import argparse, base64, json, os, pathlib, re, stat, subprocess, sys, zipfile

ALLOWED = set('html css js mjs json png jpg jpeg webp avif gif svg ico xml txt webmanifest woff woff2 ttf otf eot wasm pdf apk zip mp3 mp4 webm ogg'.split())
BLOCKED_NAME = re.compile(r'(?i)^(?:\.(?:env.*|git|svn|hg|ssh|aws|npmrc|yarnrc|openai)|package(?:-lock)?\.json|composer\.(?:json|lock)|Dockerfile|Caddyfile|AGENTS\.md|CLAUDE\.md|compose\.ya?ml|docker-compose.*)$')
BLOCKED_EXT = re.compile(r'(?i)\.(?:sql|dump|sqlite3?|db|pem|key|p12|pfx|jks|keystore|bak|backup|old|orig|swp|log|map)$|~$')
SECRETS = [
 ('private key',re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----')),
 ('provider credential',re.compile(rb'(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|sb_secret_[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})')),
 ('database credential URL',re.compile(rb'(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s"\x27<>:]+:[^\s"\x27<>@]+@')),
 ('embedded source map',re.compile(rb'sourceMappingURL=data:')),
]
TEXT_EXT=set('html css js mjs json xml txt svg webmanifest'.split())

def content_findings(data):
 for name,pattern in SECRETS:
  if pattern.search(data):yield name
 for token in re.findall(rb'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',data):
  try:
   body=token.split(b'.')[1];claims=json.loads(base64.urlsafe_b64decode(body+b'='*(-len(body)%4)))
   if claims.get('role') in ['service_role','supabase_admin','postgres']:yield 'privileged JWT'
  except (ValueError,TypeError):pass

def check(root):
 root=pathlib.Path(root)
 if not root.is_dir():return [(str(root),'missing public directory')]
 findings=[]
 def add(p,why):findings.append((str(p),why))
 for directory,dirs,files in os.walk(root,followlinks=False,onerror=lambda e:add(root,'unreadable directory')):
  for name in dirs+files:
   p=pathlib.Path(directory)/name
   if p.is_symlink():add(p,'symlink in public output');continue
   if BLOCKED_NAME.match(name) or BLOCKED_EXT.search(name):add(p,'sensitive filename');continue
   if name.startswith('.') and name!='.well-known':add(p,'unapproved hidden entry');continue
   mode=p.stat().st_mode
   if mode & stat.S_IWOTH:add(p,'world-writable public entry')
   if not p.is_file():continue
   ext=p.suffix.lower().lstrip('.')
   if ext not in ALLOWED:add(p,'extension outside publication allowlist');continue
   try:
    if ext in TEXT_EXT:
     if p.stat().st_size>25_000_000:add(p,'text file exceeds scan limit');continue
     for why in content_findings(p.read_bytes()):add(p,why)
    elif ext in ['apk','zip']:
     with zipfile.ZipFile(p) as z:
      for item in z.infolist():
       path=pathlib.PurePosixPath(item.filename)
       if path.is_absolute() or '..' in path.parts:add(p,'unsafe archive member path')
       if any(BLOCKED_NAME.match(part) for part in path.parts) or BLOCKED_EXT.search(path.name):add(str(p)+'!'+str(path),'sensitive archive member')
       if str(path).endswith('flutter_assets/assets/manifest.json'):
        if item.file_size>1_000_000 or json.loads(z.read(item))!=[]:add(p,'nonempty personal title index')
       if path.suffix.lstrip('.') in TEXT_EXT and not item.is_dir():
        if item.file_size>25_000_000:add(p,'archive text exceeds scan limit');continue
        for why in content_findings(z.read(item)):add(str(p)+'!'+str(path),why)
   except (OSError,ValueError,zipfile.BadZipFile,RuntimeError):add(p,'unreadable or invalid published file')
 return findings

def caddy_roots(config):
 r=subprocess.run(['/usr/bin/caddy','adapt','--adapter','caddyfile','--config',config],capture_output=True,text=True,check=True)
 roots=set()
 def walk(x):
  if isinstance(x,dict):
   if isinstance(x.get('root'),str):roots.add(x['root'])
   for v in x.values():walk(v)
  elif isinstance(x,list):
   for v in x:walk(v)
 walk(json.loads(r.stdout));return sorted(roots)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--caddy');ap.add_argument('roots',nargs='*');args=ap.parse_args()
 roots=list(args.roots)
 if args.caddy:roots.extend(caddy_roots(args.caddy))
 if not roots:ap.error('supply a public output directory or --caddy')
 findings=[]
 for root in sorted(set(roots)):findings.extend(check(root))
 if findings:
  for p,why in findings:print(f'REJECT: {p}: {why}',file=sys.stderr)
  return 1
 print(f'Publication check passed: {len(set(roots))} public directories');return 0
if __name__=='__main__':sys.exit(main())
