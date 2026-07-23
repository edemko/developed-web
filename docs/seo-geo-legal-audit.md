# DevelopED SEO, GEO, privacy and legal audit

**Audit date:** 23 July 2026<br>
**Audited properties:** the repository in `developed-web` and the production site at <https://www.developed.sk/><br>
**Business model assumed:** B2B lead generation only; no contract or order is concluded on the website<br>
**Languages assumed:** Slovak at `/`; English at `/en/`<br>
**Tracking assumed:** no analytics, advertising or marketing tracking

> This is an implementation and compliance-readiness report, not a substitute for advice from a Slovak lawyer. The legal drafts accompanying this report must not be published until every marked placeholder has been completed, the actual data flows have been verified, and Slovak counsel has reviewed the result.

## Executive summary

The site is indexable, served over HTTPS and already has a canonical URL, a sitemap, basic social metadata and several JSON-LD blocks. Those are useful foundations. The main weaknesses are not a missing meta tag; they are inconsistent language delivery, thin entity and trust evidence, privacy disclosures that do not match the actual form provider, unsupported marketing claims, and slow render-blocking font/icon resources.

The lab baseline captured during this audit was:

| Lighthouse category | Score |
|---|---:|
| Performance | 74 |
| Accessibility | 85 |
| Best practices | 100 |
| SEO | 100 |

The mobile-emulated run reported FCP and LCP of **4.3 seconds**, zero total blocking time and zero layout shift. Lighthouse's SEO score only checks a limited set of technical rules; it does not validate language architecture, legal identity, content quality, local relevance, entity confidence or whether claims are supportable.

### Remediation implemented in the local working tree

The baseline above describes the production site and repository before remediation. The local implementation completed on 23 July 2026 now includes:

- complete static Slovak HTML at `/` and English HTML at `/en/`, each with a self-canonical, reciprocal hreflang, matching metadata and language-specific JSON-LD;
- direct email contact at `info@developed.sk`, with Web3Forms, the form, its access key and submission code removed;
- no Google Fonts, Font Awesome, analytics, advertising, embeds, cookies, `localStorage` or `sessionStorage`;
- corrected, configuration-specific AI/privacy wording and removal of unsupported percentage and speed claims;
- accessible navigation, visible focus, corrected contrast, named controls and reduced-motion handling;
- eight matching Slovak/English legal routes, footer/legal navigation, a storage notice and a security contact;
- an updated sitemap and robots file with explicit OAI-SearchBot access;
- a consolidated Organization/ProfessionalService, Person, WebSite, WebPage and Service JSON-LD graph;
- a Vercel security-header configuration containing CSP, HSTS, referrer, permission, MIME-sniffing and framing protections.

Local mobile-emulated Lighthouse after remediation scored **100 performance, 100 accessibility, 100 best practices and 100 SEO**, with **1.2-second LCP**, **0 ms total blocking time** and **0 cumulative layout shift**. Ten HTML routes passed local checks for internal targets, one H1, unique IDs, parseable JSON-LD and reciprocal canonical/hreflang pairs. Production results must still be verified after deployment.

The registered identity and VAT status were subsequently supplied by the operator and checked against the public Commercial Gazette record: **Healthcare Data Solutions s. r. o.**, Bauerova 1205/7, 040 23 Košice - mestská časť Sídlisko KVP, IČO 56400896, DIČ 2122301698, not registered for VAT, Commercial Register of the Košice City Court, section Sro, file 60030/V. **DevelopED remains the commercial and marketing brand** in public-facing copy and the `Organization` schema uses the registered entity as `legalName`.

The implementation is deliberately **not publication-ready** while the Zoho DPA and mailbox settings, the Vercel Hobby contractual gap, the internal enquiry-retention policy, effective dates and counsel review remain unresolved. A CLI/API account audit confirmed the Vercel project uses Hobby, Web Analytics is disabled, Speed Insights has no data, Observability Plus is not enabled, there are zero Log Drains and the project contains no server functions. Vercel’s current DPA expressly applies to Pro and Enterprise, not Hobby. Legal routes remain `noindex,nofollow` and outside the sitemap.

### Highest-risk findings

1. The same URL represents both Slovak and English. Initial HTML, metadata, visible content and JSON-LD can disagree after JavaScript changes the language. Search results observed during the audit contained both languages on one indexed page.
2. The footer does not provide the statutory identity details expected from a Slovak commercial website.
3. The contact form sends names, email addresses, company names, messages, IP-related metadata and spam signals to Web3Forms without a point-of-collection privacy notice.
4. Web3Forms states that it operates from India, uses infrastructure in multiple regions, can retain form submissions for up to three years, and may send submitter IP/email data to spam services. This conflicts with the site's categorical “data never leaves the EU” and “no third-party cloud” claims.
5. Claims such as “100% client satisfaction,” “3x faster” and “50% cost savings” have no visible methodology, time period or evidence.
6. Google Fonts and Font Awesome are render-blocking. The audited page downloaded roughly 400 KB of font files, and Lighthouse estimated about 3.38 seconds of potential render-blocking savings.
7. Several controls and links lack accessible names, and important accent text does not meet contrast requirements.

## Priority plan

### P0 — complete before promoting the site

| Finding | Risk | Required action |
|---|---|---|
| Missing legal identity | Statutory and trust risk | Add persistent footer links to provider details, privacy, storage/cookies and B2B website terms. Complete registered name, address, IČO, tax/VAT status, register entry and competent authority. |
| Undisclosed form processing | GDPR transparency and transfer risk | Remove Web3Forms and the form. Replace them with a direct `mailto:info@developed.sk` contact link and document Zoho Mail as the mailbox provider. Until removal, disclose Web3Forms, its subprocessors, retention and transfers. |
| EU-only privacy claims conflict with actual vendors | Misleading advertising and trust risk | Replace categorical claims with configuration-specific, verifiable wording. Never promise EU-only processing when Telegram, model APIs, a global CDN or a non-EEA form provider is involved. |
| One URL for two languages | Indexing and entity-consistency risk | Publish complete Slovak HTML at `/` and complete English HTML at `/en/`. Do not rely on `localStorage` or client-side replacement to create indexable language versions. |
| Unsubstantiated outcome claims | Advertising and credibility risk | Remove them or add a defensible methodology, sample, period and evidence. Prefer concrete case-study facts approved by the client. |

### P1 — next release

| Finding | Impact | Required action |
|---|---|---|
| Render-blocking third-party fonts/icons | LCP and privacy | Self-host a minimal Inter variable-font subset or use a system stack; replace Font Awesome with local SVG icons; defer scripts. |
| Fragmented JSON-LD | Search/entity ambiguity | Replace separate, partly inconsistent blocks with one language-specific `@graph`. |
| Weak service-depth and case-study evidence | Organic and GEO visibility | Create one page per core service and useful, evidence-backed case studies with problem, constraints, solution, stack and measured result. |
| Accessibility failures | Usability and compliance | Fix contrast, accessible names, language control, mobile menu semantics and focus behavior. |
| Unnecessary contact form | Privacy, abuse and maintenance | Remove the form code, Web3Forms access key, JavaScript submission handler, notifications and form-specific CSS. Provide a clear email CTA to `info@developed.sk`. |
| Incomplete security headers | Trust and hardening | Add a tested CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and framing protection. |

### P2 — ongoing authority and discovery

- Establish and maintain Google Search Console and Bing Webmaster Tools.
- Submit only canonical URLs in the sitemap and use accurate `lastmod` dates.
- Add IndexNow when new service or case-study URLs are published or materially updated.
- Maintain a legitimate Google Business Profile only if DevelopED meets Google's eligibility rules for a customer-facing or service-area business.
- Earn relevant citations and links from clients, technology partners, Slovak business directories and professional profiles.
- Track branded and non-branded queries, qualified leads and ChatGPT/Copilot referrals without introducing non-essential tracking unless a compliant consent system is added.

## Technical SEO

### Language architecture

Google recommends different URLs for different language versions rather than changing language using cookies or browser settings. The target mapping is:

| Content | Slovak URL | English URL |
|---|---|---|
| Home | `https://www.developed.sk/` | `https://www.developed.sk/en/` |
| Custom applications | `/sluzby/vyvoj-webovych-aplikacii/` | `/en/services/custom-web-applications/` |
| AI automation / OpenClaw | `/sluzby/ai-automatizacia/` | `/en/services/ai-automation/` |
| Projects | `/projekty/` | `/en/projects/` |
| About / founder | `/o-nas/` or `/o-mne/` | `/en/about/` |
| Contact | `/kontakt/` | `/en/contact/` |
| Provider details | `/pravne-informacie/` | `/en/legal-notice/` |
| Privacy | `/ochrana-osobnych-udajov/` | `/en/privacy/` |
| Storage/cookies | `/cookies/` | `/en/cookies/` |
| B2B website terms | `/podmienky-pouzivania/` | `/en/website-terms/` |

Every pair must:

- render its complete language without JavaScript;
- use the matching `lang` attribute;
- have a self-referencing canonical;
- declare reciprocal `hreflang="sk"` and `hreflang="en"` links;
- declare Slovak `/` as `x-default`;
- use translated navigation and legal links;
- use language-matching Open Graph values and JSON-LD;
- appear as separate canonical URLs in the sitemap.

Example for the Slovak home page:

```html
<link rel="canonical" href="https://www.developed.sk/">
<link rel="alternate" hreflang="sk" href="https://www.developed.sk/">
<link rel="alternate" hreflang="en" href="https://www.developed.sk/en/">
<link rel="alternate" hreflang="x-default" href="https://www.developed.sk/">
```

The English page must contain the same set with its canonical changed to `/en/`. Remove the current `localStorage` language preference; normal links between the two URLs make the choice durable and crawlable.

### Titles, descriptions and headings

- Give each service page one descriptive H1 and a unique title/description written for its query intent.
- Keep the home title focused on the main commercial category and location. Avoid joining every product with repeated separators.
- Recommended Slovak home direction: `Vývoj webových aplikácií na mieru | DevelopED Košice`.
- Recommended English home direction: `Custom Web Application Development in Slovakia | DevelopED`.
- Use OpenClaw/AI automation on its own service page rather than forcing it into every home-page metadata field.
- Keep one H1 per page. The logo should not be a heading.
- Correct visible errors such as `Pyhton`, `Ste ripravení`, inconsistent “skills” terminology and language mixing inside the OpenClaw section.

### Crawl and index controls

The current `robots.txt` allows all crawlers, so OAI-SearchBot is not blocked. Make the intent explicit and keep training-crawler policy separate from search inclusion:

```text
User-agent: *
Allow: /

User-agent: OAI-SearchBot
Allow: /

Sitemap: https://www.developed.sk/sitemap.xml
```

`OAI-SearchBot` controls eligibility for ChatGPT search discovery. `GPTBot` is a separate decision about potential model-training crawling and does not need to be allowed for ChatGPT search visibility. Document that decision in the repository rather than conflating the two.

The sitemap should contain only final canonical URLs, reciprocal language alternates and truthful `lastmod` values. The current sitemap date and the production update date are inconsistent and should be generated from real content changes.

An `llms.txt` file is optional and experimental. It must never replace crawlable HTML, normal internal links, robots rules, a sitemap or structured data.

### URL and link hygiene

- Redirect `https://developed.sk/` to the selected `https://www.developed.sk/` host in one hop; this currently works.
- Replace `href="#"` social links with real profiles or remove them.
- Add `rel="noopener noreferrer"` to every external `target="_blank"` project link.
- Make email and telephone details usable `mailto:` and `tel:` links.
- Add contextual links between services, relevant projects, founder information and contact.
- Use real detail pages instead of anchor-only sections for topics that need to rank independently.

## Content, keyword and conversion plan

### Query-to-page map

| Page | Primary Slovak intent | Supporting intent |
|---|---|---|
| Home | vývoj webových aplikácií Košice; softvér na mieru Slovensko | vývojár pre firmy; digitalizácia firmy |
| Custom applications | vývoj webovej aplikácie na mieru | firemný portál, interný systém, databázová aplikácia |
| AI automation | AI automatizácia pre firmy; AI asistent pre firmy | nasadenie AI, Telegram asistent, firemné workflow |
| Projects | referencie vývoj aplikácií | relevant technology/problem terms |
| About/founder | Erik Demko DevelopED | experience, process, technologies, Košice |

English pages should target actual international buying language, not word-for-word translations. Avoid creating many near-empty location pages. Mention Košice and Slovakia where genuinely relevant, while explaining remote delivery throughout the supported market.

### Service-page content

Each core service page should answer:

1. What business problem is solved?
2. Who is the service for and not for?
3. What is delivered?
4. How does discovery, design, implementation, testing and handover work?
5. What affects price and delivery time?
6. Who owns the source code and accounts?
7. What hosting, support and maintenance choices exist?
8. What security and data-protection responsibilities are shared?
9. What evidence demonstrates capability?
10. What is the next low-friction step?

Do not promise a fixed outcome that depends on a client's scope, data, third-party services or cooperation.

### Case studies

Create a page for each project that can be publicly discussed. Obtain client approval before naming the client or revealing metrics. A useful case study contains:

- client/sector and date;
- initial problem and constraints;
- DevelopED's exact role;
- architecture and important trade-offs;
- security, privacy and accessibility considerations;
- delivery process;
- measurable result with source/methodology;
- approved quote or testimonial, if genuine;
- live link and screenshots with descriptive alt text;
- last review/update date.

Replace generic portfolio claims with evidence. If a metric is confidential, use a bounded, client-approved description instead of inventing a percentage.

## Local SEO and entity trust

The current page identifies Erik Demko and Košice but does not publish a complete, consistent business identity. Search engines and buyers need the same facts everywhere:

- registered business name and legal form;
- public business address or legitimate service-area configuration;
- telephone and domain email;
- IČO and registry entry;
- founder name and professional profiles;
- service area;
- logo and brand spelling;
- opening/contact hours if applicable.

Use identical NAP data on the website, Google Business Profile (if eligible), LinkedIn, business registers and relevant directories. Do not create a virtual-office or keyword-stuffed business listing that violates platform rules.

Create a substantive founder/about page with verifiable experience, responsibilities and links to professional profiles. Remove empty GitHub/Twitter placeholders. Add a genuine GitHub or other technical profile only when it supports the same identity.

## Generative engine optimization

GEO is mainly an evidence and retrieval problem. AI search systems are more likely to cite content that is crawlable, unambiguous, specific and corroborated.

### Required signals

- One stable canonical URL per language and topic.
- A consistent organization/founder identity in visible copy and JSON-LD.
- Direct, answer-first summaries near the top of service pages.
- Clear authorship and last-reviewed dates on substantive content.
- Concrete service boundaries, delivery process and price factors.
- Case studies with attributable evidence rather than anonymous superlatives.
- FAQ answers that match the actual service and contracts.
- External corroboration from client sites, professional profiles and legitimate directories.
- Crawl access for OAI-SearchBot and Bing, plus current sitemaps/IndexNow.

### Recommended answer blocks

Add concise, factual blocks that can stand alone in a cited answer:

- “What does DevelopED build?”
- “Who owns the source code and cloud accounts?”
- “How is a custom application project priced?”
- “What data can an AI assistant send to model providers?”
- “Can an OpenClaw installation be configured for EU hosting?”
- “What is included in maintenance?”

Answers must distinguish server location from all other data recipients. An EU-hosted server does not by itself mean that Telegram messages, AI API prompts, support logs or email stay in the EU.

### Claim corrections

| Current direction | Problem | Safer direction |
|---|---|---|
| `100% Client Satisfaction` | No sample, date or method | Remove, or state a documented survey result with period and respondent count. |
| `3x Faster Development` | Unclear baseline and evidence | `AI-assisted workflows can shorten selected development tasks; the delivery estimate depends on scope and integrations.` |
| `50% Cost Savings` | Unclear comparator and evidence | `The proposal explains the scope, assumptions and cost drivers before work starts.` |
| `Your data never leaves the EU` | Contradicted by Telegram/model/email vendors unless specially configured | `EU hosting is available. Data flows to messaging, model and integration providers are documented for each deployment.` |
| `No third-party cloud` | The described service uses third-party model and messaging providers | `You control the server and provider accounts; approved third parties are listed in the deployment documentation.` |
| `ChatGPT inputs may be used for training` | Omits consumer controls and business/API defaults | `Data use depends on the selected product, plan and settings. Business/API providers publish separate retention and training terms.` |
| `equally powerful AI` | Subjective and untestable | Describe the configured model, tools and operational limits instead. |

## Structured data

Replace the current independent blocks with one language-specific `@graph` whose nodes reuse stable `@id` values:

- `Organization` or the most accurate `ProfessionalService` subtype for DevelopED;
- `Person` for Erik Demko;
- `WebSite`;
- the current `WebPage`;
- `Service` nodes for custom applications and AI automation;
- `BreadcrumbList` on inner pages;
- `Offer` only where price, VAT treatment, scope and availability match the visible page.

Recommended organization properties, when verified:

- `name`, `legalName`, `url`, `logo`, `email`, `telephone`;
- complete `PostalAddress`;
- `identifier` for IČO and `vatID` only if applicable;
- `founder` or `employee`;
- `areaServed`;
- `sameAs` for genuine profiles;
- `hasOfferCatalog`.

Use `Service`, not `Product`, for a configured installation/management engagement unless OpenClaw is genuinely sold as a standardized product. Do not mark the business as a walk-in `LocalBusiness` if there is no eligible customer-facing location.

FAQ structured data may help machines understand visible questions, but it does not guarantee a Google rich result. JSON-LD text must match the visible language and content exactly.

## Performance, accessibility and security

### Performance

The audited critical path included Google Fonts, Font Awesome, the main stylesheet and non-deferred scripts. Recommended implementation:

1. Replace Font Awesome with a small set of local SVGs.
2. Self-host one variable-font file with only needed weights, or use a system font stack.
3. Add `font-display: swap` and preload only the actual critical local font.
4. Add `defer` to non-module scripts and ensure the visible H1 renders without waiting for translation JavaScript.
5. Remove unused CSS and reduce style duplication.
6. Cache versioned static assets for a long duration while keeping HTML revalidatable.
7. Retest on the deployed URL, not only localhost.

Post-remediation targets:

- Lighthouse performance at least 90;
- lab LCP at or below 2.5 seconds;
- CLS at or below 0.1;
- no avoidable render-blocking third-party font/icon requests.

### Accessibility

The audit found:

- accent text contrast around 2.62–2.76:1 where 3:1 or 4.5:1 is required;
- three social links without accessible names;
- the language `<select>` without an accessible label;
- a visual hamburger implemented as a `<div>` rather than a named button.

Also implement:

- visible keyboard focus on all controls;
- a real menu button with `aria-expanded` and `aria-controls`;
- `aria-label` or visible text for icon-only links;
- motion reduction for users with `prefers-reduced-motion`;
- a skip link to `<main>`;
- valid Slovak/English `lang` on every page.

Target Lighthouse accessibility: at least 95, with manual keyboard and screen-reader smoke testing.

### Security and direct email contact

HSTS is present on production. Add and test:

- a Content Security Policy using explicit local/script/style/connect sources and `frame-ancestors`;
- `X-Content-Type-Options: nosniff`;
- a conservative `Referrer-Policy`;
- `Permissions-Policy` disabling unused browser capabilities;
- framing protection through CSP (and optionally `X-Frame-Options` for legacy clients).

Remove the Web3Forms form and all related submission JavaScript. Replace it with a normal, accessible link:

```html
<a href="mailto:info@developed.sk">info@developed.sk</a>
```

Place a short privacy notice beside the email CTA explaining that an email enquiry does not create a contract, that Zoho Mail processes the correspondence, and that secrets or sensitive data must not be sent by ordinary email. The website then transmits no enquiry data itself; processing begins when the visitor chooses to open their email client and sends a message.

Verify the Zoho organization before publication:

- the account uses the intended data centre (`mail.zoho.eu` indicates the Europe data centre);
- a Zoho DPA has been initiated and retained for the organization;
- administrator retention/eDiscovery settings match the published retention rule;
- mailbox access, MFA, recovery and forwarding rules are secure;
- stale enquiries are deleted according to the stated schedule.

## Privacy, cookies and legal readiness

### Current data inventory

| Processing | Current recipient | Main concern |
|---|---|---|
| Site delivery and request logs | Vercel/global infrastructure | IP, request and device metadata; document roles, DPA, transfers and retention. |
| Contact submission | Web3Forms/Web3Creative and subprocessors | Current-state risk: India/multi-region processing, up-to-three-year vendor retention, spam-service sharing and no point-of-collection notice. Remove the form. |
| Direct email enquiries (target state) | Zoho Mail | Verify the exact contracting entity, Europe data-centre assignment, DPA, subprocessors, mailbox/eDiscovery settings and actual deletion schedule. |
| Fonts | Google Fonts | The browser sends IP, requested URL and HTTP headers to Google. |
| Icons/fonts | cdnjs/Cloudflare | Third-party request and network metadata; unnecessary for a small icon set. |
| Language preference | Browser `localStorage` | Device storage governed by ePrivacy-style rules even though it is not a cookie. Eliminate through language URLs. |

Self-hosting fonts/icons and moving language state into the URL materially simplify both privacy and performance.

### Target cookie/storage position

After remediation, the site should set no cookies and use no browser storage. Hosting/security logs are personal-data processing but are not cookies; describe them in the privacy notice. In that target configuration:

- do not show a decorative consent banner;
- publish a transparent cookie/storage notice;
- confirm through a clean-browser network/storage audit;
- repeat the audit whenever a new embed, analytics script, chat widget, map, video or marketing tool is added.

If non-essential analytics or marketing technology is later introduced, block it before consent, provide equally prominent accept/reject choices, support granular purposes and withdrawal, and maintain consent records.

### Required public legal set

The accompanying Slovak and English drafts include:

1. provider identification/legal notice;
2. privacy notice;
3. cookie and local-storage notice;
4. B2B website and inquiry terms;
5. short privacy text beside the direct email link.

They intentionally do not replace a project MSA, statement of work, DPA, SLA/maintenance schedule, security schedule or AI/subprocessor schedule. Those should be separate documents for paying clients.

### Mandatory pre-publication fields

- registered name and legal form — **completed**;
- registered business address and correspondence address — **completed**;
- IČO — **completed**;
- DIČ and exact VAT status/IČ DPH — **completed; not registered for VAT**;
- register and entry number — **completed**;
- competent supervisory/licensing authority — **identified as the Košice District Office, Department of Trade Licensing; confirm in counsel review**;
- controller privacy email (`info@developed.sk`, unless a dedicated address is later created);
- Vercel and Zoho Mail account regions, exact contracting entities, DPAs and any transfer mechanisms;
- actual hosting/mail log retention;
- actual inquiry and unsuccessful-proposal retention;
- whether prices include or exclude VAT — **completed; VAT is not added because the provider is not VAT-registered**;
- accurate effective date and version.

Do not publish placeholder values and do not copy identifiers from a person with a similar name.

## Validation checklist

### Crawl and language

- [x] `/` returns complete Slovak HTML with `lang="sk"` locally.
- [x] `/en/` returns complete English HTML with `lang="en"` locally.
- [x] Each implemented page has one self-canonical.
- [x] Every implemented SK/EN pair has reciprocal hreflang plus `x-default`.
- [x] The sitemap contains only the locally verified indexable canonical pages and a truthful `lastmod`.
- [x] `robots.txt` references the final `www` sitemap and allows OAI-SearchBot.
- [x] No important content requires a saved language preference or JavaScript replacement.
- [ ] Google Search Console URL Inspection sees the intended rendered language.
- [ ] Bing Webmaster Tools accepts the sitemap; IndexNow is configured for future content.

### Structured data and content

- [x] JSON-LD parses locally.
- [ ] JSON-LD passes the live Schema Markup Validator after deployment.
- [ ] Applicable types pass Google Rich Results Test without critical errors.
- [x] Visible names, services and language match JSON-LD.
- [x] Organization, person, service and page nodes reuse stable `@id` values.
- [x] Unsupported public metrics were removed; any future metric requires a source, period and methodology.
- [ ] Every named project/client statement has approval.

### Privacy and legal

- [ ] Every placeholder in both legal drafts is replaced with verified information.
- [x] Legal navigation is visible and the home-page footer links to all four legal documents.
- [x] The Web3Forms form, access key and submission JavaScript have been removed.
- [x] The direct `mailto:info@developed.sk` CTA has adjacent privacy text and links to the privacy notice.
- [ ] Actual processors, subprocessors, regions, DPAs and retention match the privacy notice.
- [x] Runtime source and rendered pages contain no cookie/local/session-storage writers.
- [ ] A clean production-browser audit confirms no cookies or local/session storage.
- [x] No analytics, pixels, embeds or chat widgets load in the local implementation.
- [x] The site clearly states its B2B audience and that an email enquiry does not create a contract.
- [x] Price/VAT wording matches the operator-confirmed VAT status.
- [ ] Slovak counsel has reviewed the published-language versions.

### Quality and security

- [x] Local mobile-emulated Lighthouse performance and accessibility are both 100.
- [x] Local lab LCP is 1.2 seconds.
- [x] Focus, menu state, email links and URL-based language switching are implemented accessibly.
- [x] All controls have accessible names.
- [x] Local Lighthouse reports no contrast failure.
- [ ] Security headers pass a production header review without blocking required assets.
- [x] No website contact endpoint exists; email is handled directly by Zoho Mail.
- [ ] No message content or full email address appears in application logs.

## Authoritative references

### Search and GEO

- Google Search Central, [Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites)
- Google Search Central, [Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)
- Google Search Central, [LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- Bing Webmaster Tools, [Webmaster Guidelines](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a)
- Bing Webmaster Tools, [IndexNow](https://www.bing.com/webmasters/help/indexnow-0z209wby)
- OpenAI, [Publishers and Developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)

### Privacy and legal

- EUR-Lex, [General Data Protection Regulation, especially Articles 5, 6, 12–14 and 15–22](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- EUR-Lex, [ePrivacy Directive Article 5(3)](https://eur-lex.europa.eu/eli/dir/2002/58/art_5/par_3/oj/eng)
- Slov-Lex, [Act No. 22/2004 Coll. on electronic commerce](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2004/22/)
- Slov-Lex, [Act No. 452/2021 Coll. on electronic communications](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2021/452/)
- Slov-Lex, [Act No. 18/2018 Coll. on personal data protection](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2018/18/)
- Slov-Lex, [Act No. 108/2024 Coll. on consumer protection](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2024/108/) — relevant if the B2B-only boundary is removed or consumers can contract
- EUR-Lex, [Regulation (EU) 2024/3228 discontinuing the former EU ODR platform](https://eur-lex.europa.eu/eli/reg/2024/3228/oj) — do not add obsolete ODR-platform boilerplate
- Slovak Data Protection Authority, [official website](https://dataprotection.gov.sk/)

### Current vendor/data statements

- Web3Forms, [Privacy Policy](https://web3forms.com/privacy)
- Vercel, [Privacy Notice](https://vercel.com/legal/privacy-notice), [Data Processing Addendum](https://vercel.com/legal/dpa), [Runtime Log retention](https://vercel.com/docs/logs/runtime), [Observability](https://vercel.com/docs/observability) and [default static-log storage guidance](https://vercel.com/kb/guide/how-do-i-store-logs-on-vercel)
- Zoho Mail, [Privacy FAQ and DPA instructions](https://www.zoho.com/privacy/privacy-faq.html), [data-centre identification](https://www.zoho.com/mail/help/api/getting-started-with-api.html) and [deletion and retention](https://www.zoho.com/mail/help/data-deletion-policy.html)
- Slovak Commercial Gazette, [Healthcare Data Solutions s. r. o. registration record](https://obchodnyvestnik.justice.gov.sk/ObchodnyVestnik/Formular/FormularDetail.aspx?IdFormular=4147597)
- Google Fonts, [Privacy and data collection](https://developers.google.com/fonts/faq/privacy)
- OpenAI, [How data is used to improve model performance](https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/)
