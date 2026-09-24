import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStamp, capabilities } from "./capabilities.mjs";

const Core = createRequire(import.meta.url)("./js/rudiment-core.js");

/* The drawn notation cards shown beside the sticking, one per rudiment. They
   are named by the same function the page uses to ask for them, so the build
   cannot ship a set the page does not request, and a card that is missing
   fails the existence check below instead of breaking a page. Only the
   drawings and the Bravura licence their outlines are under ship: the glyph
   library, the vendoring README and the composer's manifest stay source
   material, which is what all of assets/notation used to be. */
export const NOTATION_ASSETS = [
  "assets/notation/LICENSE-bravura.txt",
  ...Core.RUDIMENTS.map(Core.notationCard),
];

/* The recorded marching snare: MuseScore Drumline's solo-snare takes (CC0),
   packed as PCM inside a classic script by tools/pack-marching-snare.py so a
   page opened from disk can load it too. The page loads it only when Marching
   is the chosen sound. The waiver and credit ship beside it; the packer does
   not ship. */
export const AUDIO_ASSETS = [
  "assets/audio/marching-snare.js",
  "assets/audio/LICENSE-marching-snare.txt",
];

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
  ...NOTATION_ASSETS,
  ...AUDIO_ASSETS,
];

/* Whole directories, copied recursively. The brand token file and the font
   files have to be served, not just present in the repo: the token file so the
   served copy matches the site's byte for byte, and the fonts because the
   stylesheet names them and nothing else supplies them — before this pass they
   were named and never shipped, so every visitor got a fallback face. The OFL
   licence texts travel with the fonts, which is why this ships the directory
   rather than four named files. assets/notation is not a directory entry: only
   part of it ships, through NOTATION_ASSETS above. */
export const SITE_DIRECTORIES = ["assets/brand", "assets/fonts"];

/* Written by the build rather than copied from the tree, so it is in neither
   list above — but it IS published, and the allowlist test would rightly refuse
   an unnamed file in dist. Declared here so the boundary stays exhaustive: the
   history in this file is a deploy that served the whole repository root, and
   the fix for that only holds while everything published is named somewhere. */
export const GENERATED_ASSETS = ["capabilities.json", "sw.js"];

/* What the offline service worker stores: every file a visit can ask for.
   The page is stored as "./" — the hostname serves it there, and /index.html
   only redirects to it — and the rest by path. Left out: text a visitor never
   loads (licences, robots.txt, the sitemap), capabilities.json, which is for
   the shop site's audit and must always be fetched fresh, and the worker
   itself. Derived from what the build actually wrote, so a file added to the
   allowlist is stored offline without anyone remembering to list it twice. */
export function precacheList(shipped) {
  return shipped
    .filter((file) => !/\.(txt|xml)$/.test(file) && file !== "capabilities.json" && file !== "sw.js")
    .map((file) => (file === "index.html" ? "./" : file))
    .sort();
}

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

/* The offline service worker: sw.js with its manifest block filled in. The
   build number is what makes each deploy a new worker (and a new cache), and
   the list is every file this build wrote that a visit can ask for. */
function filesIn(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesIn(path.join(dir, entry.name), name) : [name];
  });
}
const precache = precacheList(filesIn(output));
const workerSource = fs.readFileSync(path.join(here, "sw.js"), "utf8");
const manifestBlock = /\/\/ BUILD MANIFEST[^\n]*\n[\s\S]*?\/\/ END BUILD MANIFEST\n/g;
if ((workerSource.match(manifestBlock) || []).length !== 1) {
  throw new Error("sw.js must carry exactly one BUILD MANIFEST block for the build to fill in");
}
fs.writeFileSync(
  path.join(output, "sw.js"),
  workerSource.replace(manifestBlock,
    "// BUILD MANIFEST — written by build.mjs; do not edit in dist.\n" +
    `var BUILD = ${JSON.stringify(stamp)};\n` +
    `var ASSETS = ${JSON.stringify(precache, null, 2)};\n` +
    "// END BUILD MANIFEST\n"),
);

console.log(
  `Built ${SITE_ASSETS.length} site assets, ${SITE_DIRECTORIES.length} asset directories, ` +
    `capabilities.json and sw.js (${precache.length} files offline) for build ${stamp} in dist.`,
);
