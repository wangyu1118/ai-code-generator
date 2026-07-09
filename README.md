# AI 自动代码生成器

一个本地可运行的 AI 代码生成器原型：输入软件需求，选择语言、技术栈和输出粒度，通过 DeepSeek API 生成文件、运行命令与说明。

生成器内置了质量护栏：真实库存/票数/余额必须走服务端原子扣减或事务；React 旧状态更新要用函数式更新；边界函数要做输入校验；测试要生成可在 Jest/Vitest/Pytest 等工具中失败的真实断言文件。

默认启用 Agent 模式：先规划任务和风险，再生成代码，最后让模型对结果做一次自检，并在界面展示运行轨迹。为了安全，它不会自动执行生成出来的陌生代码；结果里会给出你可以手动运行的命令。

## 受控沙箱执行

输出区提供 `沙箱检查` 按钮。它会把生成文件写入 `.sandbox-runs/` 下的一次性目录，并执行受限检查：

- 拒绝绝对路径、路径越界、`.env`、`node_modules` 等不安全写入。
- 限制文件数量、单文件大小和总大小。
- 默认只做文件安全校验和 JavaScript 语法检查。
- 默认不联网安装依赖。
- 勾选 `沙箱允许安装依赖` 后，才会运行 `npm install --ignore-scripts --no-audit --no-fund` 和 `npm test`。
- 命令有超时，输出会截断，环境变量会最小化。

这不是强隔离虚拟机，只是一个本地受控执行层。不要在里面运行你不信任的高风险代码。

针对 Node.js + Express 后端，生成器还会要求：

- `app.js` 只创建并导出 app，`server.js` 单独负责 `app.listen()`。
- 测试优先：先输出测试用例，再输出实现代码。
- 票务/库存接口要有鉴权占位、最大购买数量、防重复下单、限流、受限 CORS。
- 错误码要区分 400、401、409、429、500。
- 测试要覆盖库存查询、成功扣减、库存不足、非法数量、重复下单、并发不超卖。
- 不确定第三方库 API 时必须标注待确认，不要猜导入方式。

## 运行

```bash
npm install
npm run build
npm run server
```

### APK 电脑模拟器验证

打包出 APK 后，可以用本地 Android 模拟器完成安装、启动和截图验证：

```bash
npm run e2e:apk-emulator
```

默认会安装 `.agent-e2e/meteor-dodge-debug.apk`，自动解析包名和启动 Activity，并输出：

- `.agent-e2e/apk-emulator-smoke.json`
- `.agent-e2e/apk-emulator-smoke.png`

打开 `http://127.0.0.1:8787`。

## DeepSeek API

页面左侧有 `API 设置` 窗口，可以直接输入 DeepSeek API Key、模型和 Base URL。

也可以用 `.env` 配置默认值：

```bash
copy .env.example .env
```

```bash
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

没有 API Key 时，后端会返回本地模拟结果。

## 项目结构

```text
server/index.js   Express API，负责调用 DeepSeek 的 OpenAI 兼容接口
src/main.jsx      React 前端
src/styles.css    页面样式
vite.config.js    Vite 配置与 API 代理
```
