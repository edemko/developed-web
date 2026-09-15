# Portfolio project icons

The Slovak and English homepages share first-party copies in `assets/projects/`.
Images are decorative in the bottom-right corner of each card, beside the technology
tags. The footer stays in normal flow so wrapped tags cannot overlap the logo;
dimensions reserve their space
and lazy loading keeps them out of the initial viewport's critical requests.

- Mega Music: 96/144/192px lossless WebP exports made directly from
  `mega-media-player/assets/branding/mega-logo-hd.png` (commit `4da2587`).
  The 48px card logo uses 2x/3x/4x density variants for sharper high-density display.
  Complete artwork is centered on black without cropping. Decoded WebP pixels
  match each resized export exactly; content-hashed URLs refresh existing caches.
- ScreenTime: SVG transcription of the existing Android launcher vector and its
  `#1E3A5F` background (`screentime/android/app/src/main/res/`). No web favicon exists.
- Promile Club: `promileclub/public/assets/favicon.png`.
- My Clinic Portal: `my-clinic/frontend/public/icon.svg`.
- KešTrek: `kestrek/frontend/src/favicon.svg`.
- Otazkomat: `otazkomat/frontend/public/favicon.svg`.
- Vocabulum: `vocabulary-builder/public/favicon.svg`.
- Filament Check: the project homepage has no favicon. Its existing logo was copied
  from https://www.filamentree.eu/nest_filamentree_theme/static/src/img/filamentree-full-logo.svg
  on 2026-09-15. It is hosted locally rather than loaded from that service at runtime.

The two new project cards describe currently implemented capabilities. The Mac
release is identified as a preview, and no iOS download or ScreenTime app blocking
is advertised.
