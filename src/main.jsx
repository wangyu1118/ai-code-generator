import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Download,
  FileCode2,
  Github,
  KeyRound,
  Loader2,
  MessageSquareText,
  Play,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  TerminalSquare,
  X
} from "lucide-react";
import "./styles.css";

const starterPrompts = [
  "做一个待办清单网页，支持新增、完成、筛选和本地保存",
  "写一个 Python 爬虫，抓取网页标题并导出 CSV",
  "做一个 Express API，包含注册、登录、JWT 鉴权和测试",
  "做一个库存/票务后端，要求防超卖、防重复下单、有限流和并发测试"
];

const deepSeekModels = ["deepseek-v4-flash", "deepseek-v4-pro"];

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function loadApiSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("deepseek-api-settings") || "{}");
    return {
      apiKey: saved.apiKey || "",
      model: saved.model || "deepseek-v4-flash",
      baseUrl: saved.baseUrl || "https://api.deepseek.com"
    };
  } catch {
    return {
      apiKey: "",
      model: "deepseek-v4-flash",
      baseUrl: "https://api.deepseek.com"
    };
  }
}

function ApiSettingsDialog({ open, settings, onChange, onClose, onSave }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="api-modal" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
        <header className="api-modal-header">
          <div>
            <p className="eyeline">DeepSeek API</p>
            <h2 id="api-settings-title">API 设置</h2>
          </div>
          <button type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="api-form">
          <label>
            API Key
            <input
              value={settings.apiKey}
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
            />
          </label>

          <label>
            模型
            <select value={settings.model} onChange={(event) => onChange({ ...settings, model: event.target.value })}>
              {deepSeekModels.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            Base URL
            <input
              value={settings.baseUrl}
              type="url"
              onChange={(event) => onChange({ ...settings, baseUrl: event.target.value })}
            />
          </label>
        </div>

        <footer className="api-modal-footer">
          <span>{settings.apiKey ? "已填写 Key" : "未填写 Key"}</span>
          <button type="button" onClick={onSave}>
            保存设置
          </button>
        </footer>
      </section>
    </div>
  );
}

function Sidebar({ apiSettings, allowSandboxInstall, setAllowSandboxInstall, onOpenApiSettings, projectLibrary }) {
  const libraryCategories = Array.from(new Set((projectLibrary || []).map((project) => project.category))).slice(0, 3);

  return (
    <aside className="codex-sidebar">
      <div className="brand-row">
        <div className="brand-glyph">
          <Bot size={19} />
        </div>
        <div>
          <strong>Code Agent</strong>
          <span>自动选择技术栈</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="任务栏">
        <button className="active" type="button">
          <MessageSquareText size={17} />
          对话
        </button>
        <button type="button">
          <Code2 size={17} />
          代码生成
        </button>
        <button type="button">
          <ShieldCheck size={17} />
          沙箱
        </button>
        <button type="button">
          <Smartphone size={17} />
          APK 打包
        </button>
      </nav>

      <section className="sidebar-card">
        <div className="mini-title">
          <KeyRound size={15} />
          DeepSeek
        </div>
        <p>{apiSettings.apiKey ? apiSettings.model : "未填写 API Key"}</p>
        <button type="button" onClick={onOpenApiSettings}>
          <Settings2 size={16} />
          API 设置
        </button>
      </section>

      <label className="sidebar-check">
        <input
          type="checkbox"
          checked={allowSandboxInstall}
          onChange={(event) => setAllowSandboxInstall(event.target.checked)}
        />
        <span>沙箱允许安装依赖</span>
      </label>

      <section className="sidebar-card">
        <div className="mini-title">
          <Github size={15} />
          GitHub 能力库
        </div>
        <p>已植入 {projectLibrary?.length || 0} 个开源项目参考模式，Agent 会按需求自动选用。</p>
        {libraryCategories.length ? (
          <div className="library-tags">
            {libraryCategories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="sidebar-note">
        <strong>Agent 已内置</strong>
        <p>你只需要描述目标，Agent 会自己选择语言、框架、文件结构、测试、运行命令和 APK 包装策略。</p>
      </section>
    </aside>
  );
}

function AgentTrace({ trace, selfCheck }) {
  if (!trace?.length && !selfCheck?.length) return null;

  return (
    <details className="trace-box">
      <summary>Agent 轨迹与自检</summary>
      {trace?.length ? (
        <div className="trace-steps">
          {trace.map((item, index) => (
            <div className="trace-step" key={`${item.step}-${index}`}>
              <span className={classNames("trace-dot", item.status === "warning" && "warning")} />
              <div>
                <strong>{item.step}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {selfCheck?.length ? (
        <div className="self-checks">
          {selfCheck.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function SandboxResult({ sandboxResult }) {
  if (!sandboxResult) return null;

  return (
    <div className="sandbox-block">
      <div className={classNames("sandbox-summary", sandboxResult.ok ? "passed" : "failed")}>
        {sandboxResult.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <div>
          <strong>{sandboxResult.ok ? "沙箱检查通过" : "沙箱检查未通过"}</strong>
          <span>
            {sandboxResult.error ||
              (sandboxResult.runId ? `运行目录：${sandboxResult.runId}` : "已完成沙箱检查。")}
          </span>
        </div>
      </div>

      {sandboxResult.warnings?.length ? (
        <div className="sandbox-warnings">
          {sandboxResult.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {sandboxResult.steps?.length ? (
        <div className="sandbox-steps">
          {sandboxResult.steps.map((step, index) => (
            <details key={`${step.name}-${index}`} open={step.status === "failed" || step.status === "timeout"}>
              <summary>
                <span className={classNames("status-pill", step.status)}>{step.status}</span>
                <strong>{step.name}</strong>
              </summary>
              {step.detail ? <p>{step.detail}</p> : null}
              {step.command ? <code>{step.command}</code> : null}
              {step.output ? <pre>{step.output}</pre> : null}
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ApkResult({ apkResult }) {
  if (!apkResult) return null;

  const hasApkFiles = Boolean(apkResult.apkFiles?.length);

  return (
    <div className="apk-block">
      <div className={classNames("apk-summary", apkResult.ok ? "passed" : "failed")}>
        {apkResult.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <div>
          <strong>{apkResult.ok ? (hasApkFiles ? "APK 打包完成" : "APK 打包策略已准备") : "APK 打包未完成"}</strong>
          <span>
            {apkResult.error ||
              (apkResult.strategy ? `策略：${apkResult.strategy}，运行目录：${apkResult.runId}` : "已完成 APK 打包检查。")}
          </span>
        </div>
      </div>

      {apkResult.apkFiles?.length ? (
        <div className="apk-files">
          {apkResult.apkFiles.map((filePath) => (
            <code key={filePath}>{filePath}</code>
          ))}
        </div>
      ) : null}

      {apkResult.warnings?.length ? (
        <div className="sandbox-warnings">
          {apkResult.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {apkResult.steps?.length ? (
        <div className="sandbox-steps">
          {apkResult.steps.map((step, index) => (
            <details key={`${step.name}-${index}`} open={step.status === "failed" || step.status === "timeout"}>
              <summary>
                <span className={classNames("status-pill", step.status)}>{step.status}</span>
                <strong>{step.name}</strong>
              </summary>
              {step.detail ? <p>{step.detail}</p> : null}
              {step.command ? <code>{step.command}</code> : null}
              {step.output ? <pre>{step.output}</pre> : null}
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResultCard({
  result,
  selectedFile,
  activeFile,
  setActiveFile,
  copied,
  onCopy,
  onDownload,
  sandboxRunning,
  sandboxResult,
  onRunSandbox,
  apkRunning,
  apkResult,
  onPackageApk
}) {
  if (!result || !selectedFile) return null;

  return (
    <article className="result-card">
      <header className="result-header">
        <div>
          <h2>{result.title}</h2>
          <p>{result.summary}</p>
        </div>
        <div className="result-actions">
          <button type="button" onClick={onRunSandbox} disabled={sandboxRunning} title="运行沙箱检查">
            {sandboxRunning ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
          </button>
          <button type="button" onClick={onPackageApk} disabled={apkRunning} title="打包 APK">
            {apkRunning ? <Loader2 className="spin" size={17} /> : <Smartphone size={17} />}
          </button>
          <button type="button" onClick={() => onCopy(selectedFile.content, "code")} title="复制当前代码">
            {copied === "code" ? <Check size={17} /> : <Clipboard size={17} />}
          </button>
          <button type="button" onClick={onDownload} title="下载当前文件">
            <Download size={17} />
          </button>
        </div>
      </header>

      <AgentTrace trace={result.agentTrace} selfCheck={result.selfCheck} />

      <div className="file-tabs" aria-label="生成文件">
        {result.files.map((file) => (
          <button
            key={file.path}
            type="button"
            className={classNames(file.path === activeFile && "active")}
            onClick={() => setActiveFile(file.path)}
          >
            <FileCode2 size={14} />
            <span>{file.path}</span>
          </button>
        ))}
      </div>

      <div className="code-card">
        <div className="code-card-header">
          <div>
            <strong>{selectedFile.path}</strong>
            <span>{selectedFile.language}</span>
          </div>
          <button type="button" onClick={() => onCopy(selectedFile.content, "code-inline")}>
            {copied === "code-inline" ? <Check size={15} /> : <Clipboard size={15} />}
            复制
          </button>
        </div>
        <pre>
          <code>{selectedFile.content}</code>
        </pre>
      </div>

      {result.commands?.length ? (
        <div className="command-list">
          <div className="mini-title">
            <TerminalSquare size={15} />
            运行命令
          </div>
          {result.commands.map((command) => (
            <button key={command} type="button" onClick={() => onCopy(command, command)}>
              <code>{command}</code>
              {copied === command ? <Check size={15} /> : <Clipboard size={15} />}
            </button>
          ))}
        </div>
      ) : null}

      {result.notes?.length ? (
        <div className="notes">
          {result.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}

      <SandboxResult sandboxResult={sandboxResult} />
      <ApkResult apkResult={apkResult} />
    </article>
  );
}

function ChatWindow({
  brief,
  setBrief,
  lastPrompt,
  result,
  selectedFile,
  activeFile,
  setActiveFile,
  loading,
  error,
  copied,
  onCopy,
  onDownload,
  sandboxRunning,
  sandboxResult,
  apkRunning,
  apkResult,
  onGenerate,
  onRunSandbox,
  onPackageApk
}) {
  return (
    <section className="chat-shell">
      <header className="chat-header">
        <div>
          <strong>ai-code-generator</strong>
          <span>像 Codex 一样，把需求交给 Agent</span>
        </div>
        <div className="topbar-status">
          <span className="pulse-dot" />
          本地运行
        </div>
      </header>

      <div className="chat-scroll">
        <div className="message assistant">
          <div className="avatar">
            <Bot size={16} />
          </div>
          <div className="bubble">
            <p>告诉我你想做什么。无需选择语言、框架或代码类型，我会根据需求自动决定实现方式、文件结构、测试和运行命令。</p>
            {!lastPrompt && !result ? (
              <div className="starter-row">
                {starterPrompts.map((item) => (
                  <button key={item} type="button" onClick={() => setBrief(item)}>
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {lastPrompt ? (
          <div className="message user">
            <div className="bubble">
              <p>{lastPrompt}</p>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="message assistant">
            <div className="avatar">
              <Loader2 className="spin" size={16} />
            </div>
            <div className="bubble">
              <p>Agent 正在分析需求、选择技术栈并生成代码...</p>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="message assistant">
            <div className="avatar">
              <Bot size={16} />
            </div>
            <div className="bubble full">
              <ResultCard
                result={result}
                selectedFile={selectedFile}
                activeFile={activeFile}
                setActiveFile={setActiveFile}
                copied={copied}
                onCopy={onCopy}
                onDownload={onDownload}
                sandboxRunning={sandboxRunning}
                sandboxResult={sandboxResult}
                onRunSandbox={onRunSandbox}
                apkRunning={apkRunning}
                apkResult={apkResult}
                onPackageApk={onPackageApk}
              />
            </div>
          </div>
        ) : null}
      </div>

      <footer className="composer">
        {error ? <p className="error-text">{error}</p> : null}
        <div className="composer-box">
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="描述你要做的软件、功能或接口..."
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                onGenerate();
              }
            }}
          />
          <button type="button" onClick={onGenerate} disabled={loading || !brief.trim()} title="发送给 Agent">
            {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
      </footer>
    </section>
  );
}

function App() {
  const [brief, setBrief] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [allowSandboxInstall, setAllowSandboxInstall] = useState(false);
  const [result, setResult] = useState(null);
  const [activeFile, setActiveFile] = useState("");
  const [loading, setLoading] = useState(false);
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxResult, setSandboxResult] = useState(null);
  const [apkRunning, setApkRunning] = useState(false);
  const [apkResult, setApkResult] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [apiSettings, setApiSettings] = useState(loadApiSettings);
  const [projectLibrary, setProjectLibrary] = useState([]);

  const selectedFile = useMemo(() => {
    if (!result?.files?.length) return null;
    return result.files.find((file) => file.path === activeFile) || result.files[0];
  }, [activeFile, result]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectLibrary() {
      try {
        const response = await fetch("/api/project-library");
        const payload = await response.json();
        if (!cancelled && Array.isArray(payload.projects)) {
          setProjectLibrary(payload.projects);
        }
      } catch {
        if (!cancelled) {
          setProjectLibrary([]);
        }
      }
    }

    loadProjectLibrary();
    return () => {
      cancelled = true;
    };
  }, []);

  function saveApiSettings() {
    localStorage.setItem("deepseek-api-settings", JSON.stringify(apiSettings));
    setApiDialogOpen(false);
  }

  async function generateCode() {
    const prompt = brief.trim();
    if (!prompt || loading) return;

    setLoading(true);
    setError("");
    setCopied("");
    setSandboxResult(null);
    setApkResult(null);
    setLastPrompt(prompt);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: prompt,
          language: "auto",
          framework: "auto",
          style: "agent-selected production-ready",
          outputKind: "agent-selected",
          qualityMode: "realistic production",
          agentMode: true,
          includeTests: true,
          apiKey: apiSettings.apiKey,
          model: apiSettings.model,
          baseUrl: apiSettings.baseUrl
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "生成失败");
      }

      setResult(payload);
      setActiveFile(payload.files?.[0]?.path || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text, label) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  function downloadFile() {
    if (!selectedFile) return;
    const blob = new Blob([selectedFile.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = selectedFile.path.split("/").pop() || "generated-code.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runSandbox() {
    if (!result?.files?.length) return;
    setSandboxRunning(true);
    setError("");

    try {
      const response = await fetch("/api/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: result.files,
          allowInstall: allowSandboxInstall
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "沙箱执行失败");
      }

      setSandboxResult(payload);
    } catch (err) {
      setSandboxResult({
        ok: false,
        error: err instanceof Error ? err.message : "沙箱执行失败",
        steps: [],
        warnings: []
      });
    } finally {
      setSandboxRunning(false);
    }
  }

  async function packageApk() {
    if (!result?.files?.length) return;
    setApkRunning(true);
    setError("");

    try {
      const response = await fetch("/api/apk/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: result.files,
          allowInstall: allowSandboxInstall
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "APK 打包失败");
      }

      setApkResult(payload);
    } catch (err) {
      setApkResult({
        ok: false,
        error: err instanceof Error ? err.message : "APK 打包失败",
        apkFiles: [],
        steps: [],
        warnings: []
      });
    } finally {
      setApkRunning(false);
    }
  }

  return (
    <main className="codex-shell">
      <ApiSettingsDialog
        open={apiDialogOpen}
        settings={apiSettings}
        onChange={setApiSettings}
        onClose={() => setApiDialogOpen(false)}
        onSave={saveApiSettings}
      />

      <Sidebar
        apiSettings={apiSettings}
        allowSandboxInstall={allowSandboxInstall}
        setAllowSandboxInstall={setAllowSandboxInstall}
        onOpenApiSettings={() => setApiDialogOpen(true)}
        projectLibrary={projectLibrary}
      />

      <ChatWindow
        brief={brief}
        setBrief={setBrief}
        lastPrompt={lastPrompt}
        result={result}
        selectedFile={selectedFile}
        activeFile={activeFile}
        setActiveFile={setActiveFile}
        loading={loading}
        error={error}
        copied={copied}
        onCopy={copyText}
        onDownload={downloadFile}
        sandboxRunning={sandboxRunning}
        sandboxResult={sandboxResult}
        apkRunning={apkRunning}
        apkResult={apkResult}
        onGenerate={generateCode}
        onRunSandbox={runSandbox}
        onPackageApk={packageApk}
      />
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
