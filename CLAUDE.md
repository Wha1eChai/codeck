# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Codeck — Claude Code 桌面客户端 — 基于 Electron + React 的图形化界面，为 Claude Code CLI 提供原生桌面 GUI

## 核心理念

1. **原生文件驱动** — 直接读写 `~/.claude/` 目录，不引入额外数据库
2. **SDK 优先** — 通过 `@anthropic-ai/claude-agent-sdk` 的 `query()` API 与 Claude 交互
3. **渐进式架构** — Phase 1 核心对话 → Phase 2 体验增强 → Phase 3 差异化功能

## Monorepo 结构

```
codeck/                          # 仓库根目录（本文件所在处）
├── app/                         # Electron 桌面客户端（主包）
├── packages/
│   ├── config/                  # @codeck/config — 配置解析库（Zod schema + 读写）
│   └── sessions/                # @codeck/sessions — 会话历史服务（Hono + SQLite）
├── package.json                 # Workspace 根
└── pnpm-workspace.yaml
```

`app` 依赖 `@codeck/sessions`（workspace:*），通过 `sessions-server.ts` 启动其 HTTP 服务子进程。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron | 34+ |
| 构建工具 | electron-vite | 3+ |
| 前端框架 | React | 19 |
| 语言 | TypeScript | 5.7+ |
| 样式 | Tailwind CSS 4 + Radix UI | - |
| 图标 | lucide-react | - |
| 状态管理 | Zustand (全局) + React 19 use() (细粒度) | - |
| 数据源 | ~/.claude/ 原生文件 (JSON/JSONL/Markdown) | - |
| SDK | @anthropic-ai/claude-agent-sdk | 0.2+ |
| 配置管理 | @codeck/config (workspace) | - |
| 包管理 | pnpm | - |
| 测试 | Vitest | - |

## 命令

```bash
# 根目录执行（workspace 级）
pnpm install          # 安装依赖
pnpm dev              # 开发模式（electron-vite HMR）
pnpm build            # 生产构建
pnpm test             # 运行所有包的单元测试
pnpm test:config      # 仅运行 @codeck/config 测试
pnpm test:sessions    # 仅运行 @codeck/sessions 测试

# app 包级别（需要 filter 或 cd app/）
pnpm --filter codeck typecheck          # TypeScript 类型检查（3 个子 tsconfig）
pnpm --filter codeck test:integration  # 真实 SDK 集成测试（需要 API Key + 网络）
pnpm --filter codeck lint              # ESLint 检查

# 运行单个测试文件（在 app/ 内执行）
cd app && pnpm vitest run src/main/services/__tests__/session-orchestrator.test.ts

# 运行匹配模式的测试
cd app && pnpm vitest run -t "permission"
```

## 高层架构

### 目录结构

```
app/src/
├── main/                        # Electron 主进程
│   ├── index.ts                 # 入口：窗口创建 + IPC 注册
│   └── services/                # 后台服务
│       ├── claude.ts            # SDK 封装 (query/resume/abort)
│       ├── claude-files.ts      # ~/.claude/ 文件读写
│       ├── claude-files/        # JSONL 解析子模块（session-parser / types）
│       ├── session-orchestrator.ts  # 统一入口（多 session 并行路由）
│       ├── session.ts           # 会话状态管理（单 session + 多 session Map）
│       ├── session-context.ts   # Per-session 运行时上下文（SessionContextStore）
│       ├── worktree-service.ts  # Git worktree 隔离管理
│       ├── sessions-server.ts   # @codeck/sessions HTTP 子进程管理
│       ├── ipc-handlers/        # IPC 处理器（按领域拆分，Zod 验证）
│       │   ├── index.ts         # 入口 + 状态订阅
│       │   ├── session-handlers.ts / claude-handlers.ts / config-handlers.ts
│       │   ├── history-handlers.ts / settings-handlers.ts
│       │   └── file-handlers.ts / worktree-handlers.ts
│       ├── runtime-context.ts / capability-gate.ts  # 运行时上下文与校验
│       ├── app-preferences.ts   # L3: GUI 偏好（userData/）
│       ├── cli-config.ts        # L1: CLI 配置（~/.claude/settings.json）
│       ├── config-bridge.ts      # @codeck/config 桥接（Plugin/Agent/MCP/Hook/Memory 读写）
│       ├── ccusage-runner.ts     # ccusage 用量统计（直接 import data-loader + TTL 缓存）
│       ├── runtime/             # 运行时抽象层（RuntimeAdapter + Registry）
│       └── sdk-adapter/         # SDK 消息适配（纯函数，隔离 SDK 依赖）
│           ├── sdk-types.ts     # SDK 类型镜像
│           ├── message-parser.ts / content-block-parser.ts  # 消息解析
│           ├── permission-adapter.ts / options-builder.ts / hooks-builder.ts
│           └── env-loader.ts    # 环境变量加载
├── preload/                     # contextBridge 安全桥接
│   └── index.ts
├── renderer/                    # 渲染进程（React）
│   ├── App.tsx / main.tsx
│   ├── components/
│   │   ├── messages/            # 消息组件（注册表 + 分组渲染）
│   │   │   ├── AiMessageGroup.tsx       # assistant 消息聚合
│   │   │   ├── ThinkingTimeline.tsx     # 思考过程时间轴
│   │   │   ├── ToolTimeline.tsx / ToolBlock.tsx  # 工具调用时间轴
│   │   │   ├── TextMessage.tsx / MessageMarkdown.tsx  # 文本 + Markdown
│   │   │   ├── DiffView.tsx             # 统一/并排 diff
│   │   │   ├── primitives.tsx           # 原子组件（MessageRow / Avatar / Bubble）
│   │   │   └── ErrorMessage / CompactedMessage / FallbackMessage / UsageMessage
│   │   ├── chat/                # ChatContainer / ChatInput / InteractionPanel / ConversationFlow / TokenBar / SessionTabBar / MultiSessionContainer / WelcomeView
│   │   ├── layout/              # MainLayout / ActivityBar / ProjectPanel / SessionPanel / FilePanel / HeaderBar / TokenUsageBadge
│   │   ├── dialogs/             # NewSessionDialog / ProjectSelector
│   │   ├── settings/            # SettingsPage + sections/（9 个功能区）
│   │   ├── timeline/            # TimelinePanel（Checkpoint 时间轴）
│   │   ├── explorer/            # FileExplorer
│   │   └── ui/                  # Button / Input / Select / Dialog / Switch 等原子组件
│   ├── hooks/                   # useAppInit / useClaude / useHistory / useSessionActions 等
│   ├── stores/                  # message-store / session-store / settings-store / ui-store
│   └── lib/                     # conversation-reducer / tool-presentation / utils
└── common/                      # 三进程共享
    ├── types.ts                 # 核心类型定义
    ├── multi-session-types.ts   # 多 session 类型（ActiveSessionState / SessionTab / SidebarPanel）
    ├── sync-types.ts            # SyncResult 类型（sessions-server 同步结果）
    ├── schemas.ts               # Zod 校验 Schema
    ├── defaults.ts              # 共享默认值
    └── ipc-channels.ts          # IPC 频道常量
```

### 主进程数据流

```
Renderer IPC → ipc-handlers/（按领域拆分，Zod 验证）→ SessionOrchestrator
    ├─→ RuntimeContextService.buildContext() → 优先级解析 runtime/permissionMode
    ├─→ CapabilityGate.evaluate() → 校验权限模式
    ├─→ SessionContextStore → Per-session 上下文（AbortController / resolver / queryRef）
    ├─→ SessionManager → 内存状态（activeSessions Map + focusedSessionId）
    ├─→ ClaudeFilesService → JSONL 读写 + ccuiProjectMeta 元数据
    ├─→ WorktreeService → Git worktree 创建/合并/删除
    └─→ RuntimeRegistry.getAdapter().startSession(ctx) → ClaudeRuntimeAdapter → ClaudeService → SDK query()
            ↓
        sdk-adapter/（纯函数层：parseSDKMessage → Message[]）
            ↓
        IPC → Renderer → message-store → 组件渲染

配置读写（独立通道 — 通过 @codeck/config）:
    ├─→ AppPreferencesService（L3: GUI 偏好，userData/preferences.json）
    └─→ config-bridge.ts → @codeck/config（L1/L2: CLI 配置读写）

会话历史:
    └─→ sessions-server.ts → @codeck/sessions（Hono HTTP + SQLite）

用量统计:
    └─→ ccusage-runner.ts → ccusage/data-loader（直接 import，5min TTL 缓存，启动预热 + 会话后自动刷新）
```

### 主进程服务职责

| 模块 | 职责 |
|------|------|
| `SessionOrchestrator` | 统一入口，多 session 路由（abort/resolve/sendMessage 按 sessionId 分发） |
| `ClaudeService` | SDK 封装（startSessionWithContext / abort / resolve）+ 权限缓存 |
| `ClaudeFilesService` | JSONL 读写 + 项目元数据（ccuiProjectMeta 命名空间） |
| `SessionManager` | 内存状态（activeSessions Map + focusedSessionId + worktreeInfoMap） |
| `SessionContextStore` | Per-session 运行时上下文（AbortController / permissionResolver / queryRef） |
| `WorktreeService` | Git worktree 生命周期（create / list / remove / diff / merge） |
| `RuntimeRegistry` | 多运行时适配器管理，委托操作到 active runtime |
| `RuntimeContextService` | 构建 runtime/permissionMode 上下文（request > session > settings > fallback） |
| `CapabilityGate` | 验证运行时能力与请求参数兼容性 |
| `sessions-server.ts` | 启动 @codeck/sessions HTTP 子进程 + triggerSync/debouncedSync 同步生命周期（启动初始 sync + 5min 定时 + 事件驱动） |
| `AppPreferencesService` | GUI 偏好存储（与 CLI 隔离） |
| `CliConfigService` | CLI 原生配置读写（按键隔离，保留其他键） |
| `config-bridge.ts` | @codeck/config 桥接层（Plugin/Agent/MCP/Hook/Memory 统一读写） |
| `ccusage-runner.ts` | 直接 import `ccusage/data-loader`，TTL 缓存（5min）+ 启动预热 + 会话结束后自动刷新 |

### SDK 适配层（sdk-adapter/）

纯函数层，隔离 SDK 依赖（SDK import 仅存在于 `claude.ts` 和 `sdk-types.ts`）：

```
SDK query() yield → SDKMessage（判别联合，16 种变体）
    ↓
parseSDKMessage()（message-parser.ts — 顶层路由）
    ├─ assistant → parseContentBlocks()（fan-out：1 条 SDK 消息 → N 条内部 Message）
    ├─ user → 纯文本 / tool_result 分支
    ├─ result → success(usage) / error
    ├─ system → init(metadata) / status / hook / 静默
    ├─ stream_event → delta 文本/思考
    └─ tool_progress → 工具进度
    ↓
ParseResult { messages: Message[], metadata?: SessionMetadata }
```

### 渲染层架构

**消息分组渲染（ConversationFlow 模式）**：

```
messages[] → conversation-reducer.ts → ConversationGroupView[]
    ├─ user group → TextMessage
    ├─ assistant group → AiMessageGroup
    │   ├─ AssistantThinkingStep → ThinkingTimeline
    │   ├─ AssistantTextStep → TextMessage + MessageMarkdown
    │   └─ AssistantToolStep → ToolTimeline → ToolBlock（use + result 配对）
    └─ system group → ErrorMessage / CompactedMessage / FallbackMessage
```

- `conversation-reducer.ts` — 核心分组逻辑，将 flat Message[] 转为 `ConversationGroupView[]`
- `tool-presentation.ts` — 工具展示 view-model 构建器
- `AiMessageGroup` — 连续 assistant/tool 消息聚合为一个视觉单元，共享头像
- 流式 delta 合并在 `message-store.ts`（store 层），组件只消费最终 content

**Store 层**（Zustand）：

| Store | 职责 |
|-------|------|
| `message-store` | 消息列表 + stream delta 合并 + appendOrUpdate 去重 |
| `session-store` | 会话状态 + 多 session（sessionStates Map / openTabs / scrollPositions） |
| `settings-store` | 设置持久化（IPC 调用应在 store 层，非组件层） |
| `ui-store` | UI 状态（activeView / activeSidebarPanel / pendingInteractions per-session） |

**Hooks**：

| Hook | 职责 |
|------|------|
| `useClaude` | Claude SDK 交互封装 |
| `useSessionActions` | 会话 CRUD 操作集中 |
| `useSessionState` | 后端 SESSION_STATE_CHANGED IPC 同步 |
| `useHistory` | 全局会话历史浏览 |
| `useTokenUsage` | 聚合 token 用量计算 |
| `useAutoScroll` | 流式消息自动滚动 |
| `useAppInit` | 应用初始化 |
| `useKeyboardShortcuts` | 全局快捷键 |

## SDK 集成规范

### query() API

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"

const conversation = query({
  prompt: userInput,
  options: {
    maxTurns: Infinity,
    permissionMode: "default",   // default/plan/acceptEdits/delegate/dontAsk/bypassPermissions
    cwd: projectPath,
    sessionId: existingId,       // 传入已有 ID 可断点续传
  },
  abortController,
})

for await (const message of conversation) {
  handleMessage(message)
}
```

### canUseTool 权限审批

通过 IPC 向渲染进程发送权限请求，等待用户点击"允许"或"拒绝"。权限记忆使用 `PermissionDecisionStore`（permission-adapter.ts），risk-based scope：高风险（Bash 等）默认精确匹配，中低风险（Edit/Read）默认整工具类型。

### SDK SessionId 提取

`resumeSession` 必须使用 SDK 的真实 sessionId（非文件 UUID），从 JSONL 历史的 `system/init` 消息提取：
```typescript
{ type: "system", subtype: "init", session_id: "sdk_session_xxx", ... }
```

## JSONL 会话历史格式

会话转录文件 (`~/.claude/projects/<hash>/sessions/*.jsonl`) 每行一个 JSON 对象：

```jsonc
{"type": "user", "content": "请帮我重构 auth 模块", "timestamp": 1707700000}
{"type": "assistant", "content": "好的，我来分析...", "timestamp": 1707700001}
{"type": "thinking", "content": "需要先看 auth 目录结构...", "timestamp": 1707700001}
{"type": "tool_use", "tool_name": "Read", "tool_input": {"file_path": "src/auth/index.ts"}, "timestamp": 1707700002}
{"type": "tool_result", "tool_name": "Read", "content": "...", "success": true, "timestamp": 1707700003}
{"type": "usage", "input_tokens": 2300, "output_tokens": 1800, "cache_read_tokens": 500, "timestamp": 1707700004}
```

## 数据读写约定

### ~/.claude/ 文件结构

```
~/.claude/
├── settings.json           # 用户全局设置
├── CLAUDE.md               # 用户全局记忆
├── rules/*.md              # 模块化规则
├── projects/<hash>/
│   ├── CLAUDE.md / settings.json / settings.local.json
│   ├── memory/             # Auto Memory
│   └── sessions/*.jsonl    # 会话转录
├── agents/*.md             # 自定义 Agent
└── .claude.json            # MCP 配置
```

### 配置 3 层分离

- **L1 `CliConfigService`** — `~/.claude/settings.json`（按顶级键隔离读写，保留其他键）
- **L3 `AppPreferencesService`** — `userData/preferences.json`（Electron 应用目录，与 CLI 隔离）
- **共享默认值 `defaults.ts`** — `DEFAULT_APP_PREFERENCES` / `DEFAULT_EXECUTION_OPTIONS` / `DEFAULT_HOOK_SETTINGS`

配置优先级（从高到低）：Managed Settings → User Settings → Project Settings → Local Settings

### 项目元数据

使用 `ccuiProjectMeta` 命名空间存储应用专属元数据（`~/.claude/projects/<hash>/settings.json`），避免覆盖 CLI 原生配置。

## 文件命名约定

- 组件：`PascalCase.tsx`（如 `ChatInput.tsx`）
- 工具/服务：`kebab-case.ts`（如 `claude-files.ts`）
- 类型：`types.ts`（按模块组织）
- 常量：`UPPER_SNAKE_CASE`
- IPC 频道：`kebab-case` 字符串常量
- 导入路径：始终使用 `@common/*` 和 `@renderer/*` 别名，不用相对路径

## 测试原则

- **禁止用 mock 替代真实实现** — mock 仅用于不可控的外部边界（Electron BrowserWindow、SDK `query()` 网络调用）
- **mock 数据必须反映真实结构** — 如 SDK mock 必须用 `{ type: 'assistant', uuid, message: { content: [...blocks] } }` 嵌套结构
- **集成测试与单元测试分离** — `__tests__/` 放纯函数单元测试，`__integration__/` 放真实 API 调用测试，`pnpm test` 不跑集成测试
- **新增适配层后必须跑 `pnpm --filter codeck test:integration`** 验证类型镜像与真实 SDK 输出一致
- **`vitest run` 不检查类型** — esbuild 转译会剥离类型，fixture 缺少 `readonly X | undefined` 字段不会报错；修改接口后必须跑 `pnpm --filter @codeck/config run typecheck`

## Store 层 IPC 模式

IPC 调用应在 store 层（非组件层），使用乐观更新 + 回滚：
```typescript
updateSettings: async (partial) => {
  set((state) => ({ settings: { ...state.settings, ...partial } }))  // 乐观更新
  try {
    await window.electron.updateSettings(partial)
  } catch (error) {
    await get().loadSettings()  // 失败回滚
  }
}
```

## 踩坑记录

### Tailwind CSS 4
- 必须安装 `@tailwindcss/vite` 并在 `electron.vite.config.ts` 的 renderer.plugins 中注册
- `@theme` 中不能用 `hsl(var(...))`，需用 `@theme inline` + `:root` 写完整 `hsl()` 值

### Radix UI — 可用组件

- `app/src/renderer/components/ui/` 仅包装了：Button / Dialog / Input / ScrollArea / Select / Switch / Textarea
- 需要下拉菜单时直接用 `@radix-ui/react-dropdown-menu`（已安装），无需自建 Popover
- DropdownMenu 内嵌搜索 input 必须加 `onKeyDown={e => e.stopPropagation()}`，否则字符被 Radix 键盘导航拦截

### Zustand + React 19
- selector 中禁止 `|| []`（每次创建新引用触发无限循环），用模块级常量 `const EMPTY: T[] = []` + `?? EMPTY`
- `useEffect` 依赖禁止传数组/对象引用，用 `.length` 等原始值
- per-session Set 状态（如 `ReadonlySet<string>`）应直接读 `useStore(s => s.mySet)` 后调 `.has()`，不要 selector 返回函数（函数引用稳定但 Set 内容变化不会触发重渲染）
- 跨组件共享 DOM 元素（如 scroll container）可存 `HTMLElement | null` 到 ui-store，ChatContainer 用 `useEffect` 注册/注销，下游组件读取后挂 IntersectionObserver
- 测试中 `setState({...}, true)` 会替换整个 store（含 action 函数），导致 `not a function` 错误；重置 store 状态应用 `setState({...})`（merge 模式），不传第二个参数

### 渲染层测试基础设施

- `app/src/renderer/__test-utils__/` 提供 `installMockElectron()` / `uninstallMockElectron()`（全量 `ElectronAPI` mock）、`resetAllStores()`、`createMockSession()` 等 fixture 工厂
- Hooks 测试需要 `// @vitest-environment happy-dom` 指令 + `@testing-library/react` 的 `renderHook`；Store 测试直接在 `node` 环境下调用 `getState()` / `setState()`
- `syncStatus()` 仅在 `currentSessionId === state.sessionId` 时更新顶层 `sessionStatus`，测试时须先设置 `currentSessionId`
- **组件测试**：读 Zustand store 状态的组件**不能用 `renderToStaticMarkup`**（SSR 走 `getServerSnapshot`，忽略 `setState`），必须用 `@testing-library/react` 的 `render`；只接收 props 的纯展示组件才可用 `renderToStaticMarkup`
- `installMockElectron()` 应直接赋值到 `window.electron`，不能替换 `globalThis.window`（会破坏 happy-dom 的 `addEventListener`）

### pnpm v10
- Electron 首次安装后需 `pnpm approve-builds electron` 批准构建脚本

### SDK 关键行为
- SDK `query()` 的消息是判别联合，顶层 `type` 区分 16 种变体
- `assistant` 消息 fan-out：嵌套 `message.content[]`，每个 content block 拆为独立 Message，ID 格式 `${parentUuid}_block_${index}`
- `stream_event` 是嵌套结构 `{ event: { type, delta: { type, text?, thinking? } } }`，不是扁平字段
- `result.is_error` 不可靠：`error_max_turns` 的 `is_error` 为 `false`，必须用 `subtype.startsWith('error')` 判断
- `tool_result.content` 可能是 `[{type: "text", text: "..."}]` 数组，必须用 `normalizeContent()` 规范化
- `plan` 模式下模型不输出 text block，而是 thinking + tool_use
- SDK `query()` 通过 ChildProcess 启动子进程，不继承 process.env，必须通过 `options.env` 显式传入
- `system/init` 包含丰富元数据：tools, agents, skills, plugins, mcp_servers, apiKeySource, claude_code_version 等
- 前端发消息时本地生成乐观 ID：`user_${Date.now()}_${random}`。**这类 ID 不能传给 rewindFiles 等 SDK 操作**（SDK 不识别）。IPC 层用 `z.string().min(1)` 而非 `z.string().uuid()`；前端侧用 `!id.startsWith('user_')` 门控依赖 SDK 真实 ID 的按钮
- `sessionContextStore.get(sessionId)` 在历史恢复场景返回 `undefined`（无活跃 queryRef）。依赖 queryRef 的功能（rewind、abort）返回 undefined 时必须短路并返回明确错误，不能静默失败

### Windows 环境
- SDK 子进程需要 `CLAUDE_CODE_GIT_BASH_PATH`，指向本机 Git Bash 路径（如 `C:\Program Files\Git\bin\bash.exe`）
- 集成测试：`set CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe && pnpm --filter codeck test:integration`

### TypeScript 类型检查
- `pnpm --filter codeck typecheck` 可能报 `out/` 目录的 TS6305 错误，删除 `app/out/` 后重新运行即可

### Zod v4 z.record() 语法
- Zod v4 要求显式传两个参数：`z.record(z.string(), z.string())`
- 仅传一个参数 `z.record(z.string())` 会报 TS2554，且 infer 出 `Record<string, unknown>` 类型

### IPC payload 协议一致性

- preload 的 `ipcRenderer.invoke(channel, payload)` 与主进程 handler 的 Zod schema 必须严格匹配 **payload 形态（字符串 vs 对象）**
- `createValidatedHandler` 接收 `payload` 整体传给 `schema.parse()`；若 schema 是 `z.object({sessionId})` 而 preload 传裸字符串，Zod 抛 ZodError，前端 `catch(()=>{})` 静默吞掉，表现为"偶发无响应"
- 重构 IPC handler（如引入工厂函数）时，检查原始 handler 是否有 `typeof x === 'string' ? { key: x } : x` 的字符串适配逻辑——工厂化后需在 preload 侧同步改为传对象

### 日志

- 主进程用 `createLogger(module)` from `app/src/main/services/logger.ts`，渲染进程用 `app/src/renderer/lib/logger.ts`
- 生产代码禁止直接 `console.*`，统一用 logger（便于生产模式静音及后续结构化日志接入）

### Zod schema 与 AppPreferences 同步
- 新增 `AppPreferences` 字段时**必须**同步更新 `schemas.ts` 的 `updatePreferencesSchema`，否则 Zod 默认 strip 行为会静默丢弃未声明字段，前端乐观更新成功但后端实际未写入，重启后配置丢失

### Plan 模式产生空 text block
- plan 模式下模型只输出 thinking + tool_use，但 SDK 仍可能生成 `content: ''` 的 text 消息
- `AiMessageGroup` 需过滤 `nonEmptyTextMessages`（`filter(msg => msg.content)`）并用 `hasVisibleContent` 守卫，避免渲染空气泡

### fetch().json() 返回 unknown

- 严格 TypeScript 模式下 `res.json()` 返回 `Promise<unknown>`，直接访问属性会报 TS18046
- 必须显式断言：`const json = (await res.json()) as { data: SyncResult }`

### SDK 类型镜像验证 & 诊断工作流
- `sdk-types.ts` 中的类型镜像必须与真实 SDK 输出一致，不能凭文档或猜测
- 新增 SDK 交互后必须跑 `pnpm --filter codeck test:integration` 对比 `sdk-message-dump.json` 与 `sdk-types.ts`
- SDK 升级或新增消息类型时的完整流程：
  1. 运行 `pnpm --filter codeck test:integration` 捕获真实消息结构
  2. 检查 `sdk-message-dump.json` 中是否有未知类型
  3. 更新 `sdk-types.ts` 补齐新字段
  4. 更新 `message-parser.ts` 添加新分支
  5. 更新 `__tests__/fixtures.ts` 添加真实结构 fixture
  6. 运行 `pnpm test` 验证单元测试

### 渲染性能优化注意事项

- `content-visibility: auto` 只加在非最后 20 个消息组上（`TAIL_RENDER_COUNT`），最后 20 个始终完整渲染以避免流式尾部闪烁
- 消息窗口切片（`INITIAL_WINDOW = 30`）在 session 切换时自动重置，流式时自动推进窗口尾部
- `React.memo()` 加在 `MessageMarkdown` / `TextMessage` / `AiMessageGroup` / `FlowRunRenderer` 上；`markdownComponents` 对象已是模块级常量，无需额外处理
- `useAutoScroll.handleScroll` 用 rAF 去重避免每帧多次 scroll 回调，cleanup 在 ResizeObserver 的 useEffect 中

### Vitest — Electron & Workspace 包解析

- `electron` 通过 `app/vitest.config.ts` 的 alias 全局 mock → `src/__mocks__/electron.ts`，测试文件无需各自 `vi.mock('electron')`；新增直接或间接导入 `electron` 的服务文件时不需要额外操作
- `@codeck/config` 同样通过 alias 指向 TypeScript 源码，无需先 `pnpm build`；**新增 workspace 包时需同步在 vitest alias 中注册**，否则 CI 会报 "Failed to resolve entry for package"
- CI 用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，本地因 binary 存在不会暴露此问题——两者差异只能通过 alias mock 消除

### Vitest — 平台相关测试

- `encodeProjectPath()` 内部调用 `path.resolve()`，Windows 路径（`C:\foo`）在 Linux CI 上被当作相对路径，走 URL-encode 分支而非 Windows 驱动器分支
- 用 `it.skipIf(process.platform !== 'win32')` 隔离 Windows 专属测试，并补充对应的 Unix 平台测试，保证两端各自覆盖

### CI 预检（推送前必跑）

- 根目录 `pnpm test` **不等价于 CI**——它不跑 `@codeck/config typecheck`，本地全绿不代表 CI 全绿
- CI 等价命令：`pnpm --filter @codeck/config run test && pnpm --filter @codeck/config run typecheck && pnpm --filter @codeck/sessions run test && pnpm --filter codeck run test`

## 运行时抽象（Adapter 模式）

扩展新运行时只需实现 `RuntimeAdapter` 接口并在 `setup.ts` 中注册：
```typescript
interface RuntimeAdapter {
  readonly id: RuntimeId;
  getCapabilities(): RuntimeCapabilityReport;
  startSession(window: BrowserWindow, params: StartSessionParams, ctx: SessionContext): Promise<void>;
  abort(ctx: SessionContext): void;
  resolvePermission(ctx: SessionContext, response: PermissionResponse): void;
  resolveAskUserQuestion(ctx: SessionContext, response: AskUserQuestionResponse): void;
  resolveExitPlanMode(ctx: SessionContext, response: ExitPlanModeResponse): void;
  rewindFiles(ctx: SessionContext, userMessageId: string, dryRun?: boolean): Promise<RewindFilesResult>;
}
```

注册位置：`app/src/main/services/runtime/setup.ts`（RuntimeRegistry 类本身零 adapter 导入）

## 开发阶段

- Phase 1（已完成）— 核心对话：项目选择、会话管理、流式聊天、权限审批
- Phase 2（已完成）— 体验增强：Diff 视图、文件管理器、Token 仪表盘、Checkpoint 时间轴、会话历史、消息分组渲染
- Phase 3（已完成）— 差异化：Settings 页面化、Plugin/Agent/MCP/Hook/Memory 管理 UI、主题切换
- Phase 4（已完成）— 多 Session 并行：Activity Bar + SessionPanel 侧边栏重设计、Tab Bar 多标签、SessionContext 并发后端、Git Worktree 隔离
- **Phase 5（进行中）— SDK 解耦 + 自研 Agent 内核**：5A 架构铺路 → 5B 自研内核 + 多 Provider → 5C Agent 上下文管理与编排
- 远期：远程 WebUI、国际化、可执行版发布

### 多 Session 架构

```
┌─ ActivityBar（48px）──┬── SidebarPanel（220px）──┬── MainContent ─────────────────────────┐
│  💬 Sessions (badge) │  SessionPanel            │  HeaderBar（ProjectSwitcher + token）  │
│  📁 Files            │  FilePanel               │  SessionTabBar（多标签切换）            │
│  🕐 History          │  HistoryPanel            │  ChatContainer / WelcomeView           │
│  ⚙ Settings (底部)   │ （三者互斥，含 Settings） │  TimelinePanel（可折叠）                │
└──────────────────────┴──────────────────────────┴────────────────────────────────────────┘
```

- **并发模型**：一个 ClaudeService（无状态逻辑层），多个 SessionContext（per-session 可变状态）
- **Tab 管理**：`session-store.openTabs` 跟踪打开的标签页，切换时恢复 scroll position
- **Worktree 隔离**：创建 session 时可选 `useWorktree`，在 `.claude-worktrees/<sessionId>/` 创建独立 git worktree，`sendMessage` 自动以 worktree path 作为 cwd
- **项目切换**：`ProjectSwitcherDropdown`（HeaderBar 左侧）— `@radix-ui/react-dropdown-menu` + 搜索；切换项目不强制跳转 Session Panel

## 待办：SDK 解耦与自研 Agent 内核迁移（Phase 5 — 当前优先级最高）

> **背景**：项目计划摆脱对 `@anthropic-ai/claude-agent-sdk` 的硬依赖，迁移到自研 agent 内核 + 多 LLM Provider 架构。当前 SDK 耦合点已经过审计，实际硬耦合仅 1 个生产文件（`claude.ts` 的 `import { query }`），整个渲染层、preload、common/types.ts 均零 SDK 导入，迁移可行性高。
>
> **策略**：保留现有 SDK 实现作为参考，并行搭建自研 agent 内核，逐步替换，最后移除 SDK 依赖。不走 CLI 子进程中间方案（无法自定义 agent 编排和上下文注入）。

### SDK 耦合现状（审计结论）

| 层级 | SDK 依赖 | 说明 |
|------|---------|------|
| `claude.ts` | **直接 import** | 唯一的 `import { query }` + `query()` 调用 + `queryRef.rewindFiles()` |
| `sdk-types.ts` | 类型镜像 | 不 import SDK 包，但结构必须与 SDK 输出一致 |
| `sdk-adapter/*`（其余文件） | **零 SDK 导入** | 纯函数层，仅依赖 sdk-types.ts 和 common/types.ts |
| `session-orchestrator.ts` | **零（已解耦）** | 通过 `runtimeRegistry.getAdapter()` 路由，不再 import ClaudeService |
| `runtime/setup.ts` | 间接（组装层） | 导入 ClaudeService + ClaudeRuntimeAdapter 进行注册，仅此一处 |
| `runtime/claude-runtime-adapter.ts` | 间接（薄委托） | 接收 ClaudeService 实例，委托 6 个执行方法 |
| `common/types.ts` | **零** | Message / PermissionRequest / ExecutionOptions 全部本地定义 |
| `preload/` + `renderer/*` | **零** | 仅消费 @common/types |

### Phase 5A：架构层——为迁移铺路（核心已完成）

- [x] **RuntimeAdapter 升级为执行接口**：新增 `startSession` / `abort` / `resolvePermission` / `resolveAskUserQuestion` / `resolveExitPlanMode` / `rewindFiles` 6 个执行方法。`ClaudeRuntimeAdapter` 实现薄委托层，内部调 ClaudeService
- [x] **SessionOrchestrator 改为通过 RuntimeRegistry 分发**：不再直接引用 `claudeService`，通过 `runtimeRegistry.getAdapter().startSession(...)` 路由。SDK 耦合从 Orchestrator 层完全消除
- [x] **RuntimeRegistry 外部化注册**：`setup.ts` 负责初始化，Registry 类本身零 adapter 导入
- [ ] **sdk-adapter 内部模块分线**（可选，建议 5B 时再做）：`permission-adapter.ts` / `hooks-builder.ts` / `env-loader.ts` / `model-alias-resolver.ts` 可上提为平台层（provider 无关）；`message-parser.ts` / `parsers/*` / `content-block-parser.ts` 留在 Claude provider 内部；`options-builder.ts` 为 Claude 专属

### Phase 5B：自研 Agent 内核 + 多 Provider

- [ ] 定义 provider 无关的消息流接口（`AgentMessageStream`），统一 Anthropic / OpenAI / 其他 provider 的流式事件
- [ ] 第一个自研 provider：Anthropic Messages API（使用 MIT 许可的 `anthropic` SDK，非 Agent SDK）
- [ ] 自研 agent 循环：工具调用编排、上下文管理、权限审批流程
- [ ] 跑通端到端后，移除 `@anthropic-ai/claude-agent-sdk` 依赖
- [ ] 后续扩展更多 provider

### Phase 5C：Agent 上下文管理与编排

> 自研内核的核心价值——在合适的时间注入合适的上下文，保持上下文干净。

- [ ] 上下文生命周期管理：token 预算分配、动态裁剪、优先级排序
- [ ] 上下文注入编排：system prompt 组装、工具定义动态加载、记忆/规则按需注入
- [ ] Agent 编排框架：多步骤任务拆解、子 agent 委托、上下文隔离与共享策略

### 工作量估算（1 人全职）

| 阶段 | 预估 | 说明 |
|------|------|------|
| Phase 5A（架构铺路） | 1-2 周 | 对现有功能零影响，纯重构 |
| Phase 5B MVP（单 provider + 基础流式 + 工具调用闭环） | 2-4 周 | 在 Phase 5A 基础上 |
| Phase 5B 功能对齐（权限、中断、结构化输出等） | 6-10 周 | 累计 |
| Phase 5C（Agent 上下文管理与编排） | 待评估 | 5B 完成后细化 |
| 多 provider 稳定架构 | 10-16 周 | 累计 |

### 合规与开源注意事项

- **源码开源**：可以进行，README 免责声明已到位
- **预编译二进制（exe/dmg）分发**：SDK 移除前暂缓公开分发，避免 Anthropic 商业条款灰色地带
- **认证**：仅支持 API Key，代码中零 OAuth 实现，这是合规的
- **品牌**："Codeck" 独立品牌名，未使用 "Claude" 作为主名称
- **范式借鉴**：agent 交互范式/流程属于 idea/process（17 U.S.C. §102(b)），不受版权保护；风险在于复制代码表达、品牌误导、OAuth 代理
- **持续约束**：只要还调 Anthropic 服务就受其商业条款约束（含"竞品限制"条款解释风险），多 provider 是风险对冲策略

## 待办：UI/UX 优化（低优先级——不影响核心可靠性/可用性，滞后处理）

> **说明**：渲染层代码完全在 SDK 无关区域，以下改进不受迁移影响，随时可做。

### P0：流式渲染性能（已完成）

- [x] `message-store` rAF 批量合并 — `pendingDeltas` + `requestAnimationFrame` 每帧只触发一次 `set()`
- [x] CSS containment — `[data-group-id]` 加 `contain: layout style`，旧消息组加 `content-visibility: auto`
- [x] 消息窗口切片 — `ConversationFlow` 只渲染最近 30 组，上滑 IntersectionObserver 按需加载历史
- [x] 组件 memoization — `MessageMarkdown` / `TextMessage` / `AiMessageGroup` / `FlowRunRenderer` 加 `React.memo()`
- [x] 滚动回调 rAF 节流 — `useAutoScroll.handleScroll` 用 `requestAnimationFrame` 去重

### P1：交互反馈补全

- [x] **Timeline scrollToGroup 着陆高亮**：`flash-highlight` CSS 动画已实现
- [ ] **工具状态过渡动画**：`running` → `completed` 时状态点颜色瞬间跳变，需加 `transition-colors duration-300` + 完成时短暂 `scale` 弹跳

### P2：Rewind 操作安全感

- [ ] **主聊天区截断线**：点击 "Rewind to here" 时在对应位置渲染红色截断线，线以下消息加半透明遮罩
- [ ] **确认 Dialog 升级**：从 260px 侧边栏内联面板升级为居中 Dialog，给足空间展示变更文件列表

### P2：设计 Token 修补

- [ ] `--brand` 只在 `.dark` / `.warm` 定义，`:root`（light 模式）缺失
- [ ] 缺少 exit 动画 keyframe（消息被删除/rewind 时瞬间消失）
- [ ] 缺少 skeleton pulse 动画 keyframe

### P3：暂缓

- Framer Motion 引入（纯 CSS 当前够用）
- Timeline 可拖拽宽度
- 消息退出动画（需 AnimatePresence，复杂度高）

## 资源索引

- 官方 SDK：`@anthropic-ai/claude-agent-sdk`（npm）
- 官方 CLI 文档：https://docs.anthropic.com/en/docs/claude-code.md
