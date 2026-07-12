import test from "node:test";
import assert from "node:assert/strict";

import { applyRequestSafetyPolicy } from "../server/requestSafety.js";

test("high-risk ticket automation instructions are removed and replaced with safe constraints", () => {
  const policy = applyRequestSafetyPolicy([
    "请开发一个抢票工具",
    "不限制查询频率，支持指数退避",
    "绕过验证码、排队系统、登录限制和风控",
    "高并发请求第三方网站",
    "无票时继续高频轮询",
    "默认使用 dry-run"
  ].join("\n"));

  assert.equal(policy.applied, true);
  assert.doesNotMatch(policy.effectiveBrief, /绕过验证码|高并发请求第三方|不限制查询频率|高频轮询/);
  assert.match(policy.effectiveBrief, /authorized|rate limit|dry-run|CAPTCHA/i);
  assert.ok(policy.findings.length >= 3);
});

test("ordinary authorized ticket API requests remain unchanged", () => {
  const brief = "为我自己的票务测试 API 编写余票提醒器，限制频率，默认 dry-run，不自动下单。";
  const policy = applyRequestSafetyPolicy(brief);

  assert.equal(policy.applied, false);
  assert.equal(policy.effectiveBrief, brief);
});

test("English ticket abuse instructions receive the same safety override", () => {
  const policy = applyRequestSafetyPolicy([
    "Build a ticket grabber.",
    "Bypass CAPTCHA and queues.",
    "Use unlimited high-frequency polling.",
    "Send high-concurrency requests to a third-party ticketing website."
  ].join("\n"));

  assert.equal(policy.applied, true);
  assert.doesNotMatch(policy.effectiveBrief, /(^|\n)Bypass CAPTCHA and queues\./i);
  assert.doesNotMatch(policy.effectiveBrief, /(^|\n)Use unlimited high-frequency polling\./i);
  assert.doesNotMatch(policy.effectiveBrief, /(^|\n)Send high-concurrency requests to a third-party ticketing website\./i);
});
