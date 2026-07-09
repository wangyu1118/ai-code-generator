import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SECRET_KEYS = new Set(["apikey", "api_key", "authorization", "password", "secret", "token"]);

export function summarizeGeneratedFiles(files) {
  if (!Array.isArray(files)) return [];

  return files.slice(0, 80).map((file) => ({
    path: typeof file?.path === "string" ? file.path : "unknown",
    language: typeof file?.language === "string" ? file.language : "unknown",
    bytes: typeof file?.content === "string"
      ? Buffer.byteLength(file.content, "utf8")
      : Number.isFinite(file?.bytes)
        ? Math.max(0, Math.round(file.bytes))
        : 0
  }));
}

export function redactSensitiveData(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if ("path" in value && "content" in value) {
    return summarizeGeneratedFiles([value])[0];
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (SECRET_KEYS.has(normalizedKey) || normalizedKey.endsWith("token") || normalizedKey.endsWith("secret")) {
      output[key] = "[redacted]";
    } else if (key === "files" && Array.isArray(item)) {
      output[key] = summarizeGeneratedFiles(item);
    } else {
      output[key] = redactSensitiveData(item);
    }
  }

  return output;
}

export function buildRequestActor(req) {
  const rawIp = String(req?.ip || req?.socket?.remoteAddress || "");
  const userAgent = String(req?.headers?.["user-agent"] || "").slice(0, 180);
  const rawSessionId = String(req?.headers?.["x-agent-session-id"] || "").replace(/[^a-zA-Z0-9_-]/g, "");

  return {
    sessionId: rawSessionId.slice(0, 64) || "unknown",
    ipHash: crypto.createHash("sha256").update(rawIp).digest("hex").slice(0, 16),
    userAgent
  };
}

export function createUsageEvent({ type, status, actor, durationMs, detail }) {
  return {
    id: `evt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
    createdAt: new Date().toISOString(),
    type,
    status,
    actor: redactSensitiveData(actor || {}),
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : undefined,
    detail: redactSensitiveData(detail || {})
  };
}

export async function appendUsageEvent(logFile, eventInput) {
  const event = createUsageEvent(eventInput);
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readUsageEvents(logFile, { limit = 80 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 300);
  let raw = "";
  try {
    raw = await fs.readFile(logFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse()
    .slice(0, safeLimit);
}

export function summarizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => ({
    name: step.name,
    status: step.status,
    command: step.command,
    detail: step.detail,
    durationMs: step.durationMs,
    outputPreview: typeof step.output === "string" ? step.output.slice(0, 1000) : undefined
  }));
}
