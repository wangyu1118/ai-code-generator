export const CONVERSATION_STORAGE_KEY = "agent-conversation-history-v1";

const DEFAULT_MAX_TURNS = 12;
const DEFAULT_MAX_CHARS = 3_500_000;

function createTurnId() {
  if (globalThis.crypto?.randomUUID) return `turn-${globalThis.crypto.randomUUID()}`;
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTurn(value, { interruptLoading = false } = {}) {
  if (!value || typeof value !== "object") return null;
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt) return null;

  const status = value.status === "done" || value.status === "error" ? value.status : "loading";
  const turn = {
    id: typeof value.id === "string" && value.id ? value.id : createTurnId(),
    prompt,
    status,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString()
  };

  if (value.result && typeof value.result === "object") turn.result = value.result;
  if (typeof value.error === "string" && value.error) turn.error = value.error;

  if (turn.status === "loading" && interruptLoading) {
    turn.status = "error";
    turn.error = "页面刷新或关闭中断了上一次生成，请重新发送该需求。";
  }

  return turn;
}

export function limitConversationHistory(
  turns,
  { maxTurns = DEFAULT_MAX_TURNS, maxChars = DEFAULT_MAX_CHARS } = {}
) {
  let retained = (Array.isArray(turns) ? turns : [])
    .map(normalizeTurn)
    .filter(Boolean)
    .slice(-Math.max(1, maxTurns));

  while (retained.length > 1 && JSON.stringify(retained).length > maxChars) {
    retained = retained.slice(1);
  }

  return retained;
}

export function loadConversationHistory(storage = globalThis.localStorage) {
  if (!storage?.getItem) return [];
  try {
    const parsed = JSON.parse(storage.getItem(CONVERSATION_STORAGE_KEY) || "[]");
    return limitConversationHistory(parsed).map((turn) => normalizeTurn(turn, { interruptLoading: true }));
  } catch {
    return [];
  }
}

export function saveConversationHistory(turns, storage = globalThis.localStorage, options = {}) {
  const retained = limitConversationHistory(turns, options);
  if (!storage?.setItem) return retained;

  let candidate = retained;
  while (candidate.length) {
    try {
      storage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(candidate));
      return candidate;
    } catch {
      candidate = candidate.slice(1);
    }
  }

  try {
    storage.setItem(CONVERSATION_STORAGE_KEY, "[]");
  } catch {
    // Storage can be disabled by browser privacy settings; the in-memory chat still works.
  }
  return [];
}

export function prepareConversationSubmission(value, { id = createTurnId(), createdAt = new Date().toISOString() } = {}) {
  const prompt = typeof value === "string" ? value.trim() : "";
  if (!prompt) return null;
  return {
    prompt,
    draft: "",
    turn: {
      id,
      prompt,
      status: "loading",
      createdAt
    }
  };
}
