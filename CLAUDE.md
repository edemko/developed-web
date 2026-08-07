# DevelopED website

Landing page for B2B custom web applications, internal systems and AI automation.

## Stack

- HTML5, CSS3 and vanilla JavaScript
- No framework, package manager or build step
- Static hosting on Vercel
- System font stack and first-party assets only
- Icons come from a first-party inline `<symbol>` sprite at the top of each page `<body>`, used as `<svg class="icon"><use href="#i-name"/></svg>`. Never add a CDN icon font or a runtime-fetched web font.
- The design system lives in the `:root` custom properties of `styles.css` (indigo `--primary-color: #4f46e5` on `--bg-primary: #0f0f0f`). Reuse those tokens; do not introduce a parallel palette.

## Language architecture

- Slovak homepage: `/`
- English homepage: `/en/`
- Do not reintroduce runtime translation or language-preference storage.
- Add matching copy directly to both HTML pages and maintain reciprocal canonical/hreflang metadata.

## Contact and privacy

- The only enquiry mechanism is `mailto:info@developed.sk`.
- Do not add a third-party form processor.
- The current design uses no analytics, advertising, cookies, local storage or session storage.
- If tracking or embedded content is proposed, update the privacy/storage assessment before implementation and block consent-dependent technology until valid consent.

## Legal publication gate

All eight legal routes are implementation-ready drafts but remain `noindex,nofollow` while mandatory business identity, retention and processor details are placeholders. Never remove the warning or publish those pages as final until the checklist in `README.md` is complete and Slovak counsel has reviewed the copy.

## JavaScript responsibilities

- Accessible mobile-menu state and labels
- Closing the menu on navigation, outside click, Escape and desktop resize
- Navbar scroll state
- Active section indication through `IntersectionObserver`
- Optional scroll-reveal animations, gated behind the `js` class so all content stays visible without JavaScript

JavaScript must not be required for primary content, language isolation, contact access or legal notices.
