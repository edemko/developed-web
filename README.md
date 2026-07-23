# DevelopED website

Static bilingual B2B website for DevelopED, focused on custom web applications, internal systems and AI automation. DevelopED is the commercial and marketing brand of Healthcare Data Solutions s. r. o.

## Architecture

- Slovak is served at `/`.
- English is an independently crawlable page at `/en/`.
- Each language has its own canonical URL, metadata and reciprocal `hreflang`.
- Contact is email-only through `info@developed.sk`; there is no contact-form processor.
- The website does not use analytics, advertising, cookies, `localStorage` or `sessionStorage`.
- Fonts, CSS and JavaScript are first-party. There is no external font or icon dependency.

## Local development

No build step or package installation is required:

```sh
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Main files

```text
index.html                         Slovak homepage
en/index.html                      English homepage
styles.css                         Shared responsive design
script.js                          Accessible navigation behaviour
pravne-informacie/                 Slovak provider notice
ochrana-osobnych-udajov/           Slovak GDPR notice
cookies/                           Slovak storage notice
podmienky-pouzivania/              Slovak B2B website terms
en/legal-notice/                   English provider notice
en/privacy/                        English GDPR notice
en/cookies/                        English storage notice
en/website-terms/                  English B2B website terms
robots.txt                         Crawler rules
sitemap.xml                        Indexable language URLs
vercel.json                        Production security headers
.well-known/security.txt           Security contact
docs/                              SEO/GEO/legal audit and source copy
```

## Publication gate

The registered entity, address, IČO, DIČ, VAT status and register entry are now populated. The legal pages still contain visible operational placeholders and use `noindex,nofollow`. Before production publication:

1. Confirm the Zoho contracting entity, signed data-processing agreement, data region and email-retention settings.
2. Resolve the confirmed Vercel Hobby contractual gap: upgrade to a plan covered by the Vercel DPA or obtain Slovak counsel’s confirmation of another compliant treatment. The account audit confirmed Web Analytics disabled, Speed Insights without data, no Observability Plus, no Log Drains and no server functions.
3. Adopt and follow a concrete enquiry-retention period.
4. Obtain Slovak counsel review.
5. Remove the draft warnings and change legal-page robots directives to `index,follow` only after every item is complete.
6. Add the final legal URLs to `sitemap.xml`.

Never deploy legal placeholders as if they were complete provider information.

## Validation

Recommended pre-deployment checks:

```sh
node --check script.js
xmllint --noout sitemap.xml
git diff --check
```

Also verify all internal links, canonical/hreflang reciprocity, structured data, keyboard navigation, mobile layout, browser storage, third-party requests and response headers in the deployed environment.

## Contact

- Email: [info@developed.sk](mailto:info@developed.sk)
- Website: [www.developed.sk](https://www.developed.sk/)

© 2026 Healthcare Data Solutions s. r. o. · commercial brand DevelopED.
