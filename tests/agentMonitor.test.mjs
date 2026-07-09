import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMonitorTargets,
  classifyCheckResults,
  createMonitorReport,
  isDirectRunPath,
  redactMonitorUrl,
  targetResultIsOk
} from "../scripts/agent-monitor.mjs";

test("buildMonitorTargets includes local health and optional production targets", () => {
  const targets = buildMonitorTargets({
    localUrl: "http://127.0.0.1:8787",
    productionUrl: "https://example.vercel.app/"
  });

  assert.deepEqual(targets.map((target) => target.name), [
    "local.health",
    "local.usage",
    "local.generate",
    "local.sandbox",
    "production.home",
    "production.health"
  ]);
});

test("buildMonitorTargets forces local generation smoke checks to use mock mode", () => {
  const targets = buildMonitorTargets();
  const generateTarget = targets.find((target) => target.name === "local.generate");

  assert.equal(generateTarget.body.forceMock, true);
  assert.equal(generateTarget.body.apiKey, "");
});

test("buildMonitorTargets adds a sandbox smoke check for generated-code execution health", () => {
  const targets = buildMonitorTargets();

  assert.ok(targets.some((target) => target.name === "local.sandbox"));
});

test("redactMonitorUrl removes query secrets from URLs", () => {
  assert.equal(
    redactMonitorUrl("https://example.com/api?apiKey=sk-secret&token=abc&ok=1"),
    "https://example.com/api?apiKey=%5Bredacted%5D&token=%5Bredacted%5D&ok=1"
  );
});

test("isDirectRunPath handles Windows script paths", () => {
  assert.equal(
    isDirectRunPath("file:///D:/workplace/projects/ai-code-generator/scripts/agent-monitor.mjs", "D:\\workplace\\projects\\ai-code-generator\\scripts\\agent-monitor.mjs"),
    true
  );
});

test("targetResultIsOk treats JSON ok false as a failed check", () => {
  assert.equal(targetResultIsOk({ expectStatus: 200 }, 200, { ok: false }), false);
  assert.equal(targetResultIsOk({ expectStatus: 200 }, 200, { ok: true }), true);
});

test("classifyCheckResults marks report failed when any required check fails", () => {
  const status = classifyCheckResults([
    { name: "local.health", ok: true, required: true },
    { name: "local.generate", ok: false, required: true, error: "HTTP 500" },
    { name: "production.home", ok: false, required: false, error: "timeout" }
  ]);

  assert.equal(status.ok, false);
  assert.equal(status.failedRequired.length, 1);
  assert.equal(status.failedOptional.length, 1);
});

test("createMonitorReport keeps actionable failure details", () => {
  const report = createMonitorReport({
    startedAt: "2026-07-09T00:00:00.000Z",
    checks: [
      {
        name: "apk.package",
        ok: false,
        required: true,
        durationMs: 1200,
        error: "Gradle failed",
        detail: { runId: "apk-1", step: "assembleDebug" }
      }
    ]
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks[0].detail.runId, "apk-1");
  assert.match(report.summary, /1 required check failed/);
});
