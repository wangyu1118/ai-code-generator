import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommentPolicyInstructions,
  buildCommentSafetyRequirements,
  hasCommentCoverageFinding,
  normalizeCommentMode
} from "../server/commentPolicy.js";

test("section comment mode produces concise block-level annotation rules", () => {
  const instructions = buildCommentPolicyInstructions("section");

  assert.match(instructions, /section-level comments/i);
  assert.match(instructions, /logical block/i);
  assert.match(instructions, /not add a comment to every line/i);
  assert.match(instructions, /idiomatic comment syntax/i);
});

test("comment safety requirements are added when comments are enabled", () => {
  assert.equal(normalizeCommentMode("anything-else"), "section");
  assert.equal(normalizeCommentMode("off"), "off");

  const requirements = buildCommentSafetyRequirements("section").join("\n");
  assert.match(requirements, /段落级注释/);
  assert.match(requirements, /不要逐行复述语法/);
});

test("comment-related review findings trigger automatic correction", () => {
  assert.equal(hasCommentCoverageFinding("missing section-level comments in src/app.js"), true);
  assert.equal(hasCommentCoverageFinding("缺少关键业务函数的注释说明"), true);
  assert.equal(hasCommentCoverageFinding("dependency version is missing"), false);
});
