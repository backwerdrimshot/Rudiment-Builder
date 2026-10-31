#!/usr/bin/env node
/* Publish Rudiment Room without GitHub Actions.

   GitHub Actions cannot run for this account, so this script is the hand path.
   It runs four checks on this machine (a clean checkout of origin/main, the
   test suites, the README standard script, and a fresh build that must match
   the committed dist/) and then, only if asked, the deploy:

     node tools/publish.mjs             check only; nothing is published
     node tools/publish.mjs --deploy    check, then wrangler deploy, then verify live

   It refuses anything but a clean checkout of exactly origin/main, because what
   is published must be what the repository says it is. The README standard
   checks are read out of readme-standard.yml and run as written, not copied
   here, so the two cannot drift. Deploying needs CLOUDFLARE_API_TOKEN (and
   CLOUDFLARE_ACCOUNT_ID) in the environment; neither is ever printed.

   Nothing here configures a domain, DNS or a route. The route is Taylor's and
   stays where README "Deployment" says it is. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = ".github/workflows/readme-standard.yml";
const STEP_NAME = "Validate README standard";

/* The shell script of the named step, taken from the workflow file by
   indentation (no YAML parser: this repo has no dependencies). The two
   expressions the script reads are filled in as for a push to main; anything
   left over would be silently wrong, so it is an error. */
export function extractReadmeCheck(workflowText) {
  const lines = workflowText.split("\n");
  const at = lines.findIndex((l) => l.trim() === `- name: ${STEP_NAME}` || l.trim() === `name: ${STEP_NAME}`);
  if (at === -1) throw new Error(`no step named "${STEP_NAME}" in ${WORKFLOW}`);
  let run = -1;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^\s*- name:/.test(lines[i])) break; // the next step began
    if (/^\s*run:\s*\|\s*$/.test(lines[i])) { run = i; break; }
  }
  if (run === -1) throw new Error(`step "${STEP_NAME}" has no "run: |" block`);
  const keyIndent = lines[run].match(/^\s*/)[0].length;
  const body = [];
  for (let i = run + 1; i < lines.length; i++) {
    const indent = lines[i].match(/^\s*/)[0].length;
    if (lines[i].trim() !== "" && indent <= keyIndent) break;
    body.push(lines[i]);
  }
  const bodyIndent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  const script = body.map((l) => l.slice(bodyIndent))
    .join("\n")
    .replaceAll("${{ github.event_name }}", "push")
    .replaceAll("${{ github.base_ref }}", "main");
  if (script.includes("${{")) throw new Error(`${WORKFLOW} uses an expression this script does not know how to fill in`);
  return script;
}

/* The wrangler version every deploy uses. This repository has no lockfile, so
   an unpinned `wrangler@latest` would change the deploy tool, even across a
   major version, with no change to the repository. This constant is the one
   place the pin lives in the repository: change it here, and change the deploy
   command in the Cloudflare Workers Builds settings to match (README
   "Deployment"). */
export const WRANGLER_VERSION = "4.131.0";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
}
function out(cmd, args) {
  const r = run(cmd, args);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim()}`);
  return r.stdout.trim();
}
const say = (msg) => console.log(msg);

function step(name, fn) {
  process.stdout.write(`\n== ${name}\n`);
  fn();
  say(`   ok`);
}
function must(r, what) {
  if (r.status !== 0) {
    throw new Error(`${what} failed (exit ${r.status}).\n${(r.stdout || "").trim()}\n${(r.stderr || "").trim()}`.trim());
  }
}

export function liveVersion(json) {
  const v = JSON.parse(json).version;
  if (typeof v !== "string" || !v) throw new Error("capabilities.json has no version");
  return v;
}

export async function verifyLive(distVersion, launchUrl, { tries = 6, delayMs = 5000 } = {}) {
  const url = new URL("capabilities.json", launchUrl);
  let seen = "(unreadable)";
  for (let i = 0; i < tries; i++) {
    try {
      url.searchParams.set("cb", String(Date.now()));
      const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
      if (res.ok) {
        seen = liveVersion(await res.text());
        if (seen === distVersion) return seen;
      }
    } catch { /* retry */ }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`the live site reports ${seen}, not ${distVersion}. The deploy may not have taken effect.`);
}

async function main() {
  const deploy = process.argv.includes("--deploy");

  step("clean checkout of origin/main", () => {
    must(run("git", ["fetch", "--quiet", "origin", "main"]), "git fetch origin main");
    const dirty = out("git", ["status", "--porcelain"]);
    if (dirty) throw new Error(`the working tree has uncommitted changes; publish only what is committed:\n${dirty}`);
    const head = out("git", ["rev-parse", "HEAD"]), main = out("git", ["rev-parse", "origin/main"]);
    if (head !== main) {
      throw new Error(`HEAD (${head.slice(0, 12)}) is not origin/main (${main.slice(0, 12)}). Merge first, then check out main.`);
    }
    say(`   ${head.slice(0, 12)} ${out("git", ["log", "-1", "--format=%s"]).slice(0, 70)}`);
  });

  step("tests: tests/*.test.mjs", () => {
    const files = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => path.join("tests", f));
    must(run(process.execPath, ["--test", ...files]), "build and privacy tests");
  });
  step("tests: core cases", () => {
    must(run(process.execPath, ["--test", "tests/core.test.cjs"]), "core test cases");
  });

  step(`${STEP_NAME} (from ${WORKFLOW})`, () => {
    const script = extractReadmeCheck(fs.readFileSync(path.join(ROOT, WORKFLOW), "utf8"));
    must(run("bash", ["-c", `set -euo pipefail\n${script}`]), "the README standard checks");
  });

  step("dist/ matches a fresh build", () => {
    must(run(process.execPath, ["build.mjs"]), "node build.mjs");
    const drift = out("git", ["status", "--porcelain", "--", "dist"]);
    if (drift) throw new Error(`the committed dist/ is not what build.mjs produces from this commit; rebuild and commit it:\n${drift}`);
  });

  const caps = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "capabilities.json"), "utf8"));
  if (!deploy) {
    say(`\nAll checks passed for build ${caps.version}. Nothing was published.`);
    say("To publish it: node tools/publish.mjs --deploy");
    return;
  }

  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN is not set; cannot deploy.");
  const pin = WRANGLER_VERSION;
  step(`wrangler@${pin} deploy (build ${caps.version})`, () => {
    const r = run("npx", ["--yes", `wrangler@${pin}`, "deploy"], { stdio: "inherit", env: { ...process.env, CI: "1" } });
    if (r.status !== 0) throw new Error(`wrangler deploy failed (exit ${r.status}).`);
  });
  process.stdout.write("\n== live site reports the new build\n");
  say(`   ${await verifyLive(caps.version, caps.launchUrl)} at ${caps.launchUrl}`);
  say(`\nPublished ${caps.version}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nSTOPPED: ${err.message}`);
    process.exit(1);
  });
}
