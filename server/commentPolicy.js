export function normalizeCommentMode(value) {
  return value === "off" ? "off" : "section";
}

export function buildCommentPolicyInstructions(commentMode) {
  if (normalizeCommentMode(commentMode) === "off") {
    return "Code comment policy: the user disabled automatic comments. Only add comments when they prevent real confusion.";
  }

  return [
    "Code comment policy:",
    "- Add concise section-level comments in every generated source and test file.",
    "- Place a short comment before each logical block: imports/setup, configuration, state/data model, validation, core function/class/component, side effects, I/O boundaries, error handling, tests, and exports.",
    "- Comments must explain what the block is responsible for or why it exists, not restate obvious syntax.",
    "- Do not add a comment to every line. Prefer one useful comment per logical block.",
    "- Use idiomatic comment syntax for the selected language and keep comments accurate after edits.",
    "- Generated notes or selfCheck must mention that section-level code comments were applied."
  ].join("\n");
}

export function buildCommentSafetyRequirements(commentMode) {
  if (normalizeCommentMode(commentMode) === "off") return [];

  return [
    "为每个生成文件加入段落级注释，说明每个逻辑代码块负责什么。",
    "注释要解释意图、边界、状态流转或副作用，不要逐行复述语法。",
    "自检清单必须确认注释覆盖了主要函数、组件、测试和关键分支。"
  ];
}

export function hasCommentCoverageFinding(finding) {
  const text = String(finding || "").toLowerCase();
  return (
    text.includes("comment") ||
    text.includes("annotation") ||
    text.includes("section-level") ||
    text.includes("注释") ||
    text.includes("说明")
  );
}

export function makeCommentedMockContent(language) {
  if (String(language || "").toLowerCase().includes("python")) {
    return [
      "# Entry point: keeps the generated demo runnable from the command line.",
      "def main():",
      "    # Demo behavior: prints a visible result so the user can verify execution quickly.",
      "    print(\"Hello from your generated app\")",
      "",
      "",
      "# Script guard: only runs the demo when this file is executed directly.",
      "if __name__ == \"__main__\":",
      "    main()",
      ""
    ].join("\n");
  }

  return [
    "// Runtime entry: exposes the generated demo behavior for reuse and tests.",
    "export function run() {",
    "  // Demo behavior: prints a visible result so the user can verify execution quickly.",
    "  console.log(\"Hello from your generated app\");",
    "}",
    "",
    "// Local launch: runs the demo when this file is executed directly.",
    "run();",
    ""
  ].join("\n");
}

export function makeCommentedMockTestContent(language) {
  if (String(language || "").toLowerCase().includes("python")) {
    return [
      "# Test import: loads the public entry point the user will run.",
      "from main import main",
      "",
      "",
      "# Contract check: verifies the generated entry point exists and is callable.",
      "def test_main_exists():",
      "    assert callable(main)",
      ""
    ].join("\n");
  }

  return [
    "// Test import: loads the public function exported by the generated module.",
    "import { run } from \"./main.js\";",
    "",
    "// Contract check: verifies the generated entry point exists and can be called by users.",
    "test(\"run exists\", () => {",
    "  expect(typeof run).toBe(\"function\");",
    "});",
    ""
  ].join("\n");
}
