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
│       ├── ipc-handlers.ts      # IPC 处理器（Zod 验证）
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
Renderer IPC → ipc-handlers.ts（Zod 验证）→ SessionOrchestrator
    ├─→ RuntimeContextService.buildContext() → 优先级解析 runtime/permissionMode
    ├─→ CapabilityGate.evaluate() → 校验权限模式
    ├─→ SessionContextStore → Per-session 上下文（AbortController / resolver / queryRef）
    ├─→ SessionManager → 内存状态（activeSessions Map + focusedSessionId）
    ├─→ ClaudeFilesService → JSONL 读写 + ccuiProjectMeta 元数据
    ├─→ WorktreeService → Git worktree 创建/合并/删除
    └─→ ClaudeService.startSessionWithContext(ctx) → SDK query()
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

扩展新运行时只需实现 `RuntimeAdapter` 接口：
```typescript
interface RuntimeAdapter {
  readonly id: RuntimeId;
  getCapabilities(): RuntimeCapabilityReport;
  startSession(window: BrowserWindow, params: RuntimeSessionParams): Promise<void>;
  abort(): void;
  resetSession(): void;
  resolvePermission(response: PermissionResponse): void;
}
```

## 开发阶段

- Phase 1（已完成）— 核心对话：项目选择、会话管理、流式聊天、权限审批
- Phase 2（已完成）— 体验增强：Diff 视图、文件管理器、Token 仪表盘、Checkpoint 时间轴、会话历史、消息分组渲染
- Phase 3（已完成）— 差异化：Settings 页面化、Plugin/Agent/MCP/Hook/Memory 管理 UI、主题切换
- Phase 4（已完成）— 多 Session 并行：Activity Bar + SessionPanel 侧边栏重设计、Tab Bar 多标签、SessionContext 并发后端、Git Worktree 隔离
- 未完成：远程 WebUI、国际化

### 未解决的 SDK 集成

- **子代理管理** — SDK 通过 `options.agents` 支持 `AgentDefinition`，适配层已解析 `system/init` 中的 agents 元数据，需将 `~/.claude/agents/*.md` 和 SDK `agents` 选项打通
- **MCP 服务器 SDK 透传** — SDK 通过 `options.mcpServers` 支持注入自定义 MCP 服务器，工具名格式 `mcp__<server>__<tool>`，当前仅有配置管理 UI（McpConfigService），未透传给 SDK
- **结构化输出** — SDK 支持 `outputFormat: { type: 'json_schema', schema: ... }` 强制 JSON Schema 输出，构建自动化工作流的基础，当前未实现

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

## 资源索引

- 官方 SDK：`@anthropic-ai/claude-agent-sdk`（npm）
- 官方 CLI 文档：https://docs.anthropic.com/en/docs/claude-code.md
