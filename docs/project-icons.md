# Portfolio project icons

The Slovak and English homepages share first-party copies in `assets/projects/`.
Images are decorative in the bottom-right corner of each card, beside the technology
tags. The footer stays in normal flow so wrapped tags cannot overlap the logo;
dimensions reserve their space
and lazy loading keeps them out of the initial viewport's critical requests.

- Mega Music: dedicated square white M / red equalizer mark, generated with the
  built-in imagegen tool from the original logo at the user's request. No script
  lettering. Master: `mega-media-player/assets/branding/mega-music-square.png`.
  Lossless 96/144/192px WebP exports provide 2x/3x/4x display density at 48px.
  The original wide logo is retained for larger placements. See the master’s
  companion `mega-music-square.md` for the generation brief.
- ScreenTime: SVG transcription of the existing Android launcher vector and its
  `#1E3A5F` background (`screentime/android/app/src/main/res/`). No web favicon exists.
- Promile Club: `promileclub/public/assets/favicon.png`.
- My Clinic Portal: `my-clinic/frontend/public/icon.svg`.
- KešTrek: `kestrek/frontend/src/favicon.svg`.
- Otazkomat: `otazkomat/frontend/public/favicon.svg`.
- Vocabulum: `vocabulary-builder/public/favicon.svg`.
- Odonto AI: SVG transcription of the tooth/sparkle mark in
  `odonto-ai/frontend/src/components/Logo.tsx`, for the staged account picker.
- Airsoft: an A monogram fallback in the marketplace's olive/orange palette,
  for the staged picker. The app currently uses a text badge and has no dedicated
  brand icon; its framework favicon is not used as product branding.
- Filament Check: the project homepage has no favicon. Its existing logo was copied
  from https://www.filamentree.eu/nest_filamentree_theme/static/src/img/filamentree-full-logo.svg
  on 2026-09-15. It is hosted locally rather than loaded from that service at runtime.

The two new project cards describe currently implemented capabilities. The Mac
release is identified as a preview, and no iOS download or ScreenTime app blocking
is advertised.
