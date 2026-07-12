import test from "node:test";
import assert from "node:assert/strict";

import {
  loadConversationHistory,
  prepareConversationSubmission,
  saveConversationHistory
} from "../src/conversationStore.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test("prepareConversationSubmission trims the prompt and clears the composer draft", () => {
  const submission = prepareConversationSubmission("  build a safe ticket notifier  ", {
    id: "turn-1",
    createdAt: "2026-07-12T00:00:00.000Z"
  });

  assert.equal(submission.prompt, "build a safe ticket notifier");
  assert.equal(submission.draft, "");
  assert.equal(submission.turn.status, "loading");
});

test("conversation history persists complete generated results and keeps newest turns", () => {
  const storage = createMemoryStorage();
  const turns = [1, 2, 3].map((number) => ({
    id: `turn-${number}`,
    prompt: `prompt ${number}`,
    status: "done",
    createdAt: `2026-07-12T00:00:0${number}.000Z`,
    result: {
      title: `result ${number}`,
      files: [{ path: "src/main.js", content: `export const value = ${number};` }]
    }
  }));

  saveConversationHistory(turns, storage, { maxTurns: 2, maxChars: 100_000 });
  const restored = loadConversationHistory(storage);

  assert.deepEqual(restored.map((turn) => turn.id), ["turn-2", "turn-3"]);
  assert.equal(restored[1].result.files[0].content, "export const value = 3;");
});

test("loading turns become an interrupted error after a page reload", () => {
  const storage = createMemoryStorage({
    "agent-conversation-history-v1": JSON.stringify([
      {
        id: "turn-loading",
        prompt: "unfinished request",
        status: "loading",
        createdAt: "2026-07-12T00:00:00.000Z"
      }
    ])
  });

  const restored = loadConversationHistory(storage);

  assert.equal(restored[0].status, "error");
  assert.match(restored[0].error, /刷新|中断/);
});

test("saving an in-flight turn preserves loading until the next page load", () => {
  const storage = createMemoryStorage();
  saveConversationHistory([
    {
      id: "turn-active",
      prompt: "active request",
      status: "loading",
      createdAt: "2026-07-12T00:00:00.000Z"
    }
  ], storage);

  const persisted = JSON.parse(storage.getItem("agent-conversation-history-v1"));
  assert.equal(persisted[0].status, "loading");
  assert.equal(loadConversationHistory(storage)[0].status, "error");
});
