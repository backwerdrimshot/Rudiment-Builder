/* tools/publish.mjs is how the app is published when GitHub Actions cannot run.
   Nothing here publishes anything: it checks the one part that must not drift
   (the README standard script read out of the workflow) and the small pure
   helpers. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { extractReadmeCheck, extractWranglerPin, liveVersion, verifyLive } from "../tools/publish.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = fs.readFileSync(path.join(ROOT, ".github/workflows/readme-standard.yml"), "utf8");
const DEPLOY = fs.readFileSync(path.join(ROOT, ".github/workflows/workers.yml"), "utf8");

test("the README standard script is read out of the workflow, expressions filled in", () => {
  const script = extractReadmeCheck(WORKFLOW);
  assert.ok(script.includes("Missing release status"), "it is the real script");
  assert.ok(script.includes("exactly one ISO build date"));
  assert.ok(!script.includes("${{"), "no GitHub expression is left in it");
  assert.ok(script.includes('[[ "push" == "pull_request" ]]'), "event_name filled in as a push");
  assert.ok(/^set -euo pipefail/m.test(script), "indentation removed, so heredocs and continuations still work");
  assert.ok(!/^ {10}/m.test(script), "no leftover workflow indentation");
});

test("the extracted script passes on this repository, as the workflow's step does", () => {
  const script = extractReadmeCheck(WORKFLOW);
  const r = spawnSync("bash", ["-c", `set -euo pipefail\n${script}`], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test("the extractor stops at the end of the step, and refuses what it cannot read", () => {
  const yml = [
    "steps:",
    "  - name: Other",
    "    run: |",
    "      echo other",
    "  - name: Validate README standard",
    "    shell: bash",
    "    run: |",
    "      echo one",
    '      if [[ "${{ github.event_name }}" == "pull_request" ]]; then',
    "        echo two",
    "      fi",
    "",
    "  - name: After",
    "    run: |",
    "      echo after",
  ].join("\n");
  const script = extractReadmeCheck(yml);
  assert.equal(script.trim(), 'echo one\nif [[ "push" == "pull_request" ]]; then\n  echo two\nfi');
  assert.throws(() => extractReadmeCheck("steps:\n  - name: Something else\n    run: |\n      echo x"), /no step named/);
  assert.throws(() => extractReadmeCheck("  - name: Validate README standard\n    run: echo inline"), /no "run: \|" block/);
  assert.throws(() => extractReadmeCheck(yml.replace("echo two", "echo ${{ secrets.X }}")), /expression this script does not know/);
});

test("the live version is read from capabilities.json and nothing else is trusted", () => {
  assert.equal(liveVersion('{"version":"2026-10-27.6","app":"x"}'), "2026-10-27.6");
  assert.throws(() => liveVersion("{}"), /no version/);
  assert.throws(() => liveVersion('{"version":""}'), /no version/);
  assert.throws(() => liveVersion('{"version":7}'), /no version/);
  assert.throws(() => liveVersion("<html>"), SyntaxError);
});

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, "127.0.0.1", () => resolve({
      url: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise((r) => server.close(r)),
    }));
  });
}

test("verifying the live site accepts the new build, even after a stale answer or two", async () => {
  let hits = 0;
  const site = await serve((req, res) => {
    hits++;
    assert.match(req.url, /^\/capabilities\.json\?cb=\d+$/, "cache-busted so an edge copy cannot answer");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ version: hits < 3 ? "2026-10-18.3" : "2026-10-27.6" }));
  });
  try {
    assert.equal(await verifyLive("2026-10-27.6", site.url, { tries: 5, delayMs: 10 }), "2026-10-27.6");
    assert.equal(hits, 3);
  } finally { await site.close(); }
});

test("verifying the live site refuses an old build, a broken answer and an unreachable site", async () => {
  const old = await serve((req, res) => res.end(JSON.stringify({ version: "2026-10-18.3" })));
  const broken = await serve((req, res) => { res.statusCode = 500; res.end("nope"); });
  try {
    await assert.rejects(verifyLive("2026-10-27.6", old.url, { tries: 2, delayMs: 5 }), /reports 2026-10-18\.3, not 2026-10-27\.6/);
    await assert.rejects(verifyLive("2026-10-27.6", broken.url, { tries: 2, delayMs: 5 }), /\(unreadable\)/);
  } finally { await old.close(); await broken.close(); }
  await assert.rejects(verifyLive("2026-10-27.6", "http://127.0.0.1:9/", { tries: 2, delayMs: 5 }), /\(unreadable\)/);
});

test("the fallback deploys with the exact wrangler version the deploy workflow pins", () => {
  const pin = extractWranglerPin(DEPLOY);
  assert.match(pin, /^\d+\.\d+\.\d+$/);
  assert.ok(DEPLOY.includes(`wrangler@${pin} deploy`), "it is the version actually in workers.yml");
  assert.equal(extractWranglerPin("run: npx --yes wrangler@4.131.0 deploy"), "4.131.0");
  assert.equal(extractWranglerPin("run: npx wrangler@5.0.2 deploy --dry-run"), "5.0.2");
  assert.throws(() => extractWranglerPin("run: npx --yes wrangler@latest deploy"), /no pinned/);
  assert.throws(() => extractWranglerPin("run: npx wrangler deploy"), /no pinned/);
  const source = fs.readFileSync(path.join(ROOT, "tools/publish.mjs"), "utf8");
  assert.ok(!/wrangler@latest/.test(source.replace(/`wrangler@latest`/g, "")), "publish.mjs never asks for wrangler@latest");
});
