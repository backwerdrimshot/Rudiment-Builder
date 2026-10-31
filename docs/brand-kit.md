# Brand kit

Rudiment-Builder carries the shared Backwerd Rhythm Shop brand files, vendored into this repo and served from this app's own origin. Nothing is fetched from another app or a CDN at runtime.

- **Kit:** `brand` 0.1.0, from [`backwerdrimshot/brs-apps`](https://github.com/backwerdrimshot/brs-apps) `packages/brand` (merge `1df21e4`).
- **Source of the files:** `backwerd-rhythm-shop-site` at `06f649e46a449805e08f84be1e641663846bab96`, copied byte for byte.
- **Files here:** `assets/brand/design-tokens.css`, `assets/fonts/barlow-condensed-400-latin.woff2`, `assets/fonts/barlow-condensed-600-latin.woff2`, `assets/fonts/barlow-condensed-700-latin.woff2`, `assets/fonts/barlow-condensed-OFL.txt`, `assets/fonts/big-shoulders-display-800-latin.woff2`, `assets/fonts/big-shoulders-display-OFL.txt`, `brs-monogram.svg`.
- **Adopted:** the tokens file moved from the older shared version to the kit's version. The only code changes are one added variable, `--print-rule: #000000`, which this app does not use, and a spelling change in a comment ("colour" to "color"). The other brand files already matched the kit.

## Checking for drift

From a checkout of brs-apps:

```sh
node packages/brand/scripts/check-consumer.mjs <path-to-this-repo>
```

The report is read-only. Every file should read `match`. A `differs` line means the file was edited here or the kit moved on.

## Changing a brand file

Do not edit these files in this repo. Change them in `backwerd-rhythm-shop-site`, then take the new kit version and copy the files here in one change.

## Rollback

Revert the adoption commit. The previous tokens file is in git history.
