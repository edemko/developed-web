# DevelopED Website

## Account service and VPS operations

This repository also contains the central account service, not just the static
marketing site described below. Before account/auth work read
`server/accounts/README.md`; before deployment or Linux isolation work read
`server/accounts/deploy/README.md` and the scoped `AGENTS.md` there. The no-build
instructions below apply to marketing pages only. Never publish this whole
repository as a web root or copy credentials into documentation.

Landing page for DevelopED — custom business applications built with AI and modern technologies.

## Tech Stack

- **HTML5 / CSS3 / Vanilla JS** (ES6+, no frameworks, no build step)
- Font Awesome 6.4.0, Google Fonts (Inter)
- Static hosting (Vercel / Netlify / GitHub Pages)

## Project Structure

```
index.html          — single-page structure (sections: #home, #about, #projects, #contact)
styles.css          — all styling (dark theme, CSS Grid/Flexbox, mobile-first)
script.js           — navigation, animations, form validation, mobile menu
translations.js     — TranslationService class (EN/SK), localStorage persistence
```

## Dev Setup

No build process. Open `index.html` in a browser.

## Architecture

### Translation System
- `TranslationService` class in `translations.js` manages all i18n
- HTML elements use `data-translate="section.key"` attributes (e.g. `hero.title`, `nav.home`)
- Language preference stored in localStorage
- Supports EN (default) and SK

### Sections
| Section | Anchor | Notes |
|---------|--------|-------|
| Hero | `#home` | Headline, CTAs, tech stack showcase |
| About | `#about` | Mission, features, stats |
| Projects | `#projects` | My Clinic Portal, Filament Check, KešTrek, 3D PrintED, Promile Club |
| Custom solutions | `#riesenia` / `#solutions` | E-commerce, inventory, clinic software, internal systems and website pricing |
| Contact | `#contact` | Form (Web3Forms API), contact info, social links |

### JS Features
- Fixed navbar with scroll effects and active section highlighting
- Intersection Observer for scroll-in animations
- Mobile hamburger menu (closes on outside click, resize, navigation)
- Contact form validation with email regex
- Debounced scroll handlers

## Style Guide

- Dark theme: dark blue/black gradients, blue accent gradient
- Font: Inter (weights 300–700)
- Container max-width: 1200px
- Mobile-first responsive breakpoints

## Key Conventions

- No npm/yarn — pure static site
- Translations: add keys to both `en` and `sk` objects in `translations.js`
- To add a project card: add HTML in `#projects`, add translation keys, follow existing card pattern
- Contact form submits via Web3Forms API

## SMS Gate: v1 (JSON) API only

**Only the SMS Gate v1 JSON API (`https://api.smsgate.sk/json/...`) is approved for use.**
The provider has deprecated v2 (`/v2/messages`) and told us it must not be used.
Do not add, restore or "fall back to" any v2 call. The v1 manual documents optional `from`:
the Airsoft product-profile flow uses the confirmed `from=AMP` identifier, while other
SMS sends use the account default **MyClinic**. Do not use `sender`. See the Airsoft
Marketplace repo's `docs/sms-delivery-investigation.md` (2026-10-15); in this repo
the profile sender is `server/accounts/src/profile-sms.ts`.

## Project Support

- Buy Me a Coffee: https://buymeacoffee.com/mrcrow
- Use this link for optional support of the creator in selected projects where a support or donation link is needed.
