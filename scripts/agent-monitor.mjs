import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultLocalUrl = "http://127.0.0.1:8787";
const defaultReportPath = path.resolve(".agent-monitor/latest.json");

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function redactMonitorUrl(value) {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      if (/key|token|secret|password/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return String(value || "").replace(/(apiKey|token|secret|password)=([^&\s]+)/gi, "$1=[redacted]");
  }
}

export function buildMonitorTargets({ localUrl = defaultLocalUrl, productionUrl = "" } = {}) {
  const local = trimSlash(localUrl);
  const production = trimSlash(productionUrl);
  const targets = [
    {
      name: "local.health",
      required: true,
      method: "GET",
      url: `${local}/api/health`,
      expectStatus: 200
    },
    {
      name: "local.usage",
      required: true,
      method: "GET",
      url: `${local}/api/usage/events?limit=5`,
      expectStatus: 200
    },
    {
      name: "local.generate",
      required: true,
      method: "POST",
      url: `${local}/api/generate`,
      expectStatus: 200,
      body: {
        brief: "monitor smoke test: generate a tiny button component",
        agentMode: true,
        includeTests: true,
        commentMode: "section",
        forceMock: true,
        apiKey: ""
      }
    },
    {
      name: "local.sandbox",
      required: true,
      method: "POST",
      url: `${local}/api/sandbox/run`,
      expectStatus: 200,
      body: {
        allowInstall: false,
        files: [
          {
            path: "src/monitor-smoke.js",
            language: "JavaScript",
            content: "export function monitorSmoke() {\n  return true;\n}\n",
            explanation: "Small syntax-only sandbox smoke file."
          }
        ]
      }
    }
  ];

  if (production) {
    targets.push(
      {
        name: "production.home",
        required: false,
        method: "GET",
        url: production,
        expectStatus: 200
      },
      {
        name: "production.health",
        required: false,
        method: "GET",
        url: `${production}/api/health`,
        expectStatus: 200
      }
    );
  }

  return targets;
}

export function classifyCheckResults(checks) {
  const failedRequired = checks.filter((check) => check.required && !check.ok);
  const failedOptional = checks.filter((check) => !check.required && !check.ok);
  return {
    ok: failedRequired.length === 0,
    failedRequired,
    failedOptional
  };
}

export function createMonitorReport({ startedAt, checks }) {
  const classified = classifyCheckResults(checks);
  const failedRequiredCount = classified.failedRequired.length;
  const failedOptionalCount = classified.failedOptional.length;
  return {
    ok: classified.ok,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: classified.ok
      ? failedOptionalCount
        ? `All required checks passed; ${failedOptionalCount} optional check failed.`
        : "All required checks passed."
      : `${failedRequiredCount} required check failed; ${failedOptionalCount} optional check failed.`,
    checks
  };
}

export function isDirectRunPath(moduleUrl, argvPath) {
  if (!argvPath) return false;
  try {
    return path.resolve(argvPath) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

export function targetResultIsOk(target, status, json) {
  if (status !== target.expectStatus) return false;
  if (json && typeof json === "object" && json.ok === false) return false;
  return true;
}

export async function runTarget(
  target,
  {
    fetchImpl = fetch,
    timeoutMs = 20_000,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  } = {}
) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeoutImpl(() => controller.abort(new Error(`${target.name} timed out`)), timeoutMs);
  try {
    const response = await fetchImpl(target.url, {
      method: target.method,
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Session-Id": "monitor"
      },
      body: target.body ? JSON.stringify(target.body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      name: target.name,
      required: target.required,
      ok: targetResultIsOk(target, response.status, json),
      status: response.status,
      url: redactMonitorUrl(target.url),
      durationMs: Date.now() - startedAt,
      detail: json
        ? {
            ok: json.ok,
            title: json.title,
            files: Array.isArray(json.files) ? json.files.length : undefined,
            events: Array.isArray(json.events) ? json.events.length : undefined,
            hasApiKey: json.hasApiKey
          }
        : { preview: text.slice(0, 240) }
    };
  } catch (error) {
    return {
      name: target.name,
      required: target.required,
      ok: false,
      url: redactMonitorUrl(target.url),
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeoutImpl(timeout);
  }
}

async function writeReport(report, reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  const reportPath = path.resolve(process.env.AGENT_MONITOR_REPORT || defaultReportPath);
  const targets = buildMonitorTargets({
    localUrl: process.env.AGENT_MONITOR_LOCAL_URL || defaultLocalUrl,
    productionUrl: process.env.AGENT_MONITOR_PRODUCTION_URL || ""
  });
  const startedAt = new Date().toISOString();
  const checks = [];

  for (const target of targets) {
    checks.push(await runTarget(target));
  }

  const report = createMonitorReport({ startedAt, checks });
  await writeReport(report, reportPath);
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (isDirectRunPath(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
