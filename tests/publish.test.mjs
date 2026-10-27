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
import { extractReadmeCheck, liveVersion } from "../tools/publish.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = fs.readFileSync(path.join(ROOT, ".github/workflows/readme-standard.yml"), "utf8");

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
