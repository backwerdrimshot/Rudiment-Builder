import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

const TOKEN = "4c76fa6f3023401899bbeb30fa4eebd3";
const BEACON = /<script[^>]*src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"[^>]*><\/script>/;

/* The shop site's Worker injects this beacon in one place for every page it
   serves, and it does not serve this host. rudiment-builder.backwerdrhythmshop
   .com is its own deployment, so nothing upstream notices if the tag goes.

   The token is written out literally rather than read from a constant. A
   wrong-but-present token is the failure that costs most: the beacon loads, the
   page looks right, nothing errors, and the views land in someone else's
   dashboard or nowhere at all. */
test("the analytics beacon ships, with the shared site token", () => {
  const tag = html.match(BEACON);
  assert.ok(tag, "index.html must carry the beacon as a real script element");
  assert.match(tag[0], new RegExp(TOKEN));
  assert.match(tag[0], /type="module"/, "module scripts defer without blocking the parser");
  assert.ok(
    html.indexOf("cloudflareinsights") > html.indexOf("<footer"),
    "the beacon belongs at the end of the body, not ahead of the app",
  );
});

/* The beacon reports pages. It must never become a route for a rudiment, a tempo
   or a stored setting — that is the promise the README's Privacy section makes
   and the one /privacy/ makes on this app's behalf. */
test("the analytics beacon carries nothing but its token", () => {
  const config = html.match(BEACON)[0].match(/data-cf-beacon='([^']*)'/);
  assert.ok(config, "the beacon must declare a data-cf-beacon config");
  assert.deepEqual(JSON.parse(config[1]), { token: TOKEN });
});

/* The Privacy section claimed no account and local-only settings, both still
   true, and said nothing about a script loading. It does now, and this keeps it
   that way. */
test("the README discloses the beacon", () => {
  assert.match(readme, /Cloudflare Web Analytics/);
});
