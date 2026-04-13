# DevelopED Website

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
| Projects | `#projects` | My Clinic Portal, Filament Check, KešTrek (coming soon) |
| Contact | `#contact` | Form (simulated submit), contact info, social links |

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
- Contact form submission is currently simulated (no backend)
