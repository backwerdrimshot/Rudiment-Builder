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
import os from "node:os";
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

test("README calendar validation accepts real dates and rejects normalized or malformed dates", () => {
  const script = extractReadmeCheck(WORKFLOW);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "rudiment-readme-"));
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  try {
    git("init", "--quiet");
    fs.writeFileSync(path.join(fixture, "index.html"), fs.readFileSync(path.join(ROOT, "index.html")));
    git("add", "index.html");
    for (const [date, valid] of [
      ["2024-02-29", true], ["2026-10-27.8", true],
      ["2026-02-29", false], ["2026-04-31", false],
      ["2026-13-01", false], ["2026-00-01", false], ["2026-10-00", false],
      ["2026-1-01", false], ["2026-10-27garbage", false],
    ]) {
      fs.writeFileSync(path.join(fixture, "README.md"), fs.readFileSync(path.join(ROOT, "README.md"), "utf8")
        .replace(/(- \*\*Build:\*\* `)[^`]+/, "$1" + date));
      // The other release checks still run: a valid date must also occur in app code.
      fs.writeFileSync(path.join(fixture, "index.html"), fs.readFileSync(path.join(ROOT, "index.html"), "utf8") + "\n" + date);
      const r = spawnSync("/bin/bash", ["-c", script], { cwd: fixture, encoding: "utf8" });
      assert.equal(r.status === 0, valid, `${date}: ${r.stdout}\n${r.stderr}`);
    }
    fs.writeFileSync(path.join(fixture, "README.md"), fs.readFileSync(path.join(ROOT, "README.md"), "utf8")
      .replace("## Support and feedback", "## Missing support"));
    const r = spawnSync("/bin/bash", ["-c", script], { cwd: fixture, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /Missing ## Support and feedback/);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test("README pull-request checks still require a build bump for app changes on Bash 3.2", () => {
  const script = extractReadmeCheck(WORKFLOW).replace('[[ "push" == "pull_request" ]]', '[[ "pull_request" == "pull_request" ]]');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "rudiment-readme-pr-"));
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const build = readme.match(/^- \*\*Build:\*\* `([^`]+)`/m)[1];
  const check = () => spawnSync("/bin/bash", ["-c", script], { cwd: fixture, encoding: "utf8" });
  try {
    git("init", "--quiet");
    git("config", "user.name", "Release validation fixture");
    git("config", "user.email", "fixture@example.invalid");
    fs.writeFileSync(path.join(fixture, "README.md"), readme);
    fs.writeFileSync(path.join(fixture, "index.html"), app);
    git("add", "."); git("commit", "--quiet", "-m", "baseline");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    fs.writeFileSync(path.join(fixture, "test fixture.md"), "documentation only");
    git("add", "."); git("commit", "--quiet", "-m", "docs");
    assert.equal(check().status, 0, "documentation needs no build bump");
    fs.writeFileSync(path.join(fixture, "app with spaces.js"), "// app change");
    git("add", "."); git("commit", "--quiet", "-m", "app");
    const unchanged = check();
    assert.notEqual(unchanged.status, 0);
    assert.match(unchanged.stdout, /App changes require a new build date/);
    fs.writeFileSync(path.join(fixture, "README.md"), readme.replace(build, "2026-10-27.999"));
    fs.writeFileSync(path.join(fixture, "index.html"), app.replace(build, "2026-10-27.999"));
    assert.equal(check().status, 0, "a distinct valid build passes the same check");
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
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
