"""Generate checked-in static SK/EN product pages. No build is needed to serve them."""
import html,json
from pathlib import Path
from urllib.parse import quote
ROOT=Path(__file__).resolve().parents[2]
products=json.loads(Path(__file__).with_name('products.json').read_text())
def esc(text):return html.escape(str(text),quote=True)
ui={
'sk':dict(skip='Preskočiť na obsah',features='Funkcie',screens='Ukážky',questions='Otázky',open='Otvoriť aplikáciu',see='Pozrieť ukážky',caption='Skutočné rozhranie aplikácie · ukážkové údaje',zoom='Zväčšiť snímku',close='Zavrieť',everyday='Navrhnuté pre každý deň.',what='Čo s aplikáciou zvládnete',simple='Praktické funkcie, ktoré do seba zapadajú.',inside='Pozrite sa dovnútra',faq='Dobré vedieť.',faqnote='Ešte niečo vás zaujíma?',contact='Napíšte nám',cta='Spoznajte {name} naživo.',ctanote='Máte účet? Otvorte aplikáciu. Potrebujete prístup alebo ukážku? Ozvite sa nám.',request='Dohodnúť ukážku',more='Ďalšie aplikácie od DevelopED',footer='Aplikácie, ktoré dávajú nápadom zmysel.',privacy='Ochrana súkromia',terms='Podmienky používania',home='Späť na DevelopED',shot='Snímka aplikácie'),
'en':dict(skip='Skip to content',features='Features',screens='Screenshots',questions='Questions',open='Open the app',see='Explore the app',caption='Actual application interface · demo data',zoom='Enlarge screenshot',close='Close',everyday='Made for everyday use.',what='What you can do',simple='Practical features that work together.',inside='A look inside',faq='Good to know.',faqnote='Have another question?',contact='Get in touch',cta='Get to know {name}.',ctanote='Already have an account? Open the app. Need access or a guided demo? Get in touch.',request='Request a demo',more='More apps by DevelopED',footer='Applications that bring ideas to life.',privacy='Privacy',terms='Website terms',home='Back to DevelopED',shot='Application screenshot')}
for product in products:
 for lang in ['sk','en']:
  p=product;copy=p[lang];t=ui[lang];slug=p['slug'];prefix='/en' if lang=='en' else '';path=f'{prefix}/{slug}/';canonical='https://www.developed.sk'+path
  appurl=p['url'];title=p['name']+' — '+copy['title']+' | DevelopED'
  def browser(name,alt,eager=False):
   image=f'/assets/showcases/{slug}/{name}.jpg'
   width,height=p.get('imageSizes',{}).get(name,[1440,1000])
   return f'''<div class="browser"><div class="browser-bar" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span><span>{esc(p['host'])}</span><span>↗</span></div><button class="shot" type="button" data-zoom aria-label="{esc(t['zoom']+': '+alt)}"><img src="{image}" alt="{esc(alt)}" width="{width}" height="{height}" {'fetchpriority="high"' if eager else 'loading="lazy"'} decoding="async"><span class="zoom-label" aria-hidden="true">↗ {esc(t['zoom'])}</span></button></div>'''
  features=''.join(f'<article class="feature"><span class="feature-num">0{i+1}</span><h3>{esc(f[0])}</h3><p>{esc(f[1])}</p></article>' for i,f in enumerate(copy['features']))
  spots=''
  for i,key in enumerate(['detail','extra','organize','queue']):
   if not p.get(key):continue
   spots+=f'''<article class="spotlight"><div class="spotlight-copy"><p class="eyebrow">0{i+1} / {esc(t['inside'])}</p><h2>{esc(copy[key+'Title'])}</h2><p>{esc(copy[key+'Text'])}</p><a class="text-link" href="{esc(appurl)}">{esc(t['open'])} <span aria-hidden="true">↗</span></a></div><div>{browser(p[key],copy[key+'Alt'])}<p class="caption">{esc(t['caption'])}</p></div></article>'''
  faq=''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q,a in copy['faq'])
  other=''.join(f'<a href="{prefix}/{a["slug"]}/">{esc(a["name"])}</a>' for a in products if a['slug']!=slug)
  schema={'@context':'https://schema.org','@type':'SoftwareApplication','name':p['name'],'applicationCategory':'MultimediaApplication' if slug=='mega-music' else 'WebApplication','operatingSystem':'Web','description':copy['intro'],'url':canonical,'screenshot':'https://www.developed.sk/assets/showcases/'+slug+'/'+p['hero']+'.jpg','creator':{'@type':'Organization','name':'DevelopED','url':'https://www.developed.sk/'}}
  skcurrent=' aria-current="page"' if lang=='sk' else '';encurrent=' aria-current="page"' if lang=='en' else ''
  page=f'''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title><meta name="description" content="{esc(copy['intro'])}">
<meta name="robots" content="index,follow,max-image-preview:large"><meta name="theme-color" content="#090e1b">
<link rel="canonical" href="{canonical}">
<link rel="alternate" hreflang="sk" href="https://www.developed.sk/{slug}/"><link rel="alternate" hreflang="en" href="https://www.developed.sk/en/{slug}/"><link rel="alternate" hreflang="x-default" href="https://www.developed.sk/{slug}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="DevelopED"><meta property="og:url" content="{canonical}"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(copy['intro'])}"><meta property="og:image" content="https://www.developed.sk/assets/showcases/{slug}/{p['hero']}.jpg"><meta property="og:image:alt" content="{esc(copy['heroAlt'])}"><meta property="og:locale" content="{'sk_SK' if lang=='sk' else 'en_US'}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/assets/showcases/product.css?v=20261001"><script src="/assets/showcases/product.js?v=20261001" defer></script>
<script type="application/ld+json">{json.dumps(schema,ensure_ascii=False).replace('<','\\u003c')}</script>
</head>
<body data-product="{slug}">
<a class="skip" href="#main">{t['skip']}</a>
<header class="site-header"><div class="wrap header-row"><a class="brand" href="{path}" aria-label="{esc(p['name'])}"><img src="/assets/projects/{p['icon']}" alt="" width="34" height="34"><span>{esc(p['name'])}<span class="byline">BY DEVELOPED</span></span></a><nav class="nav" aria-label="{'Hlavná navigácia' if lang=='sk' else 'Main navigation'}"><a class="section-nav" href="#features">{t['features']}</a><a class="section-nav" href="#screenshots">{t['screens']}</a><span class="locale"><a href="/{slug}/" lang="sk" hreflang="sk"{skcurrent}>SK</a><a href="/en/{slug}/" lang="en" hreflang="en"{encurrent}>EN</a></span><a class="nav-cta" href="{esc(appurl)}">{t['open']} ↗</a></nav></div></header>
<main id="main">
<section class="hero"><div class="wrap"><p class="eyebrow">{esc(copy['label'])}</p><h1>{esc(copy['title'])}</h1><p class="intro">{esc(copy['intro'])}</p><div class="actions"><a class="button primary" href="{esc(appurl)}">{t['open']} <span aria-hidden="true">↗</span></a><a class="button secondary" href="#screenshots">{t['see']} <span aria-hidden="true">↓</span></a></div><div class="chips">{''.join('<span>'+esc(c)+'</span>' for c in copy['chips'])}</div>{browser(p['hero'],copy['heroAlt'],True)}<p class="caption">{t['caption']}</p></div></section>
<section class="section" id="features"><div class="wrap"><div class="section-head"><div><p class="eyebrow">{t['what']}</p><h2>{t['everyday']}</h2></div><p>{t['simple']}</p></div><div class="feature-grid">{features}</div></div></section>
<section class="section showcase" id="screenshots" aria-label="{t['screens']}"><div class="wrap">{spots}</div></section>
<section class="section" id="questions"><div class="wrap faq-grid"><div class="faq-intro"><p class="eyebrow">{t['questions']}</p><h2>{t['faq']}</h2><p>{t['faqnote']} <a class="text-link" href="mailto:info@developed.sk">{t['contact']} ↗</a></p></div><div class="faq-list">{faq}</div></div></section>
<section class="wrap cta"><div><h2>{esc(t['cta'].format(name=p['name']))}</h2><p>{t['ctanote']}</p></div><a class="button primary" href="mailto:info@developed.sk?subject={quote(p['name']+' — demo')}">{t['request']} <span aria-hidden="true">↗</span></a></section>
</main>
<footer class="site-footer"><div class="wrap"><div class="footer-top"><div><a class="developed" href="{prefix}/">Develop<span>ED</span></a><p>{t['footer']}</p></div><nav class="products" aria-label="{t['more']}">{other}</nav></div><div class="footer-bottom"><span>© 2026 DevelopED</span><div><a href="{prefix}/#{'projects' if lang=='en' else 'projekty'}">{t['home']}</a><a href="{'/en/privacy/' if lang=='en' else '/ochrana-osobnych-udajov/'}">{t['privacy']}</a><a href="{'/en/website-terms/' if lang=='en' else '/podmienky-pouzivania/'}">{t['terms']}</a></div></div></div></footer>
<dialog class="lightbox" aria-label="{t['shot']}"><div class="lightbox-head"><p></p><button type="button" aria-label="{t['close']}">×</button></div><img alt=""></dialog>
</body></html>
'''
  target=ROOT/path.strip('/')/'index.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(page)
print('Generated 14 static product pages (SK / EN).')
