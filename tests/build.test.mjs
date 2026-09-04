import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import { SITE_ASSETS, SITE_DIRECTORIES } from "../build.mjs";

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
  const named = new Set(SITE_ASSETS);
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

  /* The named directories ship whole, and no others do. assets/notation is the
     one this is guarding: its library is inlined where it is used and the PAS
     rudiment cards are a source asset, so none of it belongs on the web. */
  assert.deepEqual(
    [...new Set(shipped.filter(underDirectory).map((file) => file.split("/").slice(0, 2).join("/")))].sort(),
    [...SITE_DIRECTORIES].sort(),
  );
  assert.ok(!shipped.some((file) => file.startsWith("assets/notation/")), "assets/notation must not be published");
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
