# Revert the site design to the pre-SEO look (keep all new functionality)

> **First implementation step:** copy this file to `.claude/plans/design-revert-to-pre-seo-look.md`
> in the project (project rule: plans live in the project's `.claude/plans/`, not in `~/.claude/plans/`).

## Context

Commit `60279f8` ("Implement bilingual SEO, GEO, and legal site") did two things at once:

1. **Functionality/content the user wants to keep** — the `/` + `/en/` two-page bilingual
   architecture (no runtime translation), 8 legal routes, JSON-LD graph, canonical/hreflang,
   `vercel.json`, mailto-only contact, and the accessible menu logic in `script.js`.
2. **A full design-system replacement the user did not want** — `styles.css` was rewritten from
   scratch (indigo `#4f46e5` gradients on `#0f0f0f` → flat pale-lavender `#a5b4fc` on `#070a12`),
   and every component's markup changed with it. Most visibly the project cards lost their
   **Visit** button block, centred title and tech-tag pills.

The user only noticed on visiting the live site and prefers the previous design.

**Outcome:** restore the pre-SEO visual design system and component markup, while keeping the
current copy, bilingual structure, SEO metadata and legal pages intact.

**Decisions already confirmed by the user:**

| Question | Decision |
|---|---|
| Revert scope | Old design + old component markup, **current copy kept** (both languages). No return of the old About/mission text or the `100% / 3x / 50%` stat tiles. |
| Icons & fonts | **First-party only** — recreate Font Awesome icons as an inline SVG `<symbol>` sprite; keep the system font stack. No `cdnjs` / `fonts.googleapis.com`. |
| Scroll reveals | Restore fade-in-up, but as **progressive enhancement** — content visible by default, hidden only when JS is present. |

Reference for the old design: `git show a28c22f:styles.css` and `git show a28c22f:index.html`.

## Constraints (do not break these)

- No framework, no package manager, no build step. Static files only.
- **First-party assets only.** No CDN `<link>`/`<script>`, no web fonts fetched at runtime.
- **No native browser controls** (global rule). The old `<select id="languageSelect">` language
  switcher must **not** come back — keep the `EN`/`SK` pill link (`.language-link`).
- **No form processor.** The old Web3Forms `<form>` must **not** come back. Contact stays
  `mailto:info@developed.sk`.
- JavaScript must not be required for primary content, language isolation, contact or legal notices.
- Do not touch any `<script type="application/ld+json">` block, `<head>` metadata,
  `robots.txt`, `sitemap.xml`, `vercel.json`, `.well-known/`, or `docs/`.
- Keep section `id`s exactly as they are (`#sluzby`, `#projekty`, `#openclaw`, `#kontakt` /
  `#services`, `#projects`, `#openclaw`, `#contact`) — JSON-LD and footer anchors point at them.
- Keep the `data-navbar`, `data-menu`, `data-menu-toggle` hooks and the `.brand`,
  `.language-link`, `.skip-link`, `.nav-link` class names — the 8 legal pages and `script.js`
  depend on them.
- Legal pages keep their `noindex,nofollow` and draft warning.

## Files to change

| File | Change |
|---|---|
| `styles.css` | Full rewrite: old design system as the base + generalised card/icon rules + `.legal-*` block re-tokenised. |
| `index.html` | Body markup restructured to old components; add inline SVG sprite + 1-line `js`-class script. `<head>` metadata and JSON-LD untouched. |
| `en/index.html` | Same restructure with the English copy already in the file. |
| `script.js` | Add the scroll-reveal `IntersectionObserver` + reduced-motion / no-IO fallbacks. Existing menu/navbar/active-link logic untouched. |
| `CLAUDE.md` | Two lines documenting the icon-sprite convention and the design tokens. |
| 8 legal `index.html` files | **No change** — they inherit the restored tokens. |

---

## Step 1 — `styles.css`

Start from the old stylesheet and layer the necessary additions on top:

```bash
git show a28c22f:styles.css > styles.css
```

Then apply the edits below. Everything else in that file stays verbatim (tokens, `.btn` shine
sweep, `.navbar`, `.hero`, `.tech-stack`, `.section-header`, `.about`, `.feature-list`,
`.projects-grid`, `.project-card`, `.tech-tag`, `.contact-*`, `.footer-*`, `.openclaw-*`,
`.pricing-*`, `.howto-*`, `.faq-*`, `@keyframes fadeInUp`, all `@media` blocks, utilities).

### 1a. Delete the dead rules

Remove `.language-switcher`, `.language-select`, `.language-select:hover`,
`.language-select:focus` (native select is banned) and `.hamburger*` (replaced by
`.menu-toggle`, below). Also remove the fragile cascade:

```css
/* DELETE these — replaced in 1e */
.animate-in * { animation: fadeInUp 0.6s ease forwards; }
.animate-in *:nth-child(1) { animation-delay: 0.1s; }
.animate-in *:nth-child(2) { animation-delay: 0.2s; }
.animate-in *:nth-child(3) { animation-delay: 0.3s; }
.animate-in *:nth-child(4) { animation-delay: 0.4s; }
```

Also change `.project-card` and `.hero-content` / `.hero-visual`: **drop their
`opacity: 0; transform: translateY(30px)`** initial state (see 1e — the hidden state is now
gated behind `.js`). `.hero-content` / `.hero-visual` keep their `animation: fadeInUp …`
(CSS-only, ends visible, no JS needed). `.tech-item` keeps its load animation too.

### 1b. Brand, skip link, language pill, menu toggle

The current markup uses `.brand` (not `.nav-logo h2`) and needs the three components the old
stylesheet never had. Append to the Navigation block:

```css
/* Brand — visual equivalent of the old .nav-logo h2 */
.brand {
    color: var(--text-primary);
    font-size: var(--font-size-2xl);
    font-weight: 700;
    line-height: 1.2;
    text-decoration: none;
    transition: opacity var(--transition-fast);
}

.brand:hover { opacity: 0.8; color: var(--text-primary); }
.brand span, .accent { color: var(--primary-color); }

/* Skip link */
.skip-link {
    position: fixed;
    z-index: 1100;
    top: 0.75rem;
    left: 0.75rem;
    padding: 0.7rem 1rem;
    transform: translateY(-200%);
    border-radius: var(--border-radius-sm);
    background: var(--accent-color);
    color: var(--text-inverse);
    font-weight: 600;
    text-decoration: none;
}

.skip-link:focus { transform: translateY(0); }

/* Language pill — replaces the old native <select> */
.language-link {
    display: inline-grid;
    width: 2.6rem;
    min-height: 2.6rem;
    place-items: center;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-decoration: none;
    transition: all var(--transition-fast);
}

.language-link:hover {
    border-color: var(--primary-color);
    color: var(--text-primary);
}

/* Accessible hamburger — same look as the old .hamburger, keeps the current button markup */
.menu-toggle {
    display: none;
    flex-direction: column;
    padding: 0.5rem;
    border: 0;
    background: none;
    color: var(--text-primary);
    cursor: pointer;
}

.menu-toggle span {
    display: block;
    width: 25px;
    height: 3px;
    margin: 3px 0;
    background: currentColor;
    transition: all var(--transition-normal);
}

.menu-toggle[aria-expanded="true"] span:nth-child(1) { transform: rotate(-45deg) translate(-5px, 6px); }
.menu-toggle[aria-expanded="true"] span:nth-child(2) { opacity: 0; }
.menu-toggle[aria-expanded="true"] span:nth-child(3) { transform: rotate(45deg) translate(-5px, -6px); }

body.menu-open { overflow: hidden; }

:focus-visible {
    outline: 3px solid var(--accent-color);
    outline-offset: 3px;
}
```

In the `@media (max-width: 768px)` block, replace `.hamburger { display: flex; }` with
`.menu-toggle { display: flex; }`, and change the mobile panel selector from `.nav-menu.active`
to `.nav-menu.open` (the class `script.js` toggles) — same old slide-in-from-left styling:

```css
@media (max-width: 768px) {
    .nav-menu { /* unchanged old rules: fixed, top 80px, left -100%, full height, blur */ }
    .nav-menu.open { left: 0; }
    .menu-toggle { display: flex; }
}
```

### 1c. Inline SVG icons (replacing Font Awesome)

The old rules target `i` elements. Add `.icon` alongside every one of them so the SVGs inherit
the same sizing/colour:

```css
.icon {
    width: 1em;
    height: 1em;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.tech-item .icon        { width: 2rem;   height: 2rem;   color: var(--primary-color); margin-bottom: 0.5rem; }
.feature-card .icon     { width: 2.5rem; height: 2.5rem; color: var(--primary-color); margin: 0 auto 1rem; }
.feature-list .icon     { width: 1.25rem; height: 1.25rem; color: var(--secondary-color); margin-right: 1rem; }
.contact-item .icon     { width: 1.25rem; height: 1.25rem; color: var(--primary-color); margin-right: 1rem; }
.social-link .icon      { width: 1.4rem; height: 1.4rem; }
.trust-list .icon       { width: 1.1rem; height: 1.1rem; color: var(--secondary-color); margin-right: 0.5rem; }
```

### 1d. Generalise the card rules + the small new pieces

The old `.feature-card` styling was scoped under `.openclaw-features`. The Služby/Services
section reuses it, so unscope it — change every `.openclaw-features .feature-card…` selector to
`.feature-card…`, and add a shared grid class:

```css
/* was: .openclaw-features { … } — keep the class on the openclaw grid, add the alias */
.feature-cards,
.openclaw-features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin-bottom: 4rem;
}

/* Hero eyebrow / kicker — used by hero + every section header */
.eyebrow {
    margin-bottom: 0.75rem;
    color: var(--primary-color);
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

/* Hero trust points */
.trust-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    margin: 2rem 0 0;
    padding: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    list-style: none;
}

.trust-list li { display: flex; align-items: center; }

/* mailto panel — reuses the old .contact-form card look */
.contact-cta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: var(--bg-card);
    padding: 2rem;
    border-radius: var(--border-radius);
    border: 1px solid var(--border-color);
}

.contact-cta .contact-email {
    color: var(--primary-color);
    font-size: var(--font-size-2xl);
    font-weight: 700;
    word-break: break-word;
}

.contact-cta .btn { width: 100%; margin: 1.5rem 0 1rem; }

.privacy-note { color: var(--text-muted); font-size: var(--font-size-sm); }

/* Footer link lists (old CSS coloured bare <li>; ours are real links) */
.footer-section ul li a { color: inherit; text-decoration: none; }
.footer-section ul li a:hover { color: var(--primary-color); }

.footer-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    text-align: left;
}

@media (max-width: 768px) {
    .footer-bottom { flex-direction: column; text-align: center; }
    .contact-cta { padding: 1.5rem; }
}
```

Also update the `@media print` block: replace `.language-switcher` with
`.menu-toggle, .language-link, .skip-link`.

### 1e. Scroll reveal, gated behind `.js`

Append after the `.animate-in` rule:

```css
/* Progressive enhancement: visible by default; hidden only when JS is running. */
.js .hero-content,
.js .hero-visual { animation: none; }

.js .reveal-target:not(.animate-in) {
    opacity: 0;
    transform: translateY(30px);
}

.reveal-target {
    transition: opacity var(--transition-slow), transform var(--transition-slow);
}

.animate-in {
    opacity: 1;
    transform: none;
}

/* modest stagger inside a grid */
.reveal-target:nth-child(2) { transition-delay: 0.08s; }
.reveal-target:nth-child(3) { transition-delay: 0.16s; }
.reveal-target:nth-child(4) { transition-delay: 0.24s; }
```

`script.js` adds `.reveal-target` itself (Step 3) — no markup changes needed for it.

### 1f. Re-tokenise the legal-page block

Keep the whole `/* Legal and policy pages */` section from the **current** `styles.css`
(`.legal-main`, `.legal-shell`, `.legal-nav`, `.legal-content`, `.legal-meta`, `.legal-warning`,
`.identity-list`, `.placeholder`, `.legal-table-wrap`, `.legal-table`, `.policy-summary`) and its
`@media (max-width: 760px)` / `@media print` counterparts, appending it to the reverted file with
the variables swapped to the old token names:

| new token | old token |
|---|---|
| `var(--line)` | `var(--border-color)` |
| `var(--surface)` / `var(--surface-strong)` | `var(--bg-secondary)` / `var(--bg-card)` |
| `var(--text)` | `var(--text-primary)` |
| `var(--muted)` | `var(--text-secondary)` |
| `var(--subtle)` | `var(--text-muted)` |
| `var(--accent)` / `var(--accent-strong)` | `var(--primary-color)` / `var(--primary-light)` |
| `var(--warning)` / `var(--warning-bg)` | `var(--accent-color)` / `#2d240b` |
| `var(--radius)` | `var(--border-radius)` |

The legal pages' breakpoint must match the reverted nav breakpoint — use `768px`, not `760px`.
`.legal-main` top padding: `8.5rem 0 5rem` still clears the 80px navbar.

Finally, drop the current `details`/`summary` rules — the FAQ becomes static cards (Step 2, §4).

---

## Step 2 — `index.html` (and `en/index.html` mirrored)

`<head>` stays exactly as it is, with **two** additions right before `</head>`:

```html
    <script>document.documentElement.classList.add("js");</script>
```

(Inline and blocking so there is no flash-then-hide before `script.js` runs. First-party, no request.)

Immediately after `<body>`, add the icon sprite (same block in both pages; `hidden` +
`aria-hidden` keeps it out of layout and a11y tree):

```html
    <svg xmlns="http://www.w3.org/2000/svg" hidden aria-hidden="true">
        <symbol id="i-code" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></symbol>
        <symbol id="i-layers" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></symbol>
        <symbol id="i-database" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></symbol>
        <symbol id="i-robot" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/><path d="M2 13v3M22 13v3"/></symbol>
        <symbol id="i-window" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 6.5h.01M10 6.5h.01"/></symbol>
        <symbol id="i-plug" viewBox="0 0 24 24"><path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0V8Z"/><path d="M12 17v5"/></symbol>
        <symbol id="i-cloud" viewBox="0 0 24 24"><path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.3 11.2A3.9 3.9 0 0 0 7 19h10.5Z"/></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><polyline points="9 12 11.5 14.5 16 10"/></symbol>
        <symbol id="i-file" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h5"/></symbol>
        <symbol id="i-puzzle" viewBox="0 0 24 24"><path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v18h-3v-3a2 2 0 1 0-4 0v3h-4v-4H3v-4h3a2 2 0 1 0 0-4H3V6h7Z"/></symbol>
        <symbol id="i-lifebuoy" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><polyline points="4 12.5 9.5 18 20 6.5"/></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="3 6.5 12 13 21 6.5"/></symbol>
        <symbol id="i-phone" viewBox="0 0 24 24"><path d="M6 2h3l2 5-2.5 1.5a12 12 0 0 0 5 5L15 11l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4 6.2A2 2 0 0 1 6 2Z"/></symbol>
        <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></symbol>
        <symbol id="i-linkedin" viewBox="0 0 24 24"><path d="M4.5 9v10M4.5 5.2v.01"/><path d="M10 19v-6a3 3 0 0 1 6 0v6"/><path d="M10 9v10"/></symbol>
    </svg>
```

Usage everywhere: `<svg class="icon" aria-hidden="true"><use href="#i-code"/></svg>`.

### Header — keep as-is

`.skip-link`, `.navbar[data-navbar]`, `.brand`, `.menu-toggle[data-menu-toggle]`,
`.nav-menu[data-menu]`, `.nav-link`s and `.language-link` all stay byte-for-byte. Only their CSS
changed. **Do not** reintroduce `.nav-logo` / `.hamburger` / the language `<select>`.

### 1. Hero — old two-column layout

```html
<section id="home" class="hero">
    <div class="container">
        <div class="hero-content">
            <p class="eyebrow">Vývoj softvéru pre firmy · Košice a celé Slovensko</p>
            <h1 class="hero-title">Aplikácie na mieru, ktoré riešia reálnu prácu</h1>
            <p class="hero-description">Navrhneme, vyvinieme a nasadíme webovú aplikáciu, interný systém alebo AI automatizáciu podľa vašich procesov. Rozsah, účty, dodávatelia a dátové toky sú zdokumentované pred spustením.</p>
            <div class="hero-buttons">
                <a href="#kontakt" class="btn btn-primary">Prediskutovať projekt</a>
                <a href="#projekty" class="btn btn-secondary">Pozrieť projekty</a>
            </div>
            <ul class="trust-list" aria-label="Základné princípy spolupráce">
                <li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>B2B spolupráca</li>
                <li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>Transparentný rozsah</li>
                <li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>Kontrola nad účtami a kódom</li>
            </ul>
        </div>
        <div class="hero-visual">
            <div class="tech-stack">
                <div class="tech-item"><svg class="icon" aria-hidden="true"><use href="#i-code"/></svg><span>TypeScript</span></div>
                <div class="tech-item"><svg class="icon" aria-hidden="true"><use href="#i-layers"/></svg><span>Next.js / NestJS</span></div>
                <div class="tech-item"><svg class="icon" aria-hidden="true"><use href="#i-database"/></svg><span>Supabase</span></div>
                <div class="tech-item"><svg class="icon" aria-hidden="true"><use href="#i-robot"/></svg><span>AI integrácie</span></div>
            </div>
        </div>
    </div>
</section>
```

Note: `.hero-grid` and `.tech-panel` / `.tech-mark` are gone; `.hero .container` is the old
`1fr 1fr` grid again.

### 2. Služby / Services — old `.about` shell, icon cards + `.feature-list`

Section tag becomes `<section class="about" id="sluzby">`. `.section-heading` → old
`.section-header` (h2 + one `<p>` sub-line); the eyebrow stays above the `h2`. The three
`.service-card`s become `.feature-card`s with an icon instead of the `01/02/03` index
(`.card-index` is dropped), and the three `.principles` items become old `.feature-list` rows:

```html
<section id="sluzby" class="about">
    <div class="container">
        <div class="section-header">
            <p class="eyebrow">Služby</p>
            <h2>Od prvého návrhu po stabilnú prevádzku</h2>
            <p>Každý projekt začína analýzou problému, používateľov, integrácií a rizík. Výsledkom je konkrétna ponuka, nie univerzálny balík.</p>
        </div>
        <div class="feature-cards">
            <div class="feature-card">
                <svg class="icon" aria-hidden="true"><use href="#i-window"/></svg>
                <h3>Webové aplikácie na mieru</h3>
                <p>Klientske portály, interné systémy, evidencie, dashboardy a workflow navrhnuté podľa vašich rolí a procesov.</p>
            </div>
            <!-- 02 → #i-plug "Integrácie a automatizácia"; 03 → #i-cloud "Nasadenie a údržba" -->
        </div>
        <ul class="feature-list">
            <li>
                <svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>
                <span><strong>Vy vlastníte rozhodnutia</strong> — Účty, licencie a prístupy sa nastavujú transparentne.</span>
            </li>
            <!-- + "Rozsah je písomný", "Riziká pomenúvame" — same copy as today -->
        </ul>
    </div>
</section>
```

### 3. Projekty / Projects — the card the user asked for

`.project-grid` → `.projects-grid`; each `<a class="project-card">` becomes the old
`a.project-card-link > .project-card` with the **Visit button block on top**, centred `h3`,
description, and the `project-stack` string split into `.tech-tag` pills. `.project-type` and
`.project-link` are dropped.

```html
<div class="projects-grid">
    <a href="https://promileclub.sk/" target="_blank" rel="noopener noreferrer" class="project-card-link">
        <div class="project-card">
            <div class="project-button"><span class="btn btn-primary">Navštíviť</span></div>
            <div class="project-content">
                <h3>Promile Club</h3>
                <p>Predajná platforma s platbami, účtami, notifikáciami a administračnými nástrojmi.</p>
                <div class="project-tech">
                    <span class="tech-tag">Stripe</span>
                    <span class="tech-tag">Angular</span>
                    <span class="tech-tag">Supabase</span>
                </div>
            </div>
        </div>
    </a>
    <!-- repeat for the other five, same order and links as today: -->
    <!-- Filament Check   → Python · FastAPI · Chart.js -->
    <!-- My Clinic Portal → Angular · Supabase · TypeScript -->
    <!-- KešTrek          → NestJS · Supabase · Angular -->
    <!-- Otazkomat        → React · Express · Supabase -->
    <!-- Vocabulum        → Next.js · Prisma · AI API -->
</div>
```

Button label: `Navštíviť` (SK) / `Visit` (EN) — same word the old design used.
Wrap the section in `<section id="projekty" class="projects">` with a `.section-header`.

### 4. OpenClaw — old sub-block layout

`<section id="openclaw" class="openclaw">` with `.section-header`, then in this order:

- `.openclaw-content > .openclaw-intro > p` — the current section-heading lead paragraph.
- `.openclaw-features` — the 4 `<article>`s become `.feature-card`s with icons:
  Kontrola účtov `#i-shield`, Zdokumentované dáta `#i-file`, Rozšíriteľné workflow `#i-puzzle`,
  Podpora podľa dohody `#i-lifebuoy`.
- `.openclaw-howto` — keep the `<ol>` for semantics, restyled as the old step cards:

```html
<div class="openclaw-howto">
    <h3>Ako prebieha nasadenie</h3>
    <ol class="howto-steps">
        <li class="howto-step">
            <div class="step-number">1</div>
            <div class="step-content"><h4>Úvodná analýza</h4><p>Účel, používatelia, dáta, integrácie a obmedzenia.</p></div>
        </li>
        <!-- 2 Návrh konfigurácie, 3 Implementácia a test, 4 Odovzdanie -->
    </ol>
</div>
```

Add to CSS so the `<ol>` behaves like the old div grid: `.howto-steps { list-style: none; padding: 0; }`.

- `.openclaw-faq > h3 + .faq-list > .faq-item` — convert each `<details>` into
  `<div class="faq-item"><h4>question</h4><p>answer</p></div>`. Same four Q&As, verbatim.
  (Also better for SEO/GEO: answers are no longer collapsed.)
- `.openclaw-pricing > h3`, then the legally required disclaimer as
  `<p class="pricing-note">…</p>` **above** `.pricing-cards`, then three `.pricing-card`s in the
  old shape — keeping the "od …" wording and the featured badge:

```html
<div class="pricing-card featured">
    <div class="pricing-badge">Najčastejšia voľba</div>
    <div class="pricing-header">
        <h4>Štandard</h4>
        <div class="price">od 790 €</div>
        <span class="price-note">jednorazovo</span>
    </div>
    <ul class="pricing-features">
        <li>Rozsah Základného</li><li>Konfigurácia správania</li>
        <li>6 zvolených schopností</li><li>90 dní podpory</li>
    </ul>
</div>
```

- `.openclaw-cta` — restore the old closing CTA, reusing wording already on the page (no new
  claims): `<a href="#kontakt" class="btn btn-primary btn-large">Prediskutovať projekt</a>`
  (EN: `Discuss a project`).

### 5. Kontakt / Contact — old two-column, mailto instead of a form

```html
<section id="kontakt" class="contact">
    <div class="container">
        <div class="section-header">
            <p class="eyebrow">Kontakt</p>
            <h2>Začnime stručným opisom problému</h2>
            <p>Napíšte, čo dnes riešite, kto bude systém používať a aký výsledok očakávate. E-mail slúži na B2B dopyt; nie je objednávkou ani uzatvorením zmluvy.</p>
        </div>
        <div class="contact-content">
            <div class="contact-info">
                <h3>Kontaktné údaje</h3>
                <div class="contact-item"><svg class="icon" aria-hidden="true"><use href="#i-user"/></svg><span>Erik Demko, DiS.</span></div>
                <div class="contact-item"><svg class="icon" aria-hidden="true"><use href="#i-mail"/></svg><a href="mailto:info@developed.sk">info@developed.sk</a></div>
                <div class="contact-item"><svg class="icon" aria-hidden="true"><use href="#i-phone"/></svg><a href="tel:+421911327715">+421 911 327 715</a></div>
                <div class="contact-item"><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg><span>Košice · Slovensko · vzdialená spolupráca</span></div>
                <div class="social-links">
                    <a href="https://www.linkedin.com/in/erik-demko-6563491aa/" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="LinkedIn profil">
                        <svg class="icon" aria-hidden="true"><use href="#i-linkedin"/></svg>
                    </a>
                </div>
            </div>
            <div class="contact-cta">
                <p class="contact-name">Napíšte nám</p>
                <a class="contact-email" href="mailto:info@developed.sk">info@developed.sk</a>
                <a class="btn btn-primary" href="mailto:info@developed.sk?subject=B2B%20dopyt%20z%20developed.sk">Napísať e-mail</a>
                <p class="privacy-note">E-mailovú adresu a obsah korešpondencie spracujeme v Zoho Mail na vybavenie dopytu podľa <a href="/ochrana-osobnych-udajov/">informácií o súkromí</a>. Bežným e-mailom neposielajte heslá, prístupové kľúče ani citlivé údaje.</p>
            </div>
        </div>
    </div>
</section>
```

`.contact-name` needs a small rule (`font-weight: 600; margin-bottom: 0.5rem;`). Only one
`.social-link` (LinkedIn) — the old dead `#` GitHub/Twitter links do **not** come back.

### 6. Footer — old three-column list layout

```html
<footer class="footer">
    <div class="container">
        <div class="footer-content">
            <div class="footer-section">
                <h3><a class="brand" href="#home">Develop<span>ED</span></a></h3>
                <p>Webové aplikácie, interné systémy a AI automatizácie pre firmy.</p>
            </div>
            <div class="footer-section">
                <h4>Služby</h4>
                <ul>
                    <li><a href="#sluzby">Vývoj aplikácií</a></li>
                    <li><a href="#openclaw">AI automatizácia</a></li>
                    <li><a href="#projekty">Projekty</a></li>
                </ul>
            </div>
            <div class="footer-section">
                <h4>Právne informácie</h4>
                <ul>
                    <li><a href="/pravne-informacie/">Poskytovateľ</a></li>
                    <li><a href="/ochrana-osobnych-udajov/">Ochrana osobných údajov</a></li>
                    <li><a href="/cookies/">Cookies a úložiská</a></li>
                    <li><a href="/podmienky-pouzivania/">B2B podmienky webu</a></li>
                </ul>
            </div>
        </div>
        <div class="footer-bottom">
            <p>© 2026 DevelopED · obchodná značka Healthcare Data Solutions s. r. o., IČO 56400896.</p>
            <a href="/en/" lang="en" hreflang="en">English version</a>
        </div>
    </div>
</footer>
```

All four legal links and the language link must survive — they are legal/SEO requirements.

### `en/index.html`

Identical structure, identical `id`s (`#services`, `#projects`, `#openclaw`, `#contact`), the
English copy already in the file, `Visit` / `Discuss a project` / `Contact details` /
`Write an email` labels, `/en/…` legal links, and `<a href="/" lang="sk" hreflang="sk">Slovenská
verzia</a>` in `.footer-bottom`. Its `<head>` and JSON-LD stay untouched.

---

## Step 3 — `script.js`

Keep the whole existing file (menu open/close, aria labels, outside-click, Escape, resize,
navbar `scrolled`, `IntersectionObserver` active-link). Append inside the same
`DOMContentLoaded` callback:

```js
    // Scroll reveal — progressive enhancement only (CSS hides these solely under .js)
    const revealSelectors = [
        ".hero-content", ".hero-visual", ".feature-card", ".feature-list li",
        ".project-card-link", ".howto-step", ".pricing-card", ".faq-item",
        ".contact-info", ".contact-cta"
    ].join(", ");
    const revealTargets = Array.from(document.querySelectorAll(revealSelectors));
    revealTargets.forEach((element) => element.classList.add("reveal-target"));

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
        revealTargets.forEach((element) => element.classList.add("animate-in"));
    } else {
        const revealObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("animate-in");
                    revealObserver.unobserve(entry.target);
                });
            },
            { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
        );
        revealTargets.forEach((element) => revealObserver.observe(element));
    }
```

Do **not** restore the old `initSmoothScrolling`, `showNotification`, `initContactForm`,
`initLanguageSwitcher` or the project-card click handler — CSS `scroll-behavior: smooth` covers
scrolling, and the rest depended on Web3Forms / `translations.js`.

Watch for: anything above the fold must still be reachable. `.hero-content` / `.hero-visual`
get `.reveal-target` and are in view immediately, so the observer fires on the first frame.

---

## Step 4 — `CLAUDE.md`

Add under **Stack**:

```markdown
- Icons are a first-party inline `<symbol>` sprite at the top of each page `<body>`, referenced
  with `<svg class="icon"><use href="#i-name"/></svg>`. Never add a CDN icon font or web font.
- The design system lives in the `:root` custom properties of `styles.css` (indigo
  `--primary-color: #4f46e5` on `--bg-primary: #0f0f0f`). Reuse the tokens; do not introduce a
  parallel palette.
```

Under **JavaScript responsibilities**, add:

```markdown
- Optional scroll-reveal animations, gated behind the `js` class so content is visible without JS
```

---

## Verification

No build step — serve the directory and check both languages plus every legal route:

```bash
cd /Users/edemko/Dev/DevelopED/developed-web
python3 -m http.server 4321
```

1. **No third-party assets anywhere** (must print nothing):
   ```bash
   grep -rn "cdnjs\|fonts.googleapis\|fonts.gstatic\|web3forms\|translations.js" \
     --include="*.html" --include="*.css" --include="*.js" .
   ```
2. **SEO/legal untouched** — the diff must show no change inside any `ld+json` block, `<head>`,
   or the legal pages:
   ```bash
   git diff -- index.html en/index.html | grep -E '^[-+].*(ld\+json|canonical|hreflang|og:|twitter:|robots)'
   git status --short   # cookies/, en/*/, ochrana-…, podmienky-…, pravne-… must be unmodified
   ```
3. **Visual check** at `http://localhost:4321/` and `/en/`: indigo gradient buttons with the
   shine sweep on hover, `#0f0f0f`/`#1f1f1f` cards, project cards showing the **Visit** button on
   top with tech-tag pills and a −10px hover lift, icon feature cards, old pricing cards with the
   badge, static FAQ cards.
4. **Legal routes** render correctly with the restored tokens and keep their yellow draft warning:
   `/pravne-informacie/`, `/ochrana-osobnych-udajov/`, `/cookies/`, `/podmienky-pouzivania/`,
   `/en/legal-notice/`, `/en/privacy/`, `/en/cookies/`, `/en/website-terms/`.
5. **Mobile menu** at ≤768px: hamburger animates to an X, panel slides in from the left, body
   scroll locks, closes on link click / outside click / Escape / resize past 768px, and
   `aria-expanded` + `aria-label` flip. Tab order reaches the skip link first.
6. **JS off** (DevTools → Disable JavaScript, hard reload): every section, all six project
   cards, the contact details and the legal links are visible; nothing stuck at `opacity: 0`.
7. **Reduced motion** (DevTools → Rendering → *prefers-reduced-motion: reduce*): content renders
   immediately, no fade-in.
8. **Print preview** on a legal page: navbar/footer/legal-nav hidden, dark background dropped.
9. **Language isolation**: `/` has no English strings and links to `/en/`; `/en/` mirrors it —
   `grep -c 'lang="en"' index.html` should only match the hreflang/language-link lines.
