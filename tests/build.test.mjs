import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import vm from "node:vm";
import test from "node:test";

import { createRequire } from "node:module";
import { AUDIO_ASSETS, GENERATED_ASSETS, NOTATION_ASSETS, SITE_ASSETS, SITE_DIRECTORIES, precacheList } from "../build.mjs";

const require = createRequire(import.meta.url);
const Core = require("../js/rudiment-core.js");

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await filesBelow(new URL(`${entry.name}/`, directory), name)));
    else found.push(name);
  }
  return found;
}

/* This site published through GitHub Pages with `path: '.'`, which uploaded the
   entire repository root. CLAUDE.md, REVIEW.md, README.md and serve.ps1 were all
   served at 200 on the public domain, and robots.txt invited crawlers in with
   Allow: /. Nobody chose that; it was what `path: '.'` meant.

   The allowlist is the fix, and this is what keeps it one. A file added to the
   repo is not published unless SITE_ASSETS names it, and this test fails if the
   build ever emits something the list does not. */
test("the production build publishes only the explicit allowlist", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: root });
  const shipped = (await filesBelow(dist)).sort();
  const named = new Set([...SITE_ASSETS, ...GENERATED_ASSETS]);
  const underDirectory = (file) => SITE_DIRECTORIES.some((dir) => file.startsWith(`${dir}/`));

  /* Two ways to be allowlisted, and nothing else ships: named in SITE_ASSETS,
     or sitting under a directory SITE_DIRECTORIES names. The directories exist
     because the brand token file and the fonts have to be served, and a licence
     has to travel with its fonts — an allowlist of individual woff2 files would
     drop the OFL text the first time a face was added. */
  assert.deepEqual(
    shipped.filter((file) => !named.has(file) && !underDirectory(file)),
    [],
    "dist may only hold what SITE_ASSETS or SITE_DIRECTORIES names",
  );
  for (const asset of SITE_ASSETS) assert.ok(shipped.includes(asset), `${asset} must ship`);

  /* The named directories ship whole, and no others do. */
  assert.deepEqual(
    [...new Set(shipped.filter(underDirectory).map((file) => file.split("/").slice(0, 2).join("/")))].sort(),
    [...SITE_DIRECTORIES].sort(),
  );
});

/* assets/notation used to stay off the web entirely. Since the sticking panel
   shows each rudiment's drawn card, part of it ships: one card per rudiment and
   the Bravura licence the card outlines are under. The rest is source material
   for regenerating the cards upstream, and this keeps it that way. */
test("the notation cards ship, one per rudiment, and nothing else from assets/notation", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: root });
  const shipped = await filesBelow(dist);
  const cards = Core.RUDIMENTS.map(Core.notationCard);

  assert.equal(new Set(cards).size, 40, "forty rudiments, forty distinct cards");
  assert.deepEqual(
    shipped.filter((file) => file.startsWith("assets/notation/")).sort(),
    [...NOTATION_ASSETS].sort(),
  );
  assert.deepEqual([...NOTATION_ASSETS].sort(), ["assets/notation/LICENSE-bravura.txt", ...cards].sort());
  for (const source of ["notation-lib.js", "README.md", "rudiments/manifest.json"]) {
    assert.ok(!shipped.includes(`assets/notation/${source}`), `assets/notation/${source} must not be published`);
  }

  /* The file the page asks for must be the drawing of the rudiment it asked
     about: the card carries its own PAS number and id, and the fill has to be
     currentColor or the dark scheme gets black notation on an Ink ground. */
  for (const r of Core.RUDIMENTS) {
    const svg = await readFile(new URL(Core.notationCard(r), dist), "utf8");
    assert.match(svg, new RegExp(`data-pas="${r.pas}" data-rudiment="${r.id}"`), `${r.id} card is its own drawing`);
    assert.match(svg, /<g fill="currentColor">/, `${r.id} card is filled with currentColor`);
    assert.doesNotMatch(svg, /<script|\son[a-z]+=/i, `${r.id} card carries no script (the page inlines it)`);
  }
});

/* The Marching sound: MuseScore Drumline's solo snare, packed as PCM in a
   classic script. The page asks for it by a path of its own, so this pins that
   path to the file the build ships, and pins the shape the voice indexes into:
   two takes per hand in every set, each starting on the stick (a take that
   opened on silence would land late on every stroke) and ending in silence
   (or every stroke would end in a click). The waiver ships beside it. */
test("the marching snare ships with its credit, in the shape the voice plays", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: root });
  const shipped = await filesBelow(dist);
  assert.deepEqual(shipped.filter((file) => file.startsWith("assets/audio/")).sort(), [...AUDIO_ASSETS].sort());

  const app = await readFile(new URL("../js/rudiment-app.js", import.meta.url), "utf8");
  assert.equal(app.match(/var MARCHING_SRC = "([^"]+)";/)[1], "assets/audio/marching-snare.js");
  assert.ok(AUDIO_ASSETS.includes("assets/audio/marching-snare.js"));

  const licence = await readFile(new URL("assets/audio/LICENSE-marching-snare.txt", dist), "utf8");
  assert.match(licence, /Creative Commons 0 \(CC0\)/);
  assert.match(licence, /MuseScore Drumline/);

  const pack = require("../dist/assets/audio/marching-snare.js");
  assert.equal(pack.rate, 44100);
  assert.ok(pack.gain > 0 && pack.gain < 4, "gain restores MDL's level");
  let bytes = 0;
  for (const set of ["hit", "crush", "crushLong"]) {
    assert.equal(pack[set].length, 4, `${set}: two takes per hand`);
    for (const b64 of pack[set]) {
      const raw = Buffer.from(b64, "base64");
      bytes += raw.length;
      assert.equal(raw.length % 2, 0, `${set}: whole 16-bit samples`);
      const pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
      const peak = pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      const head = pcm.subarray(0, Math.round(pack.rate * 0.003)).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      assert.ok(head > peak * 0.25, `${set}: a take starts on the stick, not on silence`);
      assert.ok(Math.abs(pcm[pcm.length - 1]) < 64, `${set}: a take ends in silence`);
      assert.ok(pcm.length / pack.rate < 1, `${set}: a take is a stroke, not a phrase`);
    }
  }
  assert.ok(bytes < 600 * 1024, "the takes stay small enough to load on a phone");
});

/* Named individually rather than left to the deepEqual above, because these are
   the specific files that were public and the reason this list exists. A
   regression here is not a tidiness problem — it is repository notes on the open
   web under a domain teachers are told to trust. */
test("internal documents are not shipped", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: root });
  const shipped = await filesBelow(dist);
  for (const internal of ["CLAUDE.md", "REVIEW.md", "README.md", "serve.ps1"]) {
    assert.ok(!shipped.includes(internal), `${internal} must not be published`);
  }
  assert.ok(!shipped.some((f) => f.startsWith("tests/")), "tests must not be published");
  assert.ok(!shipped.some((f) => f.startsWith(".github/")), "workflows must not be published");
});

/* The beacon has to survive the copy. It is asserted against dist rather than
   the source, because the source having it proves nothing about what ships. */
test("the built page still carries the analytics beacon", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: root });
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("index.html", dist), "utf8");
  const tag = html.match(/<script[^>]*cloudflareinsights[^>]*><\/script>/);
  assert.ok(tag, "dist/index.html must carry the beacon");
  assert.match(tag[0], /4c76fa6f3023401899bbeb30fa4eebd3/);
});

/* The capability manifest the build publishes.
 *
 * Rudiment Room published nothing about itself, so the shop site's guide-build
 * audit could not check whether its guide still names the build this app
 * serves — and an app in that audit's uncovered list can carry a stale stamp
 * for as long as it takes somebody to notice by hand. That is how Drum Map's
 * was found on 2026-09-04. The manifest is only worth having if its version
 * cannot drift from the page, which is what these pin. */
test("the published version is read from the page, not repeated", async () => {
  const { buildStamp, capabilities } = await import("../capabilities.mjs");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const stamp = buildStamp(html);

  assert.match(stamp, /^\d{4}-\d{2}-\d{2}(\.\d+)?$/, "the build identifier should be an ISO date, optionally suffixed");
  assert.equal(capabilities(stamp).version, stamp);

  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(readme.includes("**Build:** `" + stamp + "`"),
    "README.md and index.html name different builds");

  /* The page holds other ISO dates, so the whole assignment is the anchor: a
     looser pattern would publish a number nobody chose. */
  assert.throws(() => buildStamp('<script>var build = "2026-09-04";</script>'), /no build-stamp block/);
  assert.equal(buildStamp('var build = (window.__BUILD__ && String(window.__BUILD__)) || "2026-01-02.3";'), "2026-01-02.3");

  const published = capabilities(stamp);
  /* The app is Rudiment Room; the slug stays rudiment-builder, which is where
     every existing link and the guide URL already point. */
  assert.equal(published.app, "rudiment-builder");
  assert.equal(published.title, "Rudiment Room");
  assert.match(published.guideUrl, /^https:\/\/guides\./);
  /* No privacy block: those fields are a claim, and an unchecked one published
     at a public URL is worse than an absent field. */
  assert.equal(published.privacy, undefined);

  const built = JSON.parse(await readFile(new URL("../dist/capabilities.json", import.meta.url), "utf8"));
  assert.equal(built.version, stamp);
});

/* ---------------- offline (sw.js) ----------------
   In this file, not their own: node --test runs files in parallel, and every
   build rewrites dist/, so two files building at once would race. */
const manifestOf = (src) => ({
  build: JSON.parse(src.match(/^var BUILD = (".*");$/m)[1]),
  assets: JSON.parse(src.match(/^var ASSETS = (\[[\s\S]*?\]);$/m)[1]),
});

/* The offline worker is only as good as its list: a file missing from it is a
   blank card or a silent drum the first time a student practises without wifi,
   and nothing online would show it. So the list is pinned to what the build
   actually ships, and to the files a visit is known to ask for. */
test("the offline worker stores every file a visit can ask for, from this build", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: root });
  const src = await readFile(new URL("sw.js", dist), "utf8");
  const { build, assets } = manifestOf(src);
  const shipped = await filesBelow(dist);

  const { buildStamp } = await import("../capabilities.mjs");
  assert.equal(build, buildStamp(await readFile(new URL("../index.html", import.meta.url), "utf8")),
    "the worker carries the page's build, so every deploy is a new worker and a new cache");
  assert.deepEqual(assets, precacheList(shipped), "the list is derived from what the build wrote");
  assert.equal(new Set(assets).size, assets.length, "no file listed twice");

  for (const url of assets) {
    assert.ok(shipped.includes(url === "./" ? "index.html" : url), `${url} is shipped`);
  }
  for (const needed of ["./", "js/rudiment-app.js", "js/rudiment-core.js", "js/rudiment-data.js",
    "assets/brand/design-tokens.css", "assets/audio/marching-snare.js", "manifest.webmanifest"]) {
    assert.ok(assets.includes(needed), `${needed} is stored offline`);
  }
  for (const card of Core.RUDIMENTS.map(Core.notationCard)) assert.ok(assets.includes(card), `${card} is stored offline`);
  const fonts = shipped.filter((f) => f.endsWith(".woff2"));
  assert.ok(fonts.length >= 4 && fonts.every((f) => assets.includes(f)), "every font face is stored offline");

  assert.ok(!assets.includes("index.html"), "the page is stored as ./, where it is served");
  for (const never of ["capabilities.json", "sw.js", "robots.txt", "sitemap.xml"]) {
    assert.ok(!assets.includes(never), `${never} is not stored`);
  }
  assert.ok(!assets.some((f) => f.endsWith(".txt")), "licence texts are not stored");
});

/* Only the manifest block may differ between the repo copy and the shipped
   one: the logic that ships is the logic that was reviewed. And the repo copy
   stores nothing, so serving the repo root for development never pins a
   stale build in a developer's browser. */
test("the shipped worker is the repo's, with only the manifest filled in", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: root });
  const block = /\/\/ BUILD MANIFEST[^\n]*\n[\s\S]*?\/\/ END BUILD MANIFEST\n/;
  const repo = await readFile(new URL("sw.js", root), "utf8");
  const shipped = await readFile(new URL("sw.js", dist), "utf8");
  assert.equal(repo.replace(block, ""), shipped.replace(block, ""));
  assert.deepEqual(manifestOf(repo), { build: "dev", assets: [] }, "the development copy stores nothing");

  const app = await readFile(new URL("../js/rudiment-app.js", import.meta.url), "utf8");
  assert.match(app, /sw\.register\("sw\.js"\)/, "the page registers the worker beside it");
  assert.match(app, /location\.protocol === "file:"/, "and not over file://");
});

/* The worker's routing, run against fakes: what it answers from the cache and
   what it leaves to the network. */
function loadWorker(src, origin = "https://rudiment-builder.backwerdrhythmshop.com") {
  const handlers = {};
  const stored = new Map(); // absolute URL -> response
  const matches = [];
  const fetched = [];
  const self = {
    location: new URL(`${origin}/sw.js`),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const cache = {
    addAll: (reqs) => { reqs.forEach((r) => stored.set(new URL(r.url, self.location).href, `body of ${r.url}`)); return Promise.resolve(); },
    match: (key, opts) => {
      const url = new URL(typeof key === "string" ? key : key.url, self.location);
      if (opts && opts.ignoreSearch) url.search = "";
      matches.push(url.href);
      return Promise.resolve(stored.get(url.href));
    },
  };
  const sandbox = {
    self, URL,
    caches: { open: () => Promise.resolve(cache), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) },
    Request: class { constructor(url, init) { this.url = new URL(url, self.location).href; this.init = init; } },
    fetch: (req) => { fetched.push(req.url); return Promise.resolve(`network ${req.url}`); },
    Promise,
  };
  sandbox.self.caches = sandbox.caches;
  vm.runInNewContext(src, sandbox);
  return { handlers, stored, matches, fetched, origin };
}
async function request(w, url, mode = "no-cors", method = "GET") {
  let answered = null;
  const event = { request: { url, mode, method }, respondWith: (p) => { answered = p; } };
  w.handlers.fetch(event);
  return answered ? await answered : "not handled";
}

test("offline routing: the page for any drill link, stored files from the cache, the rest untouched", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: root });
  const w = loadWorker(await readFile(new URL("sw.js", dist), "utf8"));
  const o = w.origin;
  await new Promise((done) => w.handlers.install({ waitUntil: (p) => p.then(done) }));

  assert.equal(await request(w, `${o}/?r=flam-tap&mode=ladder&turn=2`, "navigate"), `body of ${o}/`,
    "a share link opens the stored page");
  assert.equal(await request(w, `${o}/`, "navigate"), `body of ${o}/`);
  assert.equal(await request(w, `${o}/index.html`, "navigate"), `body of ${o}/`);
  assert.equal(await request(w, `${o}/assets/audio/marching-snare.js`), `body of ${o}/assets/audio/marching-snare.js`);
  assert.equal(await request(w, `${o}/js/rudiment-app.js`), `body of ${o}/js/rudiment-app.js`);

  assert.equal(await request(w, `${o}/capabilities.json`), `network ${o}/capabilities.json`,
    "capabilities.json is fetched fresh");
  assert.equal(await request(w, "https://static.cloudflareinsights.com/beacon.min.js"), "not handled", "other origins pass by");
  assert.equal(await request(w, "https://counter.backwerdrhythmshop.com/hit?app=rudiment-builder"), "not handled");
  assert.equal(await request(w, `${o}/sw.js`, "no-cors", "POST"), "not handled", "only GETs");
  assert.equal(await request(w, `${o}/robots.txt`, "navigate"), "not handled", "only the page is a navigation it answers");

  const dev = loadWorker(await readFile(new URL("sw.js", root), "utf8"));
  assert.equal(await request(dev, `${dev.origin}/`, "navigate"), "not handled", "the development copy passes everything through");
});
