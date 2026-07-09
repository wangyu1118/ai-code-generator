import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendUsageEvent,
  buildRequestActor,
  readUsageEvents,
  redactSensitiveData,
  summarizeGeneratedFiles
} from "../server/usageLog.js";

test("redactSensitiveData removes API keys while keeping useful debugging context", () => {
  const redacted = redactSensitiveData({
    apiKey: "sk-secret",
    nested: {
      token: "abc",
      prompt: "build a comic reader"
    },
    files: [
      { path: "src/main.jsx", content: "large code", language: "JavaScript" }
    ]
  });

  assert.equal(redacted.apiKey, "[redacted]");
  assert.equal(redacted.nested.token, "[redacted]");
  assert.equal(redacted.nested.prompt, "build a comic reader");
  assert.deepEqual(redacted.files, [{ path: "src/main.jsx", language: "JavaScript", bytes: 10 }]);
});

test("appendUsageEvent stores jsonl events and readUsageEvents returns newest first", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-usage-test-"));
  const logFile = path.join(tempDir, "events.jsonl");

  await appendUsageEvent(logFile, { type: "generate", status: "ok", detail: { title: "one" } });
  await appendUsageEvent(logFile, { type: "apk.package", status: "failed", detail: { error: "Gradle failed" } });

  const events = await readUsageEvents(logFile, { limit: 5 });
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "apk.package");
  assert.equal(events[0].detail.error, "Gradle failed");
  assert.match(events[0].id, /^evt_/);
  assert.match(events[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("buildRequestActor hashes network identity and keeps session id", () => {
  const actor = buildRequestActor({
    ip: "127.0.0.1",
    headers: {
      "user-agent": "Mozilla Test Browser",
      "x-agent-session-id": "session-1234567890"
    }
  });

  assert.equal(actor.sessionId, "session-1234567890");
  assert.equal(actor.userAgent, "Mozilla Test Browser");
  assert.notEqual(actor.ipHash, "127.0.0.1");
  assert.equal(actor.ipHash.length, 16);
});

test("summarizeGeneratedFiles keeps paths and sizes without full source code", () => {
  const files = summarizeGeneratedFiles([
    { path: "src/main.jsx", language: "JavaScript", content: "console.log(1)" },
    { path: "README.md", language: "Markdown", content: "# Demo" }
  ]);

  assert.deepEqual(files, [
    { path: "src/main.jsx", language: "JavaScript", bytes: 14 },
    { path: "README.md", language: "Markdown", bytes: 6 }
  ]);
});

test("redactSensitiveData preserves already summarized file byte sizes", () => {
  const redacted = redactSensitiveData({
    files: [{ path: "src/main.jsx", language: "JavaScript", bytes: 1234 }]
  });

  assert.deepEqual(redacted.files, [{ path: "src/main.jsx", language: "JavaScript", bytes: 1234 }]);
});
