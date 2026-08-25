# Vendored: Backwerd notation assets

Copied from the Backwerd notation SVG library — canonical source:
`backwerdrimshot/praxis-platform` → `data/notation-svg/` (@ eaad852, on
branch `claude/notion-asset-library-7hlo1c` until merged). **Do not edit
these files here**; update by re-copying from the canonical directory, whose
README documents the conventions (250 font units per staff space, SMuFL
semantic origins, `currentColor` fills, y-up path data flipped with
`scale(1,-1)`) and the regeneration scripts.

Contents:

- `notation-lib.js` — 68-glyph rhythm-teaching core as a classic script
  (works over `file://`): `BackwerdNotation.svg("note-quarter-up",
  { height: 40 })` returns themed inline SVG; `BackwerdNotation.GLYPHS`
  carries raw paths and viewBoxes for custom drawing. Other subsets
  (pictograms, --all) regenerate upstream via `compose-js.mjs`.
- `LICENSE-bravura.txt` — the outlines are extracted from Bravura (the
  SMuFL reference font), © Steinberg Media Technologies GmbH, SIL OFL 1.1
  with Reserved Font Name "Bravura"; the licence travels with the outlines.
- `rudiments/` — all 40 PAS rudiment cards, rendered from THIS repo's own
  `js/rudiment-data.js` (snapshot @ eece42d held in the canonical
  directory). 19 hybrids carry `review: true` in `manifest.json` pending
  REVIEW.md's proofread; after data corrections land here, re-render
  upstream and re-copy.
