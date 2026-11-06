# Single Paradiddle dossier prototype

Local implementation of the approved responsive Figma concept, based on release candidate 3415040 (enlarged notation and personal shortcuts). Not deployed.

## Scope and behavior
- Only Single Paradiddle uses the new profile template. Selecting any other rudiment restores the original practice DOM and all original controls.
- Original notation asset remains unchanged, including its aligned sticking. The separate live sticking line follows actual lead and playback.
- Existing audio scheduling, tempo modes, hand isolation, routine state and self-assessment are unchanged. No new audio or scored exercises.
- Phone: scrollable learning area and a separate transport area; tablet: practice and learning columns; desktop: practice, teaching/heritage and exercise-concept columns.
- Native details summaries are keyboard accessible. Existing enlargement dialog and Favorites remain wired to their original handlers and stable rudiment IDs.
- Additional transport actions remain in Sound and pulse controls. No print button is presented because print layout is still a concept.
- Exercise cards are explicitly practice concepts for the displayed rudiment, not launchable exercises.
- Future profiles should supply reviewed metadata and teaching content keyed by stable rudiment ID; membership is not inferred from family or numbering.

## Sources
- Figma phone: https://www.figma.com/design/GdtYHXKNmVS75K0JbaYSNi?node-id=812-9
- Tablet: node 812:242. Desktop: node 812:472.
- PAS official chart: https://pas.org/wp-content/uploads/2024/04/pas-rudiments.pdf
- NARD official list: https://www.nard.us.com/N.A.R.D._Rudiments.html
- Single Paradiddle is PAS #16 and a member of the NARD Standard 26. No Essential 13 claim.
- Exact existing source asset: assets/notation/rudiments/rudiment-16-single-paradiddle.svg. Its Bravura OFL license remains included.

## Verification
178 local Node tests pass. New tests/dossier.browser.mjs checks Chromium and WebKit at 320, 390, 759, 834, 1200, 1440 and 1920px: no page overflow, both leads, score enlargement/focus return, favorites, playback and selection restoration.
Independent review passed in both engines after correcting short-phone transport clipping, Class view overrides, reparented-control focus loss and Chromium keyboard paging. Real routine transitions, fullscreen, dark/light layout and duplicate-ID checks also passed. Browser engine viewport emulation, not physical-device testing.
