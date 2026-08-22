import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* An explicit allowlist, copied into dist/, and the reason is not tidiness.
   This site used to publish through GitHub Pages with `path: '.'` — the whole
   repository root — so CLAUDE.md, REVIEW.md, README.md and serve.ps1 were all
   served at 200 on the public domain, with robots.txt saying Allow: /. Anything
   this list does not name does not ship. Adding a file to the repo no longer
   publishes it by accident. */
export const SITE_ASSETS = [
  "index.html",
  "js/rudiment-app.js",
  "js/rudiment-core.js",
  "js/rudiment-data.js",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, "dist");

fs.rmSync(output, { recursive: true, force: true });
for (const asset of SITE_ASSETS) {
  const from = path.join(here, asset);
  if (!fs.existsSync(from)) throw new Error(`SITE_ASSETS names ${asset}, which does not exist`);
  const to = path.join(output, asset);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

console.log(`Built ${SITE_ASSETS.length} site assets in dist.`);
