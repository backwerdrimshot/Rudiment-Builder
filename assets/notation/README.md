# Vendored: Backwerd notation assets

Copied from the Backwerd notation SVG library — canonical source:
`backwerdrimshot/praxis-platform` → `data/notation-svg/`, now on that repo's
`main`. **Do not edit these files here**; update by re-copying from the
canonical directory, whose README documents the conventions (250 font units
per staff space, SMuFL semantic origins, `currentColor` fills, y-up path data
flipped with `scale(1,-1)`) and the regeneration scripts.

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
  `js/rudiment-data.js`; the snapshot the canonical directory holds names the
  commit it was taken from. **No card carries `review: true` any more** — the
  proofread against the official chart and PAS's per-rudiment SVGs closed
  every flag. The `manifest.json` here is the one the upstream composer wrote,
  so it also carries `altSticking`, `halved` and `devices` per card, which the
  poster generator reads; nothing in this app does, and they cost nothing to
  keep in step. Any further data correction here is re-rendered upstream and
  re-copied; editing a card in place would put the drawing and the app out of
  step with no way to tell which is right.
