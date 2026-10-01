# Mega Music web-player showcase — 1 October 2026

The SK/EN Mega Music product pages now describe the desktop-style web player 1.1:
five-band equalizer, tags/categories, virtual folders, groups of selected collections,
advanced term/tag/category search, and synchronized half-star ratings with separate
browser-local favorites. Groups combine folders into a queue; the copy does not
claim saved playlists or synchronized favorites.

Five fresh screenshots show Home, advanced search, equalizer, selected folders and
the metadata-rich queue. They were captured from the actual updated player using
synthetic browser fixtures in the sibling `mega-media-player` repository; no account,
object, rating or personal collection was modified to make these images. Captions
identify demo data. Mobile and expanded-player captures are included as extra assets.
All new JPEG filenames include their first 12 SHA-256 characters; previous screenshots
are retained. Source copy and image dimensions remain in `scripts/showcase/products.json`;
`build-pages.py` now supports the optional organization and queue screenshot sections.
Other product pages regenerate without changes.

Local browser acceptance: both pages at 1440 and 390 px, six feature cards, all five
images decoded, no horizontal overflow or JavaScript errors, and accessible image
zoom/escape behavior. The corresponding Mega Music landing page also passed its
four languages at both viewport widths. Publication status is recorded after release.
