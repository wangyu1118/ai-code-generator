import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.AGENT_E2E_BASE_URL || "http://127.0.0.1:8787";
const outDir = path.resolve(".agent-e2e");
const prompt =
  process.env.AGENT_E2E_PROMPT ||
  [
    "Build a small mobile-friendly browser game that can be packaged into an installable Android debug APK.",
    "Game concept: Meteor Dodge. The player controls a small ship with touch/keyboard input, dodges falling meteors, collects energy orbs, has score, lives, pause/restart, and increasing difficulty.",
    "Use an APK-friendly React + Vite + Capacitor structure. Include package.json, index.html, src files, tests for game logic, and commands for web build and APK packaging.",
    "Keep the project compact and runnable."
  ].join(" ");

async function postJson(route, body, timeoutMs = 240000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${route} timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || `${route} failed with HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function summarizeSteps(result) {
  return (result.steps || []).map((step) => ({
    name: step.name,
    status: step.status,
    command: step.command,
    detail: step.detail,
    outputPreview: typeof step.output === "string" ? step.output.slice(0, 1200) : undefined
  }));
}

await fs.mkdir(outDir, { recursive: true });

const startedAt = new Date().toISOString();
console.log("Generating Meteor Dodge game...");
let generated;
try {
  generated = await postJson("/api/generate", {
    brief: prompt,
    language: "auto",
    framework: "auto",
    style: "agent-selected production-ready",
    outputKind: "agent-selected",
    qualityMode: "realistic production",
    agentMode: true,
    includeTests: true
  });
} catch (error) {
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    prompt,
    generation: {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  };
  await fs.writeFile(path.join(outDir, "meteor-dodge-e2e-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`Generation failed. Report written to ${path.join(outDir, "meteor-dodge-e2e-report.json")}`);
  throw error;
}

await fs.writeFile(path.join(outDir, "meteor-dodge-generated.json"), JSON.stringify(generated, null, 2), "utf8");
console.log(`Generated ${generated.files?.length || 0} files.`);

console.log("Running sandbox checks with dependency install enabled...");
let sandbox;
try {
  sandbox = await postJson(
    "/api/sandbox/run",
    {
      files: generated.files,
      allowInstall: true
    },
    360000
  );
  console.log(`Sandbox: ${sandbox.ok ? "PASS" : "FAIL"} (${sandbox.runId || "no-run-id"})`);
} catch (error) {
  sandbox = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    warnings: ["Sandbox failed before returning a structured result."],
    steps: []
  };
  console.log(`Sandbox: FAIL (${sandbox.error})`);
}

console.log("Packaging APK with dependency install enabled...");
let apk;
try {
  apk = await postJson(
    "/api/apk/package",
    {
      files: generated.files,
      allowInstall: true
    },
    600000
  );
  console.log(`APK packaging: ${apk.ok ? "PASS" : "FAIL"} (${apk.runId || "no-run-id"})`);
} catch (error) {
  apk = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    warnings: ["APK packaging failed before returning a structured result."],
    steps: [],
    apkFiles: []
  };
  console.log(`APK packaging: FAIL (${apk.error})`);
}

const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  prompt,
  generated: {
    title: generated.title,
    summary: generated.summary,
    files: (generated.files || []).map((file) => ({ path: file.path, language: file.language })),
    commands: generated.commands,
    notes: generated.notes,
    agentTrace: generated.agentTrace,
    selfCheck: generated.selfCheck
  },
  sandbox: {
    ok: sandbox.ok,
    error: sandbox.error,
    runId: sandbox.runId,
    runDir: sandbox.runDir,
    warnings: sandbox.warnings,
    steps: summarizeSteps(sandbox)
  },
  apk: {
    ok: apk.ok,
    error: apk.error,
    runId: apk.runId,
    runDir: apk.runDir,
    strategy: apk.strategy,
    apkFiles: apk.apkFiles,
    warnings: apk.warnings,
    steps: summarizeSteps(apk)
  }
};

await fs.writeFile(path.join(outDir, "meteor-dodge-e2e-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`Report written to ${path.join(outDir, "meteor-dodge-e2e-report.json")}`);

if (!sandbox.ok || !apk.ok || !apk.apkFiles?.length) {
  process.exitCode = 1;
}
