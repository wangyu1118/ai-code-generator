const ticketContextPattern = /抢票|购票|余票|票务|票档|场次|ticket|booking/i;

const highRiskRules = [
  {
    id: "bypass-platform-controls",
    pattern: /(绕过|规避|破解|跳过).*(验证码|排队|登录|鉴权|风控|反爬|限流|购买限制|购票数量)|\b(bypass|evade|circumvent|skip)\b.*\b(captcha|queues?|login|authentication|anti-bot|risk controls?|rate limits?|purchase limits?)\b/i
  },
  {
    id: "unlimited-request-rate",
    pattern: /(不限制|无限).{0,12}(查询|轮询|请求|频率)|高频.{0,8}(轮询|查询|请求)|\b(unlimited|unbounded|no rate limit).{0,24}(polling|queries|requests?|frequency)|\bhigh[- ]frequency.{0,16}(polling|queries|requests?)/i
  },
  {
    id: "third-party-concurrency",
    pattern: /(高并发|大量并发).{0,16}(第三方|网站|平台)|第三方.{0,16}(高并发|大量并发)|\bhigh[- ]concurrency.{0,32}(third[- ]party|websites?|platforms?)|\bthird[- ]party.{0,32}high[- ]concurrency/i
  },
  {
    id: "account-or-limit-evasion",
    pattern: /(多账号|账号池|代理池|更换 IP|伪装浏览器).*(抢票|购票|绕过|规避|限制)/i
  }
];

const safeTicketOverride = [
  "Mandatory safety scope for this ticketing request:",
  "- Only use APIs and test environments the user owns or is explicitly authorized to access.",
  "- Apply conservative rate limits, honor Retry-After, and use bounded exponential backoff with jitter.",
  "- Do not bypass CAPTCHA, queues, login, authentication, anti-bot controls, risk controls, or purchase limits.",
  "- Do not generate high-concurrency traffic against third-party services.",
  "- Default to dry-run and an availability notification; require explicit manual confirmation before a real purchase.",
  "- Keep idempotency, duplicate-order prevention, audit logging, secret redaction, and classified error handling."
].join("\n");

export function applyRequestSafetyPolicy(value) {
  const brief = typeof value === "string" ? value.trim() : "";
  if (!brief || !ticketContextPattern.test(brief)) {
    return { applied: false, effectiveBrief: brief, findings: [] };
  }

  const findings = highRiskRules.filter((rule) => rule.pattern.test(brief)).map((rule) => rule.id);
  if (!findings.length) {
    return { applied: false, effectiveBrief: brief, findings: [] };
  }

  const safeLines = brief
    .split(/\r?\n/)
    .filter((line) => !highRiskRules.some((rule) => rule.pattern.test(line)))
    .join("\n")
    .trim();

  return {
    applied: true,
    effectiveBrief: `${safeLines}\n\n${safeTicketOverride}`,
    findings
  };
}
