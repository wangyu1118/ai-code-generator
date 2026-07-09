const endpoint = process.env.AGENT_BENCHMARK_URL || "http://127.0.0.1:8787/api/generate";
const limit = Number(process.env.AGENT_BENCHMARK_LIMIT || 20);
const timeoutMs = Number(process.env.AGENT_BENCHMARK_TIMEOUT_MS || 180000);
const concurrency = Math.max(1, Math.min(Number(process.env.AGENT_BENCHMARK_CONCURRENCY || 2), 4));
const selectedIds = (process.env.AGENT_BENCHMARK_CASES || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const cases = [
  {
    id: "frontend-todo",
    category: "frontend",
    prompt:
      "Build a polished React task board with add/edit/delete, completion, filters, search, local persistence, and Vitest tests.",
    mustHave: ["package.json", "src/"],
    shouldMention: ["react", "vite", "test"]
  },
  {
    id: "ticketing-backend",
    category: "scarce-resource-backend",
    prompt:
      "Build a Node.js Express ticket booking backend with server-side stock, auth-derived user identity placeholder, max quantity, duplicate order prevention, rate limit, CORS policy, and concurrent no-oversell tests.",
    mustHave: ["app", "server", "test"],
    shouldMention: ["409", "rate", "duplicate", "concurrent"]
  },
  {
    id: "python-scraper",
    category: "python-cli",
    prompt:
      "Build a Python CLI scraper that fetches page titles from a list of URLs, exports CSV, retries transient failures, validates URLs, and includes pytest tests.",
    mustHave: [".py", "test"],
    shouldMention: ["pytest", "csv"]
  },
  {
    id: "apk-expense-tracker",
    category: "apk-mobile",
    prompt:
      "Build a mobile-friendly expense tracker and make it packageable as an Android debug APK. Include offline local storage and a clear APK build path.",
    mustHave: ["package.json"],
    shouldMention: ["apk", "android", "capacitor"]
  },
  {
    id: "browser-extension",
    category: "browser-extension",
    prompt:
      "Build a Chrome extension that summarizes the current page title and selected text in a popup, with manifest v3 and safe permissions.",
    mustHave: ["manifest.json"],
    shouldMention: ["permissions", "manifest"]
  },
  {
    id: "rag-api",
    category: "ai-api",
    prompt:
      "Build a small RAG API for uploading markdown documents, chunking them, searching locally, and answering questions with a provider abstraction and tests.",
    mustHave: ["api", "test"],
    shouldMention: ["chunk", "search", "provider"]
  },
  {
    id: "dashboard",
    category: "data-visualization",
    prompt:
      "Build an analytics dashboard for sales metrics with charts, date filtering, empty states, and frontend tests.",
    mustHave: ["package.json", "src/"],
    shouldMention: ["chart", "filter", "test"]
  },
  {
    id: "game",
    category: "game",
    prompt:
      "Build a browser puzzle game with scoring, timer, restart, keyboard controls, and deterministic game logic tests.",
    mustHave: ["package.json", "test"],
    shouldMention: ["game", "score", "keyboard"]
  },
  {
    id: "websocket-chat",
    category: "realtime",
    prompt:
      "Build a realtime chat server and minimal client using WebSocket, rooms, user names, message validation, and tests.",
    mustHave: ["server", "client", "test"],
    shouldMention: ["websocket", "room"]
  },
  {
    id: "file-upload-api",
    category: "security-backend",
    prompt:
      "Build a secure file upload API with size/type validation, storage abstraction, malware-scan placeholder, rate limiting, and tests.",
    mustHave: ["app", "test"],
    shouldMention: ["validation", "rate", "storage"]
  },
  {
    id: "electron-notes",
    category: "desktop",
    prompt:
      "Build a desktop notes app using Electron or Tauri, with local save, search, export, and clear run/build commands.",
    mustHave: ["package.json"],
    shouldMention: ["desktop", "electron", "build"]
  },
  {
    id: "terraform-module",
    category: "infra",
    prompt:
      "Build a Terraform module for a small web service infrastructure with variables, outputs, examples, and validation notes.",
    mustHave: [".tf"],
    shouldMention: ["terraform", "variable", "output"]
  },
  {
    id: "dockerized-api",
    category: "devops",
    prompt:
      "Build a Dockerized Node.js health-check API with Dockerfile, compose file, environment config, and tests.",
    mustHave: ["Dockerfile", "compose", "test"],
    shouldMention: ["docker", "health"]
  },
  {
    id: "sql-migration",
    category: "database",
    prompt:
      "Build a Postgres schema and migration set for orders, inventory, users, unique order constraint, and rollback notes.",
    mustHave: [".sql"],
    shouldMention: ["postgres", "unique", "inventory"]
  },
  {
    id: "fastapi-service",
    category: "python-api",
    prompt:
      "Build a FastAPI service for creating and searching contacts, with pydantic validation, pagination, and pytest tests.",
    mustHave: [".py", "test"],
    shouldMention: ["fastapi", "pytest", "pagination"]
  },
  {
    id: "cli-renamer",
    category: "cli",
    prompt:
      "Build a safe file batch-renaming CLI with dry-run mode, conflict detection, undo file, and tests.",
    mustHave: ["cli", "test"],
    shouldMention: ["dry", "undo", "conflict"]
  },
  {
    id: "auth-saas-starter",
    category: "fullstack",
    prompt:
      "Build a full-stack SaaS starter with login, protected dashboard, role checks, API route, and tests. Do not invent secrets.",
    mustHave: ["package.json", "test"],
    shouldMention: ["auth", "role", "secret"]
  },
  {
    id: "calendar-app",
    category: "frontend-complex-state",
    prompt:
      "Build a calendar scheduling app with drag-to-create events, conflict warnings, timezone notes, and component tests.",
    mustHave: ["package.json", "src/"],
    shouldMention: ["calendar", "timezone", "conflict"]
  },
  {
    id: "image-tool",
    category: "canvas-tool",
    prompt:
      "Build a browser image annotation tool with canvas drawing, undo/redo, export PNG, keyboard shortcuts, and tests for tool state.",
    mustHave: ["package.json", "src/"],
    shouldMention: ["canvas", "undo", "export"]
  },
  {
    id: "agent-plugin",
    category: "agent-extension",
    prompt:
      "Build a plugin system for this code agent: project templates, tool registry, safe capability metadata, and tests.",
    mustHave: ["registry", "test"],
    shouldMention: ["agent", "plugin", "capability"]
  }
];

const selectedCases = selectedIds.length ? cases.filter((testCase) => selectedIds.includes(testCase.id)) : cases.slice(0, limit);

function withTimeout(promise, ms, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${ms}ms`)), ms);
  return {
    signal: controller.signal,
    promise: promise(controller.signal).finally(() => clearTimeout(timer))
  };
}

function flattenResult(result) {
  const files = Array.isArray(result.files) ? result.files : [];
  const filePaths = files.map((file) => String(file.path || ""));
  const fileText = files.map((file) => `${file.path}\n${file.language}\n${file.content}\n${file.explanation}`).join("\n").toLowerCase();
  const metaText = [
    result.title,
    result.summary,
    ...(Array.isArray(result.commands) ? result.commands : []),
    ...(Array.isArray(result.notes) ? result.notes : []),
    ...(Array.isArray(result.agentTrace) ? result.agentTrace.map((item) => `${item.step} ${item.detail}`) : []),
    ...(Array.isArray(result.selfCheck) ? result.selfCheck : [])
  ].join("\n").toLowerCase();

  return {
    files,
    filePaths,
    allText: `${filePaths.join("\n")}\n${fileText}\n${metaText}`.toLowerCase()
  };
}

function evaluateResult(testCase, result) {
  const issues = [];
  if (!result || typeof result !== "object") issues.push("result is not an object");
  if (!result.title || !result.summary) issues.push("missing title or summary");
  if (!Array.isArray(result.files) || result.files.length === 0) issues.push("missing files");
  if (!Array.isArray(result.commands) || result.commands.length === 0) issues.push("missing commands");
  if (!Array.isArray(result.notes) || result.notes.length === 0) issues.push("missing notes");
  if (!Array.isArray(result.agentTrace) || result.agentTrace.length < 3) issues.push("weak or missing agentTrace");
  if (!Array.isArray(result.selfCheck) || result.selfCheck.length === 0) issues.push("missing selfCheck");

  const flat = flattenResult(result || {});
  for (const required of testCase.mustHave || []) {
    if (!flat.allText.includes(required.toLowerCase())) {
      issues.push(`missing required artifact signal: ${required}`);
    }
  }
  for (const word of testCase.shouldMention || []) {
    if (!flat.allText.includes(word.toLowerCase())) {
      issues.push(`missing expected domain signal: ${word}`);
    }
  }

  if (testCase.category.includes("backend") || testCase.category === "python-api") {
    if (!flat.allText.includes("test")) issues.push("backend/API result lacks test signal");
  }
  if (testCase.category === "scarce-resource-backend") {
    if (/\blet\s+tickets\s*=|\bvar\s+tickets\s*=/.test(flat.allText)) {
      issues.push("uses module-level mutable tickets variable");
    }
    for (const word of ["auth", "duplicate", "rate", "concurrent", "409"]) {
      if (!flat.allText.includes(word)) issues.push(`scarce-resource guardrail missing: ${word}`);
    }
  }
  if (testCase.category === "apk-mobile") {
    if (!/(capacitor|expo|android|gradle)/.test(flat.allText)) {
      issues.push("APK request lacks Android/Capacitor/Expo packaging path");
    }
  }
  if (testCase.category === "browser-extension" && !flat.allText.includes("manifest_version")) {
    issues.push("browser extension should include manifest_version");
  }

  return issues;
}

async function runCase(testCase) {
  const started = Date.now();
  const body = {
    brief: testCase.prompt,
    language: "auto",
    framework: "auto",
    style: "agent-selected production-ready",
    outputKind: "agent-selected",
    qualityMode: "realistic production",
    agentMode: true,
    includeTests: true
  };

  const request = withTimeout(
    (signal) =>
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal
      }),
    timeoutMs,
    testCase.id
  );

  const response = await request.promise;
  const payload = await response.json().catch(() => ({}));
  const elapsedMs = Date.now() - started;
  if (!response.ok) {
    return {
      id: testCase.id,
      category: testCase.category,
      ok: false,
      elapsedMs,
      issues: [`HTTP ${response.status}: ${payload.error || payload.detail || "request failed"}`]
    };
  }

  const issues = evaluateResult(testCase, payload);
  return {
    id: testCase.id,
    category: testCase.category,
    ok: issues.length === 0,
    elapsedMs,
    fileCount: Array.isArray(payload.files) ? payload.files.length : 0,
    commandCount: Array.isArray(payload.commands) ? payload.commands.length : 0,
    issues
  };
}

const results = new Array(selectedCases.length);
let nextIndex = 0;
let completed = 0;

async function worker() {
  while (nextIndex < selectedCases.length) {
    const index = nextIndex;
    nextIndex += 1;
    const testCase = selectedCases[index];
    process.stdout.write(`[${index + 1}/${selectedCases.length}] ${testCase.id} ...\n`);
    try {
      const result = await runCase(testCase);
      results[index] = result;
      completed += 1;
      process.stdout.write(
        `[${completed}/${selectedCases.length}] ${testCase.id} ${result.ok ? "PASS" : "FAIL"} (${Math.round(result.elapsedMs / 1000)}s)\n`
      );
      if (!result.ok) {
        for (const issue of result.issues) process.stdout.write(`  - ${issue}\n`);
      }
    } catch (error) {
      const result = {
        id: testCase.id,
        category: testCase.category,
        ok: false,
        elapsedMs: 0,
        issues: [error instanceof Error ? error.message : String(error)]
      };
      results[index] = result;
      completed += 1;
      process.stdout.write(`[${completed}/${selectedCases.length}] ${testCase.id} FAIL\n`);
      process.stdout.write(`  - ${result.issues[0]}\n`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, selectedCases.length) }, () => worker()));

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
const averageMs = results.reduce((sum, item) => sum + item.elapsedMs, 0) / Math.max(results.length, 1);
const issueCounts = new Map();
for (const result of results) {
  for (const issue of result.issues || []) {
    issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
  }
}

const summary = {
  endpoint,
  concurrency,
  total: results.length,
  passed,
  failed,
  averageSeconds: Number((averageMs / 1000).toFixed(1)),
  topIssues: Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([issue, count]) => ({ issue, count })),
  results
};

process.stdout.write(`\nSUMMARY ${JSON.stringify(summary, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
