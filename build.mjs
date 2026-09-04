import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStamp, capabilities } from "./capabilities.mjs";

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

/* Whole directories, copied recursively. The brand token file and the font
   files have to be served, not just present in the repo: the token file so the
   served copy matches the site's byte for byte, and the fonts because the
   stylesheet names them and nothing else supplies them — before this pass they
   were named and never shipped, so every visitor got a fallback face. The OFL
   licence texts travel with the fonts, which is why this ships the directory
   rather than four named files. assets/notation stays out: its library is
   inlined where it is used, and the PAS rudiment cards are a source asset. */
export const SITE_DIRECTORIES = ["assets/brand", "assets/fonts"];

/* Written by the build rather than copied from the tree, so it is in neither
   list above — but it IS published, and the allowlist test would rightly refuse
   an unnamed file in dist. Declared here so the boundary stays exhaustive: the
   history in this file is a deploy that served the whole repository root, and
   the fix for that only holds while everything published is named somewhere. */
export const GENERATED_ASSETS = ["capabilities.json"];

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
for (const dir of SITE_DIRECTORIES) {
  const from = path.join(here, dir);
  if (!fs.existsSync(from)) throw new Error(`SITE_DIRECTORIES names ${dir}, which does not exist`);
  fs.cpSync(from, path.join(output, dir), { recursive: true });
}

/* The version is read out of index.html rather than typed, so it cannot
   become a third copy of the build identifier that the README and the page
   already carry between them.

   Note that dist/ is TRACKED in this repository, so unlike the siblings the
   generated file does get committed — what stops it drifting is that the build
   overwrites it from the page every run, and the test below compares the two.
   Editing dist/capabilities.json by hand would survive exactly until the next
   build. */
const stamp = buildStamp(fs.readFileSync(path.join(here, "index.html"), "utf8"));
fs.writeFileSync(
  path.join(output, "capabilities.json"),
  JSON.stringify(capabilities(stamp), null, 2) + "\n",
);

console.log(
  `Built ${SITE_ASSETS.length} site assets, ${SITE_DIRECTORIES.length} asset directories ` +
    `and capabilities.json for build ${stamp} in dist.`,
);
