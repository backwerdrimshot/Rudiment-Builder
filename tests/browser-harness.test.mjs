import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Exercise the actual browser runner, including its failure reporting, without
// copying the assertion helpers into a second implementation.
const html = fs.readFileSync(new URL("./test.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function run(cases) {
  const elements = {};
  const document = {
    title: "Core tests",
    createElement: () => ({ appendChild() {} }),
    getElementById: (id) => elements[id] ||= { appendChild() {} },
  };
  const context = { document, window: {}, RudimentCore: {}, RudimentTests: { getCases: () => cases } };
  vm.runInNewContext(script, context);
  return { result: context.window.__TEST_RESULTS__, summary: elements.summary };
}

test("browser assertions accept thrown values and structurally different nested values", () => {
  const { result } = run([
    { name: "throws", fn(a) { a.throws(() => { throw new Error("bad input"); }); } },
    { name: "throws undefined", fn(a) { a.throws(() => { throw undefined; }); } },
    { name: "not deep equal", fn(a) { a.notDeepEqual([{ hands: ["R", "L"] }], [{ hands: ["L", "R"] }]); } },
  ]);
  assert.equal(result.passed, 3);
  assert.equal(result.failed, 0);
});

test("browser runner reports missing throws and equal nested values as failures", () => {
  const { result, summary } = run([
    { name: "missing exception", fn(a) { a.throws(() => 42, "must reject"); } },
    { name: "same values", fn(a) { a.notDeepEqual([{ hands: ["R", "L"] }], [{ hands: ["R", "L"] }]); } },
  ]);
  assert.equal(result.passed, 0);
  assert.equal(result.failed, 2);
  assert.equal(result.total, 2);
  assert.equal(summary.className, "fail");
  assert.equal(summary.textContent, "2 of 2 tests FAILED (0 passed)");
});
