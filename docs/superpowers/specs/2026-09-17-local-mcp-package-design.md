# AI Watercolor Generator 本地 MCP 包设计

## 目标

创建一个独立、公开的 Node.js stdio MCP Server，让 Claude Desktop、Cursor、Codex 等支持本地 MCP 进程的客户端可以调用 AI Watercolor Generator 的生产 REST API。项目同时作为可实际使用的开发者入口，以及 GitHub、npm 和 MCP 生态中的公开品牌资产。

项目不复制现有网站后端、Fal 调用、积分逻辑或 Agent 编排。所有鉴权、任务创建、计费、限流、存储和任务状态仍由 `https://www.aiwatercolorgenerator.com/api/v1` 负责。

## 命名与发布主体

| 项目                | 值                                        |
| ------------------- | ----------------------------------------- |
| 本地目录            | `<workspace>/ai-watercolor-generator-mcp` |
| GitHub Organization | `AIWatercolorGenerator`                   |
| GitHub Repository   | `ai-watercolor-generator-mcp`             |
| npm Organization    | `ai-watercolor-generator`                 |
| npm Package         | `@ai-watercolor-generator/mcp`            |
| CLI bin             | `ai-watercolor-generator-mcp`             |
| MCP Registry        | `com.aiwatercolorgenerator/watercolor`    |

GitHub Organization 和 npm Organization 由用户先通过各自网站创建。代码完成后，使用 CLI 创建公开 GitHub 仓库、推送代码并发布 npm 包。

## 运行架构

```text
MCP Client
  -> stdio JSON-RPC
  -> @ai-watercolor-generator/mcp
  -> HTTPS REST API with Bearer key
  -> www.aiwatercolorgenerator.com/api/v1/*
```

本地包使用 TypeScript、ESM 和 Node.js 20 或更高版本。MCP Server 只使用 stdio transport。stdout 专供 MCP 协议消息，所有诊断信息只能写入 stderr。

运行时仅要求 `AIWATERCOLOR_API_KEY`。生产 API 根地址固定为 `https://www.aiwatercolorgenerator.com`，不公开自定义后端配置，避免把品牌包变成通用代理。测试通过依赖注入替换 HTTP transport，不依赖隐藏的环境变量。

## MCP 工具

### `generate_watercolor`

提交文本生成任务，对应 `POST /api/v1/images/generations`。

输入：

- `prompt`
- 可选 `model`
- 可选 `aspect_ratio`
- 可选 `resolution`
- 可选 `idempotency_key`

返回公开 task 对象，不等待图片生成完成。

### `upload_watercolor_input`

读取用户明确提供的本地图片路径，并以 multipart 请求调用 `POST /api/v1/uploads`。

约束：

- 只处理普通文件，不接受目录。
- 最大 10 MiB。
- 允许 JPEG、PNG 和 WebP；最终文件签名仍由服务端验证。
- 不遍历目录，不展开 glob，不跟随由工具自行发现的路径。
- 返回上传接口生成的可信 URL。

该工具只存在于本地 stdio 包，因为远程 Worker 无法读取客户端文件系统。

### `edit_watercolor`

提交图片编辑任务，对应 `POST /api/v1/images/edits`。输入图片使用 `upload_watercolor_input` 返回的可信 URL，工具本身不隐式读取本地文件。

### `get_watercolor_task`

查询任务状态，对应 `GET /api/v1/tasks/{task_id}`。生成和编辑保持异步；v1 不提供阻塞式 wait 工具，避免 MCP 调用超时。

## API 客户端与错误处理

API 客户端集中负责：

- Bearer Header
- JSON 和 multipart 请求
- Idempotency-Key
- 响应解析
- HTTP 超时
- 将 API 错误转换为稳定的 MCP tool error

缺少 API Key 时，进程可以启动并列出工具，但调用工具时返回明确的配置错误，避免 MCP 客户端因为启动失败而无法展示诊断信息。

服务端返回的 `error.code`、`error.message`、`error.param` 和 `request_id` 在安全的情况下保留。响应不是 JSON、网络失败或超时统一转换为不包含凭证和请求体的错误。任何日志都不得打印 API Key、Authorization Header 或图片内容。

## 代码结构

```text
ai-watercolor-generator-mcp/
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── api-client.ts
│   ├── schemas.ts
│   └── errors.ts
├── tests/
│   ├── api-client.test.ts
│   ├── server.test.ts
│   └── stdio.test.ts
├── docs/
│   └── superpowers/
├── .github/workflows/ci.yml
├── .gitignore
├── LICENSE
├── README.md
├── SECURITY.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── vitest.config.ts
```

`api-client.ts` 不依赖 MCP SDK；`server.ts` 只负责注册工具并调用 API client；`index.ts` 只负责进程入口和 stdio transport。这些边界让 HTTP 行为和 MCP 协议行为可以分别测试。

## npm 包设计

包使用公开 scoped package：`@ai-watercolor-generator/mcp`。

`package.json` 包含：

- `type: module`
- `bin.ai-watercolor-generator-mcp: dist/index.js`
- `files: ["dist", "README.md", "LICENSE"]`
- `engines.node: >=20`
- `publishConfig.access: public`
- 官方 homepage、repository、bugs 和关键词

构建产物保留 CLI shebang。发布前执行 `pnpm pack --dry-run`，确认不包含源码映射中的敏感路径、测试 fixture、环境文件或无关文档。

首次发布通过 npm 账号的 2FA 手动完成。包创建后，为 GitHub Actions 配置 npm Trusted Publishing；后续 release 使用 OIDC 和 provenance，不在仓库中保存长期 npm Token。

## GitHub 与曝光设计

README 首屏应包含：

- 一句话产品能力说明
- npm、CI、license 和 MCP Registry badges
- 官网、在线生成器、API 文档、MCP 文档链接
- `npx -y @ai-watercolor-generator/mcp` 快速配置
- Claude Desktop、Cursor、Codex 的配置示例
- 四个工具的输入和使用流程
- 异步任务轮询说明
- API Key 创建入口
- 安全与隐私说明

Repository 的 About 设置为官网 URL，并使用 `mcp-server`、`watercolor`、`ai-image-generation`、`image-editing`、`stdio` 等 topics。发布 GitHub Release，与 npm 版本和 tag 保持一致。

## MCP Registry 更新

不创建第二个 Registry 名称。npm 首次发布后，将 `com.aiwatercolorgenerator/watercolor` 发布为新的 Registry 版本，同时包含：

- 当前 production Streamable HTTP remote
- `@ai-watercolor-generator/mcp` 的 stdio package 定义
- 公共 GitHub repository 元数据

Registry 的 canonical `server.json` 随后放在公开 MCP repo 中。网站仓库保留现有历史文件，但后续 Registry 发布以公开 repo 为准，避免两个仓库同时维护版本。

## 测试与验收

自动测试覆盖：

- API Key 缺失和 Authorization Header 构造
- 生成、上传、编辑和查询请求映射
- idempotency key 行为
- API JSON 错误、非 JSON 错误、网络错误和超时
- 本地文件不存在、目录、超限与受支持图片上传
- 四个工具的名称和输入 schema
- 通过真实子进程执行 MCP `initialize` 和 `tools/list`

交付前必须通过：

```bash
pnpm test
pnpm build
pnpm pack --dry-run
```

并使用专用低额度 production API Key 完成一次端到端流程：上传图片、提交编辑、轮询到终态，同时完成一次文本生成。测试 Key 不进入 shell history、日志、Git 或 npm tarball。

## 非目标

v1 不包含：

- Fal 或其他模型供应商的直接调用
- 网站 Agent、提示词增强或聊天历史
- 本地数据库或任务缓存
- 阻塞式等待生成完成
- 任意远程 API base URL
- 将图片编码成 base64 放入 MCP 参数
- 自动下载生成结果到本地
- GUI、HTTP/SSE 或 Streamable HTTP server transport
