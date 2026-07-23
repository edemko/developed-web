# DevelopED website

Landing page for B2B custom web applications, internal systems and AI automation.

## Stack

- HTML5, CSS3 and vanilla JavaScript
- No framework, package manager or build step
- Static hosting on Vercel
- System font stack and first-party assets only

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

JavaScript must not be required for primary content, language isolation, contact access or legal notices.
