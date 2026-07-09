import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8787);

const app = express();
app.use(express.json({ limit: "1mb" }));

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const SANDBOX_ROOT = path.join(rootDir, ".sandbox-runs");
const APK_ROOT = path.join(rootDir, ".apk-runs");
const MAX_SANDBOX_FILES = 80;
const MAX_SANDBOX_TOTAL_BYTES = 600_000;
const MAX_SANDBOX_FILE_BYTES = 140_000;

const GITHUB_PROJECT_LIBRARY = [
  {
    id: "vercel-coding-agent-template",
    name: "vercel-labs/coding-agent-template",
    url: "https://github.com/vercel-labs/coding-agent-template",
    category: "agent-architecture",
    license: "Repository license file",
    useWhen: ["coding agent", "multi-agent tasks", "repository automation", "sandbox execution"],
    guidance:
      "Borrow the product pattern: task-centric agent sessions, explicit execution trace, per-user settings, and isolated sandbox execution. Do not copy Vercel-specific auth/database code unless requested."
  },
  {
    id: "ionic-capacitor",
    name: "ionic-team/capacitor",
    url: "https://github.com/ionic-team/capacitor",
    category: "apk-packaging",
    license: "MIT",
    useWhen: ["APK", "Android", "mobile app", "wrap web app", "React/Vite app to native"],
    guidance:
      "For web apps that need APK output, generate Capacitor-friendly structure: package.json build script, capacitor.config, dist webDir, Android platform commands, and debug APK notes."
  },
  {
    id: "react-vite-capacitor-starter",
    name: "Mohit-wednesday/react-vite-capacitor",
    url: "https://github.com/Mohit-wednesday/react-vite-capacitor",
    category: "template-pattern",
    license: "Unverified on page; use as structural reference only",
    useWhen: ["React", "Vite", "Capacitor", "mobile starter", "APK demo"],
    guidance:
      "Use as a light structural reference for React + Vite + Capacitor: src, public, index.html, vite config, capacitor config, android folder, and run/build/open scripts."
  },
  {
    id: "deepseek-awesome-agent",
    name: "deepseek-ai/awesome-deepseek-agent",
    url: "https://github.com/deepseek-ai/awesome-deepseek-agent",
    category: "deepseek-agent-patterns",
    license: "Reference index",
    useWhen: ["DeepSeek", "agent skills", "coding assistant", "tool mode"],
    guidance:
      "Use the listed DeepSeek agent ecosystem as behavior inspiration: agent skills, tool calling, multi-turn coding, terminal-style workflows, and explicit model settings."
  },
  {
    id: "awesome-agent-sandboxes",
    name: "dloss/awesome-agent-sandboxes",
    url: "https://github.com/dloss/awesome-agent-sandboxes",
    category: "sandbox-safety",
    license: "CC0-1.0",
    useWhen: ["sandbox", "run generated code", "untrusted code", "security"],
    guidance:
      "Use as a safety checklist: prefer VM/microVM/container isolation for untrusted code at scale; local process sandbox is demo-only and must be clearly labeled."
  }
];

function formatGithubProjectLibrary() {
  return GITHUB_PROJECT_LIBRARY.map((project) => {
    return [
      `- ${project.name} (${project.url})`,
      `  category: ${project.category}`,
      `  license: ${project.license}`,
      `  useWhen: ${project.useWhen.join(", ")}`,
      `  guidance: ${project.guidance}`
    ].join("\n");
  }).join("\n");
}

function cleanString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 6000) : fallback;
}

function normalizeDeepSeekBaseUrl(value) {
  const baseUrl = cleanString(value, DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  if (!/^https:\/\/api\.deepseek\.com(\/.*)?$/.test(baseUrl)) {
    return DEFAULT_DEEPSEEK_BASE_URL;
  }
  return baseUrl;
}

function validateResultShape(value) {
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value.files) || value.files.length === 0) return false;
  return value.files.every((file) => {
    return (
      file &&
      typeof file.path === "string" &&
      typeof file.language === "string" &&
      typeof file.content === "string" &&
      typeof file.explanation === "string"
    );
  });
}

function inferMockStack({ brief, language, framework }) {
  const text = `${brief} ${language} ${framework}`.toLowerCase();
  if (text.includes("python") || text.includes("爬虫") || text.includes("csv")) {
    return { language: "Python", framework: "Python CLI" };
  }
  if (text.includes("api") || text.includes("express") || text.includes("jwt") || text.includes("后端")) {
    return { language: "JavaScript", framework: "Node.js + Express" };
  }
  if (text.includes("react") || text.includes("网页") || text.includes("组件") || text.includes("前端")) {
    return { language: "JavaScript", framework: "React + Vite" };
  }
  return { language: "JavaScript", framework: "Node.js + Express" };
}

function makeMockResult({ brief, language, framework, includeTests }) {
  const inferred = inferMockStack({ brief, language, framework });
  const lang = !language || language === "auto" ? inferred.language : language;
  const chosenFramework = !framework || framework === "auto" ? inferred.framework : framework;
  const filePath = lang.toLowerCase().includes("python") ? "main.py" : "src/main.js";
  const content = lang.toLowerCase().includes("python")
    ? `def main():\n    print("Hello from your generated app")\n\n\nif __name__ == "__main__":\n    main()\n`
    : `export function run() {\n  console.log("Hello from your generated app");\n}\n\nrun();\n`;

  const files = [
    {
      path: filePath,
      language: lang,
      content,
      explanation: `根据需求“${brief.slice(0, 80)}”生成的入门实现。`
    }
  ];

  if (includeTests) {
    files.push({
      path: lang.toLowerCase().includes("python") ? "test_main.py" : "src/main.test.js",
      language: lang,
      content: lang.toLowerCase().includes("python")
        ? `from main import main\n\n\ndef test_main_exists():\n    assert callable(main)\n`
        : `import { run } from "./main.js";\n\ntest("run exists", () => {\n  expect(typeof run).toBe("function");\n});\n`,
      explanation: "简单测试骨架，接入真实测试框架后可继续扩展。"
    });
  }

  return {
    title: `${chosenFramework || lang} 代码生成草稿`,
    summary: `当前没有检测到 DeepSeek API Key，因此返回本地模拟结果。Agent 已根据需求自动选择 ${chosenFramework || lang}。`,
    files,
    commands: lang.toLowerCase().includes("python") ? ["python main.py"] : ["node src/main.js"],
    notes: ["打开 API 设置，填入 DeepSeek API Key 后再生成。"],
    agentTrace: [
      { step: "分析需求", status: "done", detail: `已读取需求：${brief.slice(0, 80)}` },
      { step: "选择技术栈", status: "done", detail: `模拟模式下选择 ${chosenFramework || lang}。` },
      { step: "规划实现", status: "done", detail: "模拟模式下生成基础文件计划。" },
      { step: "生成代码", status: "done", detail: includeTests ? "已包含测试骨架。" : "已生成核心实现。" },
      { step: "自检", status: "done", detail: "真实自检需要启用 DeepSeek API Key。" }
    ],
    selfCheck: ["模拟模式仅验证界面流程。", "真实 Agent 模式会执行规划、生成和自检三段流程。"]
  };
}

function parseModelText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("模型返回内容不是可解析的 JSON。");
    }
    return JSON.parse(match[0]);
  }
}

async function createJsonCompletion({ client, model, messages, maxTokens = 8192, repairAttempts = 1 }) {
  const completion = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
    max_tokens: maxTokens,
    stream: false
  });

  const content = completion.choices?.[0]?.message?.content || "";
  try {
    return parseModelText(content);
  } catch (error) {
    if (repairAttempts <= 0) {
      throw new Error(`Model returned invalid or incomplete JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    const repaired = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Repair the provided invalid or incomplete JSON into one valid compact JSON object. Return JSON only. Preserve the intended schema and keep file contents concise."
        },
        {
          role: "user",
          content: content.slice(0, 45000)
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: Math.min(maxTokens, 8192),
      stream: false
    });

    return parseModelText(repaired.choices?.[0]?.message?.content || "");
  }
}

function normalizeGeneratedResult(result) {
  if (!validateResultShape(result)) {
    throw new Error("模型 JSON 缺少必要字段。");
  }

  return {
    title: cleanString(result.title, "DeepSeek 代码生成结果"),
    summary: cleanString(result.summary, "已生成代码文件。"),
    files: result.files,
    commands: Array.isArray(result.commands) ? result.commands : [],
    notes: Array.isArray(result.notes) ? result.notes : [],
    agentTrace: Array.isArray(result.agentTrace) && result.agentTrace.length ? result.agentTrace : [
      { step: "生成结果", status: "done", detail: "模型未返回详细轨迹，后端已补齐基础轨迹。" }
    ],
    selfCheck: Array.isArray(result.selfCheck) && result.selfCheck.length ? result.selfCheck : [
      "模型未返回 selfCheck，后端已补齐；建议继续运行沙箱检查。"
    ]
  };
}

function safeSandboxRelativePath(inputPath) {
  const rawPath = cleanString(inputPath).replace(/\\/g, "/");
  if (!rawPath || rawPath.includes("\0") || path.isAbsolute(rawPath) || /^[a-zA-Z]:/.test(rawPath)) {
    return null;
  }

  const normalized = path.posix.normalize(rawPath);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized === ".env" ||
    normalized.endsWith("/.env")
  ) {
    return null;
  }

  return normalized;
}

function truncateOutput(value, max = 5000) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n... output truncated ...` : text;
}

function createSandboxEnv() {
  const env = {
    PATH: process.env.PATH || "",
    Path: process.env.Path || process.env.PATH || "",
    SystemRoot: process.env.SystemRoot || "",
    WINDIR: process.env.WINDIR || "",
    COMSPEC: process.env.COMSPEC || process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    ComSpec: process.env.ComSpec || process.env.COMSPEC || "C:\\Windows\\System32\\cmd.exe",
    TEMP: process.env.TEMP || os.tmpdir(),
    TMP: process.env.TMP || os.tmpdir(),
    NODE_ENV: "test",
    CI: "true",
    npm_config_ignore_scripts: "true",
    npm_config_audit: "false",
    npm_config_fund: "false"
  };

  for (const key of ["ANDROID_HOME", "ANDROID_SDK_ROOT", "JAVA_HOME"]) {
    if (process.env[key]) env[key] = process.env[key];
  }

  return env;
}

function runSandboxCommand({ command, args, cwd, timeoutMs = 10_000 }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const safeArgs = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
    const displayCommand = [command, ...safeArgs].join(" ");
    if (!command || typeof command !== "string") {
      resolve({
        command: displayCommand,
        status: "failed",
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: "Invalid command."
      });
      return;
    }

    let spawnCommand = command;
    let spawnArgs = safeArgs;
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
      spawnCommand = process.env.COMSPEC || process.env.ComSpec || "cmd.exe";
      spawnArgs = ["/d", "/s", "/c", command, ...safeArgs];
    }

    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    let child;
    try {
      child = spawn(spawnCommand, spawnArgs, {
        cwd,
        env: createSandboxEnv(),
        windowsHide: true,
        shell: false
      });
    } catch (error) {
      finish({
        command: displayCommand,
        status: "failed",
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: truncateOutput(error instanceof Error ? error.message : String(error))
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          windowsHide: true,
          stdio: "ignore"
        }).on("error", () => {
          child.kill("SIGKILL");
        });
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        command: displayCommand,
        status: "failed",
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: truncateOutput(`${stdout}\n${stderr}\n${error.message}`)
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        command: displayCommand,
        status: timedOut ? "timeout" : code === 0 ? "passed" : "failed",
        exitCode: code,
        durationMs: Date.now() - startedAt,
        output: truncateOutput(`${stdout}${stderr ? `\n${stderr}` : ""}`)
      });
    });
  });
}

function looksLikeJsx(content) {
  return /<[A-Z][A-Za-z0-9]*[\s>/]/.test(content) || /<[a-z]+[\s\S]*>[\s\S]*<\/[a-z]+>/.test(content);
}

async function writeSandboxFiles(files, runDir) {
  let totalBytes = 0;
  const writtenFiles = [];

  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("没有可执行的生成文件。");
  }

  if (files.length > MAX_SANDBOX_FILES) {
    throw new Error(`文件数量过多，最多允许 ${MAX_SANDBOX_FILES} 个文件。`);
  }

  for (const file of files) {
    const relativePath = safeSandboxRelativePath(file.path);
    if (!relativePath) {
      throw new Error(`不安全的文件路径：${file.path}`);
    }

    const content = typeof file.content === "string" ? file.content : "";
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_SANDBOX_FILE_BYTES) {
      throw new Error(`单个文件过大：${relativePath}`);
    }

    totalBytes += bytes;
    if (totalBytes > MAX_SANDBOX_TOTAL_BYTES) {
      throw new Error("生成文件总大小超过沙箱限制。");
    }

    const targetPath = path.resolve(runDir, relativePath);
    if (!targetPath.startsWith(runDir + path.sep)) {
      throw new Error(`文件路径越界：${relativePath}`);
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");
    writtenFiles.push({ ...file, safePath: relativePath, absolutePath: targetPath });
  }

  return writtenFiles;
}

function findPackageDirs(writtenFiles, runDir) {
  return writtenFiles
    .filter((file) => file.safePath.endsWith("package.json"))
    .map((file) => path.dirname(path.resolve(runDir, file.safePath)));
}

async function readPackageJson(packageDir) {
  try {
    const raw = await fs.readFile(path.join(packageDir, "package.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getPackageDeps(packageJson) {
  return {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {})
  };
}

function packageHasDependency(packageJson, name) {
  return Boolean(getPackageDeps(packageJson)[name]);
}

async function findFilesByExtension(dir, extension, maxDepth = 8) {
  const matches = [];

  async function walk(currentDir, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        await walk(entryPath, depth + 1);
      } else if (entry.name.toLowerCase().endsWith(extension)) {
        matches.push(entryPath);
      }
    }
  }

  await walk(dir, 0);
  return matches;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function commandName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function runGradleAssemble({ projectDir, steps, label }) {
  const windowsWrapper = path.join(projectDir, "gradlew.bat");
  const unixWrapper = path.join(projectDir, "gradlew");
  const wrapperProperties = path.join(projectDir, "gradle", "wrapper", "gradle-wrapper.properties");
  if (await fileExists(wrapperProperties)) {
    try {
      let properties = await fs.readFile(wrapperProperties, "utf8");
      properties = properties.replace(/gradle-([0-9.]+)-all\.zip/g, "gradle-$1-bin.zip");
      if (/networkTimeout=/.test(properties)) {
        properties = properties.replace(/networkTimeout=\d+/g, "networkTimeout=120000");
      } else {
        properties = `${properties.trimEnd()}\nnetworkTimeout=120000\n`;
      }
      await fs.writeFile(wrapperProperties, properties, "utf8");
      steps.push({
        name: `优化 Gradle Wrapper ${label}`,
        status: "passed",
        detail: "已将 Gradle 分发包改为 bin，并把下载超时提高到 120 秒。"
      });
    } catch (error) {
      steps.push({
        name: `优化 Gradle Wrapper ${label}`,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }
  let command;
  let args;

  if (process.platform === "win32" && (await fileExists(windowsWrapper))) {
    command = "cmd.exe";
    args = ["/c", "gradlew.bat", "assembleDebug"];
  } else if (await fileExists(unixWrapper)) {
    command = process.platform === "win32" ? "bash" : "./gradlew";
    args = process.platform === "win32" ? ["gradlew", "assembleDebug"] : ["assembleDebug"];
  } else {
    command = process.platform === "win32" ? "gradle.bat" : "gradle";
    args = ["assembleDebug"];
  }

  const result = await runSandboxCommand({
    command,
    args,
    cwd: projectDir,
    timeoutMs: 240_000
  });

  steps.push({
    name: `Gradle 打包 APK ${label}`,
    status: result.status,
    command: result.command,
    output: result.output,
    durationMs: result.durationMs
  });

  return result.status === "passed";
}

async function checkAndroidBuildEnvironment({ steps, warnings }) {
  const javaResult = await runSandboxCommand({
    command: "java",
    args: ["-version"],
    cwd: rootDir,
    timeoutMs: 10_000
  });
  steps.push({
    name: "JDK 环境预检",
    status: javaResult.status,
    command: javaResult.command,
    output: javaResult.output,
    durationMs: javaResult.durationMs
  });

  const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  const sdkExists = sdkDir ? await fileExists(sdkDir) : false;
  const platformToolsExists = sdkExists ? await fileExists(path.join(sdkDir, "platform-tools")) : false;
  const platformsExists = sdkExists ? await fileExists(path.join(sdkDir, "platforms")) : false;
  const sdkOk = Boolean(sdkExists && platformToolsExists && platformsExists);
  steps.push({
    name: "Android SDK 环境预检",
    status: sdkOk ? "passed" : "failed",
    detail: sdkDir
      ? `ANDROID_HOME/ANDROID_SDK_ROOT=${sdkDir}；platform-tools=${platformToolsExists}；platforms=${platformsExists}`
      : "未设置 ANDROID_HOME 或 ANDROID_SDK_ROOT。"
  });

  if (javaResult.status !== "passed") {
    warnings.push("缺少 JDK：请安装 JDK 17 或兼容版本，并确保 java 在 PATH 中可用。");
  }
  if (!sdkOk) {
    warnings.push("缺少 Android SDK：请安装 Android SDK Platform、Platform Tools，并设置 ANDROID_HOME 或 ANDROID_SDK_ROOT。");
  }

  return javaResult.status === "passed" && sdkOk;
}

async function runApkPackaging({ files, allowInstall = false }) {
  const runId = `apk-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const runDir = path.resolve(APK_ROOT, runId);
  if (!runDir.startsWith(APK_ROOT + path.sep)) {
    throw new Error("APK 打包目录解析失败。");
  }

  await fs.mkdir(runDir, { recursive: true });
  const writtenFiles = await writeSandboxFiles(files, runDir);
  const steps = [
    {
      name: "创建 APK 隔离目录",
      status: "passed",
      detail: runDir
    },
    {
      name: "文件安全校验",
      status: "passed",
      detail: `已写入 ${writtenFiles.length} 个文件，拒绝绝对路径、路径越界、.env 和 node_modules。`
    }
  ];
  const warnings = [];

  const safePaths = new Set(writtenFiles.map((file) => file.safePath));
  const hasAndroidProject =
    safePaths.has("settings.gradle") ||
    safePaths.has("settings.gradle.kts") ||
    writtenFiles.some((file) => file.safePath.startsWith("app/") && /build\.gradle(\.kts)?$/.test(file.safePath)) ||
    writtenFiles.some((file) => file.safePath.startsWith("android/") && /settings\.gradle(\.kts)?$/.test(file.safePath));

  const packageDirs = findPackageDirs(writtenFiles, runDir);
  const packageInfos = [];
  for (const packageDir of packageDirs.slice(0, 4)) {
    packageInfos.push({
      dir: packageDir,
      relativeDir: path.relative(runDir, packageDir) || ".",
      packageJson: await readPackageJson(packageDir)
    });
  }

  const appPackage =
    packageInfos.find((item) => item.packageJson && packageHasDependency(item.packageJson, "expo")) ||
    packageInfos.find((item) => item.packageJson && packageHasDependency(item.packageJson, "@capacitor/core")) ||
    packageInfos.find((item) => item.packageJson?.scripts?.build) ||
    packageInfos.find((item) => item.packageJson);

  let strategy = "unsupported";
  if (hasAndroidProject) {
    strategy = "android-gradle";
  } else if (appPackage?.packageJson && packageHasDependency(appPackage.packageJson, "expo")) {
    strategy = "expo";
  } else if (appPackage?.packageJson) {
    strategy = packageHasDependency(appPackage.packageJson, "@capacitor/core") ? "capacitor-existing" : "capacitor-wrap";
  }

  steps.push({
    name: "Agent 选择 APK 打包策略",
    status: strategy === "unsupported" ? "skipped" : "passed",
    detail:
      strategy === "android-gradle"
        ? "检测到 Android/Gradle 项目，优先执行 assembleDebug。"
        : strategy === "expo"
          ? "检测到 Expo 项目，可通过 EAS 或 prebuild + Gradle 生成 Android 包。"
          : strategy.startsWith("capacitor")
            ? "检测到 Web/Node 项目，选择 Capacitor 将 Web 应用包装为 Android APK。"
            : "当前生成文件缺少 package.json 或 Android/Expo/Capacitor 项目结构，无法自动包装 APK。"
  });

  if (strategy === "unsupported") {
    warnings.push("APK 打包需要 Android Gradle 项目，或包含 package.json 的 Web/Expo/Capacitor 项目。");
    return {
      ok: false,
      runId,
      runDir,
      apkFiles: [],
      strategy,
      steps,
      warnings
    };
  }

  if (strategy === "android-gradle" || allowInstall) {
    const androidEnvReady = await checkAndroidBuildEnvironment({ steps, warnings });
    if (!androidEnvReady) {
      steps.push({
        name: "APK 打包终止",
        status: "failed",
        detail: "Android 构建环境不完整，无法生成可安装 APK。"
      });
      return {
        ok: false,
        runId,
        runDir,
        apkFiles: [],
        strategy,
        steps,
        warnings
      };
    }
  }

  if (strategy === "android-gradle") {
    const androidDir = safePaths.has("android/settings.gradle") || safePaths.has("android/settings.gradle.kts")
      ? path.join(runDir, "android")
      : runDir;
    await runGradleAssemble({ projectDir: androidDir, steps, label: path.relative(runDir, androidDir) || "." });
    const apkFiles = await findFilesByExtension(runDir, ".apk");
    if (!apkFiles.length) {
      warnings.push("未找到 APK 文件。通常是本机缺少 JDK、Android SDK、Gradle，或项目配置不完整。");
    }
    const failed = steps.some((step) => step.status === "failed" || step.status === "timeout");
    return {
      ok: !failed && apkFiles.length > 0,
      runId,
      runDir,
      apkFiles,
      strategy,
      steps,
      warnings
    };
  }

  if (!allowInstall) {
    steps.push({
      name: "依赖安装与 Android 包装",
      status: "skipped",
      detail: "默认不安装新依赖。勾选“沙箱允许安装依赖”后，会在隔离目录中尝试安装 Capacitor/Expo 依赖并构建 APK。"
    });
    warnings.push("未启用依赖安装，因此本次只完成 APK 策略识别，没有联网下载 Capacitor/Expo/Android 依赖。");
    return {
      ok: true,
      runId,
      runDir,
      apkFiles: [],
      strategy,
      steps,
      warnings
    };
  }

  const npmCommand = commandName("npm");
  const npxCommand = commandName("npx");
  const packageDir = appPackage.dir;
  const packageJson = appPackage.packageJson;

  const installArgs = ["install", "--ignore-scripts", "--no-audit", "--no-fund"];
  if (strategy.startsWith("capacitor")) {
    for (const dependency of ["@capacitor/core", "@capacitor/cli", "@capacitor/android"]) {
      if (strategy === "capacitor-wrap" || !packageHasDependency(packageJson, dependency)) {
        installArgs.push(dependency);
      }
    }
  }

  const installResult = await runSandboxCommand({
    command: npmCommand,
    args: installArgs,
    cwd: packageDir,
    timeoutMs: 180_000
  });
  steps.push({
    name: `安装 APK 打包依赖 ${appPackage.relativeDir}`,
    status: installResult.status,
    command: installResult.command,
    output: installResult.output,
    durationMs: installResult.durationMs
  });

  if (installResult.status !== "passed") {
    warnings.push("依赖安装失败，无法继续 APK 打包。");
    return { ok: false, runId, runDir, apkFiles: [], strategy, steps, warnings };
  }

  if (packageJson?.scripts?.build) {
    const buildResult = await runSandboxCommand({
      command: npmCommand,
      args: ["run", "build"],
      cwd: packageDir,
      timeoutMs: 120_000
    });
    steps.push({
      name: `构建 Web 产物 ${appPackage.relativeDir}`,
      status: buildResult.status,
      command: buildResult.command,
      output: buildResult.output,
      durationMs: buildResult.durationMs
    });
    if (buildResult.status !== "passed") {
      warnings.push("Web 构建失败，无法继续包装 APK。");
      return { ok: false, runId, runDir, apkFiles: [], strategy, steps, warnings };
    }
  } else {
    warnings.push("package.json 没有 build 脚本，Capacitor 将使用 dist/www 等已有静态目录；若不存在会失败。");
  }

  if (strategy === "expo") {
    const expoPrebuild = await runSandboxCommand({
      command: npxCommand,
      args: ["expo", "prebuild", "--platform", "android", "--no-install"],
      cwd: packageDir,
      timeoutMs: 180_000
    });
    steps.push({
      name: `Expo 生成 Android 项目 ${appPackage.relativeDir}`,
      status: expoPrebuild.status,
      command: expoPrebuild.command,
      output: expoPrebuild.output,
      durationMs: expoPrebuild.durationMs
    });
  } else {
    const configPath = path.join(packageDir, "capacitor.config.json");
    if (!(await fileExists(configPath))) {
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            appId: "com.generated.agentapp",
            appName: "GeneratedAgentApp",
            webDir: "dist",
            bundledWebRuntime: false
          },
          null,
          2
        ),
        "utf8"
      );
      steps.push({
        name: "写入 Capacitor 配置",
        status: "passed",
        detail: path.relative(runDir, configPath)
      });
    }

    const capAdd = await runSandboxCommand({
      command: npxCommand,
      args: ["cap", "add", "android"],
      cwd: packageDir,
      timeoutMs: 180_000
    });
    steps.push({
      name: `Capacitor 添加 Android 平台 ${appPackage.relativeDir}`,
      status: capAdd.status,
      command: capAdd.command,
      output: capAdd.output,
      durationMs: capAdd.durationMs
    });

    if (capAdd.status === "passed") {
      const capSync = await runSandboxCommand({
        command: npxCommand,
        args: ["cap", "sync", "android"],
        cwd: packageDir,
        timeoutMs: 120_000
      });
      steps.push({
        name: `Capacitor 同步 Android ${appPackage.relativeDir}`,
        status: capSync.status,
        command: capSync.command,
        output: capSync.output,
        durationMs: capSync.durationMs
      });
    }
  }

  const androidProjectDir = path.join(packageDir, "android");
  if (await fileExists(androidProjectDir)) {
    await runGradleAssemble({
      projectDir: androidProjectDir,
      steps,
      label: path.relative(runDir, androidProjectDir)
    });
  } else {
    steps.push({
      name: "Gradle 打包 APK",
      status: "skipped",
      detail: "未生成 android 目录。请检查上一步 Expo/Capacitor 输出。"
    });
  }

  const apkFiles = await findFilesByExtension(runDir, ".apk");
  if (!apkFiles.length) {
    warnings.push("未找到 APK 文件。可能缺少 Android SDK/JDK，或生成代码不是可直接打包的移动/Web 应用。");
  }

  const failed = steps.some((step) => step.status === "failed" || step.status === "timeout");
  return {
    ok: !failed && apkFiles.length > 0,
    runId,
    runDir,
    apkFiles,
    strategy,
    steps,
    warnings
  };
}

async function runSandboxChecks({ files, allowInstall = false }) {
  const runId = `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const runDir = path.resolve(SANDBOX_ROOT, runId);
  if (!runDir.startsWith(SANDBOX_ROOT + path.sep)) {
    throw new Error("沙箱目录解析失败。");
  }

  await fs.mkdir(runDir, { recursive: true });
  const writtenFiles = await writeSandboxFiles(files, runDir);
  const steps = [
    {
      name: "创建隔离目录",
      status: "passed",
      detail: runDir
    },
    {
      name: "文件安全校验",
      status: "passed",
      detail: `已写入 ${writtenFiles.length} 个文件，拒绝绝对路径、路径越界、.env 和 node_modules。`
    }
  ];
  const warnings = [];

  const syntaxCandidates = writtenFiles.filter((file) => {
    return /\.(js|mjs|cjs)$/i.test(file.safePath) && !looksLikeJsx(file.content);
  });
  const skippedJsx = writtenFiles.filter((file) => /\.(jsx|tsx)$/i.test(file.safePath) || (/\.(js|mjs|cjs)$/i.test(file.safePath) && looksLikeJsx(file.content)));

  for (const file of syntaxCandidates.slice(0, 24)) {
    const result = await runSandboxCommand({
      command: process.execPath,
      args: ["--check", file.absolutePath],
      cwd: runDir,
      timeoutMs: 8000
    });
    steps.push({
      name: `语法检查 ${file.safePath}`,
      status: result.status,
      command: result.command,
      output: result.output,
      durationMs: result.durationMs
    });
  }

  if (skippedJsx.length) {
    warnings.push(`跳过 ${skippedJsx.length} 个 JSX/TSX 或含 JSX 的文件；需要构建工具才能完整检查。`);
  }

  const packageDirs = findPackageDirs(writtenFiles, runDir);
  if (!packageDirs.length) {
    warnings.push("未发现 package.json，沙箱只执行了文件与语法层检查。");
  }

  for (const packageDir of packageDirs.slice(0, 3)) {
    const packageJson = await readPackageJson(packageDir);
    const relativePackageDir = path.relative(runDir, packageDir) || ".";
    if (!packageJson) {
      steps.push({
        name: `读取 package.json ${relativePackageDir}`,
        status: "failed",
        detail: "package.json 无法解析。"
      });
      continue;
    }

    if (!allowInstall) {
      steps.push({
        name: `依赖安装 ${relativePackageDir}`,
        status: "skipped",
        detail: "默认禁止联网安装依赖。勾选“允许安装依赖”后会运行 npm install --ignore-scripts。"
      });
      if (packageJson.scripts?.test) {
        steps.push({
          name: `测试 ${relativePackageDir}`,
          status: "skipped",
          detail: "未安装依赖，因此跳过 npm test。"
        });
      }
      continue;
    }

    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const installResult = await runSandboxCommand({
      command: npmCommand,
      args: ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
      cwd: packageDir,
      timeoutMs: 90_000
    });
    steps.push({
      name: `依赖安装 ${relativePackageDir}`,
      status: installResult.status,
      command: installResult.command,
      output: installResult.output,
      durationMs: installResult.durationMs
    });

    if (installResult.status !== "passed") {
      continue;
    }

    if (packageJson.scripts?.test) {
      const testScript = String(packageJson.scripts.test || "").toLowerCase();
      const testArgs = ["test"];
      if (testScript.includes("jest") && !testScript.includes("vitest")) {
        testArgs.push("--", "--runInBand");
      }
      const testResult = await runSandboxCommand({
        command: npmCommand,
        args: testArgs,
        cwd: packageDir,
        timeoutMs: 60_000
      });
      steps.push({
        name: `测试 ${relativePackageDir}`,
        status: testResult.status,
        command: testResult.command,
        output: testResult.output,
        durationMs: testResult.durationMs
      });
    } else {
      steps.push({
        name: `测试 ${relativePackageDir}`,
        status: "skipped",
        detail: "package.json 没有 test 脚本。"
      });
    }
  }

  const failed = steps.some((step) => step.status === "failed" || step.status === "timeout");
  return {
    ok: !failed,
    runId,
    runDir,
    steps,
    warnings
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "deepseek",
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY)
  });
});

app.get("/api/project-library", (_req, res) => {
  res.json({
    ok: true,
    projects: GITHUB_PROJECT_LIBRARY
  });
});

app.post("/api/generate", async (req, res) => {
  const brief = cleanString(req.body.brief);
  const language = cleanString(req.body.language, "JavaScript");
  const framework = cleanString(req.body.framework, "React + Vite");
  const style = cleanString(req.body.style, "production-ready");
  const outputKind = cleanString(req.body.outputKind, "complete feature");
  const qualityMode = cleanString(req.body.qualityMode, "realistic production");
  const agentMode = Boolean(req.body.agentMode);
  const includeTests = Boolean(req.body.includeTests);
  const apiKey = cleanString(req.body.apiKey, process.env.DEEPSEEK_API_KEY || "");
  const model = cleanString(req.body.model, process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL);
  const baseURL = normalizeDeepSeekBaseUrl(req.body.baseUrl || process.env.DEEPSEEK_BASE_URL);

  if (!brief) {
    res.status(400).json({ error: "请先输入你想生成的软件需求。" });
    return;
  }

  if (!apiKey) {
    res.json(makeMockResult({ brief, language, framework, includeTests }));
    return;
  }

  const client = new OpenAI({ apiKey, baseURL });
  const systemPrompt = [
    "You are a senior software engineer that generates concise, runnable code.",
    "Return only valid JSON. Do not wrap it in Markdown.",
    "The JSON object must contain: title string, summary string, files array, commands array, notes array.",
    "Each file must contain: path string, language string, content string, explanation string.",
    "Prefer small, complete files over fragments. Include commands and practical notes.",
    "Output budget rules:",
    "- Generate a compact runnable vertical slice instead of an exhaustive full repository.",
    "- Return at most 7 files unless the user explicitly asks for a larger scaffold, APK packaging, or a game. APK/game projects may use up to 9 files.",
    "- Keep each file under 140 lines when practical. Put optional expansion steps in notes instead of adding many files.",
    "- Do not omit required entry files to satisfy the file budget.",
    "- If tests are requested, include focused high-value tests, not every possible edge case.",
    "- Tests must match the implementation semantics. Do not write tests that contradict the code, such as expecting edge-touch rectangle collision when the implementation uses strict overlap.",
    "Project completeness rules:",
    "- For JavaScript, TypeScript, React, Vite, Electron, WebSocket, or Node projects, include package.json with runnable scripts unless the output is a single-file snippet by explicit user request.",
    "- For React/Vite apps, include package.json, index.html, src/main.jsx or src/main.tsx, and the referenced src entry/component files. Include Vitest setup or test script when tests are requested.",
    "- If index.html references /src/main.tsx, /src/main.jsx, /src/main.ts, or /src/main.js, that file must be present in the files array.",
    "- For TypeScript projects, include tsconfig.json when the build script runs tsc. If you omit tsconfig.json, do not use tsc in the build script.",
    "- For JavaScript projects, prefer capacitor.config.json or capacitor.config.js. Use capacitor.config.ts only when TypeScript tooling is configured.",
    "- For Capacitor Android APK projects, package.json must include @capacitor/core, @capacitor/cli, and @capacitor/android.",
    "- For Python apps, include requirements.txt or pyproject.toml when third-party packages are used, plus pytest commands when tests are requested.",
    "- For browser extensions, include manifest.json with manifest_version and minimal safe permissions.",
    "- For Docker requests, include Dockerfile and compose.yaml when the user asks for compose or multi-service local running.",
    "- For Terraform requests, include main.tf, variables.tf, outputs.tf, and an example or usage note when practical.",
    "Avoid unsafe destructive commands. Do not invent secrets or credentials.",
    "You are embedded in a Codex-like agent UI. The user only provides natural-language requirements.",
    "When language, framework, outputKind, or style are 'auto' or 'agent-selected', infer the best language, framework, project structure, and output shape from the user's requirements.",
    "Make the selected stack visible in the summary, agentTrace, notes, or file languages. Do not ask the user to choose a code type unless the requirement is genuinely ambiguous.",
    "Curated GitHub project library:",
    formatGithubProjectLibrary(),
    "Use the GitHub project library as internal reference patterns. Select only the projects relevant to the user's request, mention selected references in notes or agentTrace, and adapt the pattern instead of copying repository code wholesale.",
    "If a project license is unverified, use it only as a structural reference and state that limitation in notes.",
    "APK packaging rules:",
    "- If the user asks for Android, APK, mobile app, or packaging as APK, choose an APK-friendly stack: Android Gradle/Kotlin for native apps, Expo/React Native for mobile apps, or Capacitor for wrapping a web app.",
    "- Include package.json/build scripts, complete Vite/React entry files, Android/Expo/Capacitor config files, and commands needed to build a debug APK when practical.",
    "- Capacitor APK projects must include @capacitor/android and a cap add/sync/build path.",
    "- Do not claim an APK was built unless the APK packaging endpoint actually reports an APK file.",
    "- Prefer debug APK output for local testing. Signed release APK/AAB requires keystore credentials and must be treated as a separate explicit step.",
    "Generation quality rules:",
    "- If the request involves inventory, tickets, flash sales, balances, quotas, seats, coupons, or any scarce resource, do not model real stock only with frontend state, localStorage, or in-memory client data.",
    "- For real scarce-resource flows, put stock mutation on the server and use an atomic update, transaction, row lock, compare-and-swap, Redis Lua script, or equivalent concurrency-safe primitive. Explain the chosen primitive in notes.",
    "- If you intentionally build a local demo, label it clearly as a local-only simulation and state that every browser tab/user has independent state.",
    "- In React, use functional state updates when the next value depends on the previous value. Avoid stale closure reads in rapid-click handlers.",
    "- Validate inputs at logic boundaries. Numeric quantities must be finite non-negative integers unless the domain says otherwise. Avoid implicit string-to-number coercion.",
    "- Button disabled checks and guards should use defensive predicates such as <= 0 when impossible states could otherwise leak through.",
    "- Do not present text displayed by a runTests() button as real tests. If tests are requested, create actual Jest/Vitest/Pytest/etc. test files with assertions and commands that can fail in CI.",
    "- Avoid useCallback/useMemo unless they prevent real work, stabilize a child prop, or match a documented performance need.",
    "- Include notes for remaining demo limitations, production risks, and how to harden them.",
    "Node.js + Express backend rules:",
    "- Generate testable structure by default: src/app.js creates and exports app; src/server.js is the only file that calls app.listen(). Tests must be able to import app without starting a port.",
    "- Prefer this structure for backend projects: src/app.js, src/server.js, src/routes/tickets.js, src/services/ticketService.js, src/middleware/auth.js, src/middleware/rateLimit.js, src/errors.js, tests/tickets.test.js.",
    "- Write test files before implementation files in the files array when backend tests are requested. Implementation must be designed to pass those tests.",
    "- Use official/common import style for third-party libraries. For async-lock use: const AsyncLock = require('async-lock'). If unsure about a library API, do not guess; add a note that the API must be confirmed.",
    "- Do not use module-level variables such as let tickets = 100 as real production inventory. In-memory stock is demo-only and must be labeled as such. For production, use DB transactions, Redis atomic decrement/Lua, optimistic locking, or equivalent.",
    "- Do not trust userId from request body for real systems. Derive user identity from authentication middleware, session, or token. Body userId may be used only in clearly marked demos or tests.",
    "- Prevent duplicate orders when one-user-one-order is implied. Use an order record, unique index, idempotency key, or user-level lock.",
    "- Validate quantity with both lower and upper bounds. Reject non-integers, NaN, strings, zero, negatives, and quantities above the configured per-order/per-user limit.",
    "- Do not use unrestricted app.use(cors()) for production. Restrict allowed origins through configuration. Full-open CORS is only acceptable for explicitly labeled local demos.",
    "- Add basic rate limiting for booking or scarce-resource endpoints, preferably by IP and authenticated user.",
    "- Classify errors: 400 validation error, 401 unauthenticated, 403 forbidden when applicable, 409 inventory conflict/duplicate order, 429 rate limited, 500 unexpected server error. Do not collapse all errors into one status.",
    "- Backend tests for ticket/inventory APIs must cover: GET inventory, successful booking decrement, insufficient stock without decrement, invalid quantity rejection, duplicate order rejection, concurrent requests do not oversell, app import does not listen on a port.",
    "- After code generation, include a self-check checklist in notes covering testability, auth placeholder, rate limit, duplicate prevention, quantity limit, concurrent test, CORS policy, demo/production distinction, and third-party import certainty.",
    "Agent mode rules:",
    "- When agentMode is true, behave like a coding agent: analyze requirements, produce a concrete plan, generate tests before implementation when requested, review your own output against the guardrails, then include agentTrace and selfCheck in the final JSON.",
    "- Do not claim that generated code was executed locally unless the tool actually ran it. If execution is not performed, say what command the user should run.",
    "- Do not include destructive commands. Do not run or suggest running untrusted generated code outside a sandbox.",
    includeTests ? "Include focused tests when the stack supports them." : "Do not include tests unless essential."
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      brief,
      language,
      framework,
      style,
      outputKind,
      qualityMode,
      agentMode,
      routingInstruction:
        "Choose the best implementation stack yourself. The UI has intentionally hidden language/framework/output-type selectors.",
      githubProjectLibrary: GITHUB_PROJECT_LIBRARY.map((project) => ({
        name: project.name,
        url: project.url,
        category: project.category,
        useWhen: project.useWhen,
        guidance: project.guidance
      })),
      safetyRequirements: [
        "Distinguish local demo state from real shared state.",
        "Use server-side atomic mutation for real inventory or ticket stock.",
        "Use functional state updates for React state derived from previous state.",
        "Validate exceptional inputs and avoid implicit coercion.",
        "Generate real automated tests when tests are requested.",
        "For Express APIs, split app.js from server.js so tests can import app without listening on a port.",
        "For ticket or inventory backends, use auth-derived user identity, max quantity limits, duplicate-order prevention, restricted CORS, rate limiting, and classified HTTP errors.",
        "When tests are requested, output test files before implementation files and include concurrency/no-oversell tests.",
        "Include a self-check checklist in notes.",
        "Call out limitations in notes."
      ],
      includeTests,
      outputExample: {
        title: "Example title",
        summary: "Example summary",
        files: [
          {
            path: "src/example.js",
            language: "JavaScript",
            content: "console.log('hello');",
            explanation: "What this file does."
          }
        ],
        commands: ["node src/example.js"],
        notes: ["Short practical note."]
      }
    },
    null,
    2
  );

  try {
    if (agentMode) {
      const plan = await createJsonCompletion({
        client,
        model,
        maxTokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              "Return JSON only. Create an agent execution plan for this coding request.",
              "Schema: {\"goal\":\"string\",\"steps\":[{\"step\":\"string\",\"detail\":\"string\"}],\"riskChecks\":[\"string\"],\"testStrategy\":[\"string\"]}.",
              userPrompt
            ].join("\n\n")
          }
        ]
      });

      let generated;
      try {
        generated = await createJsonCompletion({
          client,
          model,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                "Use this agent plan to generate the final project.",
                "Return JSON only with title, summary, files, commands, notes, agentTrace, selfCheck.",
                "Keep the result compact: at most 7 files, short file contents, no exhaustive boilerplate.",
                "If includeTests is true, output test files before implementation files.",
                JSON.stringify({ request: JSON.parse(userPrompt), agentPlan: plan }, null, 2)
              ].join("\n\n")
            }
          ]
        });
      } catch (generationError) {
        generated = await createJsonCompletion({
          client,
          model,
          maxTokens: 8192,
          repairAttempts: 2,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                "The previous generation attempt returned invalid or incomplete JSON.",
                "Retry with an emergency compact project: at most 5 files, at most 90 lines per file.",
                "Return JSON only with title, summary, files, commands, notes, agentTrace, selfCheck.",
                "Prefer a runnable vertical slice with tests over a large scaffold.",
                JSON.stringify({ request: JSON.parse(userPrompt), agentPlan: plan }, null, 2)
              ].join("\n\n")
            }
          ]
        });
        generated.notes = [
          ...(Array.isArray(generated.notes) ? generated.notes : []),
          "Agent 自动降级：首次生成 JSON 不完整，已改用紧凑项目结构重新生成。"
        ];
      }

      let review;
      try {
        review = await createJsonCompletion({
          client,
          model,
          maxTokens: 2048,
          repairAttempts: 2,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                "Review this generated result against the guardrails. Return JSON only.",
                "Schema: {\"passed\":boolean,\"findings\":[\"string\"],\"checklist\":[\"string\"]}.",
                JSON.stringify(generated, null, 2)
              ].join("\n\n")
            }
          ]
        });
      } catch (reviewError) {
        review = {
          passed: false,
          findings: ["自检阶段返回非 JSON，已保留生成结果；建议继续运行沙箱检查。"],
          checklist: ["生成结果 JSON 可解析", "已提供文件与运行命令", "建议用沙箱执行测试命令"]
        };
      }

      const reviewFindings = Array.isArray(review.findings) ? review.findings : [];
      const needsCorrection = !review.passed && reviewFindings.some((finding) => {
        const text = String(finding).toLowerCase();
        return (
          text.includes("contradict") ||
          text.includes("missing") ||
          text.includes("failed") ||
          text.includes("test") ||
          text.includes("entry") ||
          text.includes("dependency")
        );
      });

      let finalGenerated = generated;
      if (needsCorrection) {
        try {
          const correctedGenerated = await createJsonCompletion({
            client,
            model,
            maxTokens: 8192,
            repairAttempts: 2,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  "Fix the generated project according to the self-review findings.",
                  "Return the complete corrected JSON only with title, summary, files, commands, notes, agentTrace, selfCheck.",
                  "Do not add a large scaffold. Correct only blocking issues such as contradictory tests, missing entry files, missing package dependencies, or invalid commands.",
                  JSON.stringify({ generated, review }, null, 2)
                ].join("\n\n")
              }
            ]
          });
          if (!validateResultShape(correctedGenerated)) {
            throw new Error("自动修正结果缺少必要字段。");
          }
          finalGenerated = correctedGenerated;
          finalGenerated.notes = [
            ...(Array.isArray(finalGenerated.notes) ? finalGenerated.notes : []),
            "Agent 自动修正：已根据自检发现的问题重写阻断项。"
          ];
          review = {
            passed: true,
            findings: ["已根据自检结果自动修正关键问题。"],
            checklist: Array.isArray(review.checklist) ? review.checklist : []
          };
        } catch (correctionError) {
          review.findings = [
            ...reviewFindings,
            `自动修正失败：${correctionError instanceof Error ? correctionError.message : String(correctionError)}`
          ];
        }
      }

      const result = normalizeGeneratedResult(finalGenerated);
      const planSteps = Array.isArray(plan.steps) ? plan.steps : [];
      result.agentTrace = [
        { step: "分析需求", status: "done", detail: cleanString(plan.goal, brief.slice(0, 120)) },
        ...planSteps.slice(0, 6).map((item) => ({
          step: cleanString(item.step, "执行步骤"),
          status: "done",
          detail: cleanString(item.detail, "已完成")
        })),
        { step: "生成代码", status: "done", detail: `已生成 ${result.files.length} 个文件。` },
        {
          step: "自检审查",
          status: review.passed ? "done" : "warning",
          detail: Array.isArray(review.findings) && review.findings.length ? review.findings.join("；") : "未发现阻断问题。"
        }
      ];
      result.selfCheck = Array.isArray(review.checklist) ? review.checklist : result.selfCheck;
      if (Array.isArray(review.findings) && review.findings.length) {
        result.notes = [...result.notes, ...review.findings.map((finding) => `Agent 自检：${finding}`)];
      }

      res.json(result);
      return;
    }

    const result = await createJsonCompletion({
      client,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    res.json(normalizeGeneratedResult(result));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "生成失败，请检查 DeepSeek API Key、模型名称或网络连接。",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/sandbox/run", async (req, res) => {
  try {
    const allowInstall = Boolean(req.body.allowInstall);
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    const result = await runSandboxChecks({ files, allowInstall });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: "沙箱执行失败。",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/apk/package", async (req, res) => {
  try {
    const allowInstall = Boolean(req.body.allowInstall);
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    const result = await runApkPackaging({ files, allowInstall });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: "APK 打包失败。",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.use(express.static(path.join(rootDir, "dist")));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`AI code generator listening on http://127.0.0.1:${port}`);
});
