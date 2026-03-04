// ── AskUserQuestion 交互 ──

export interface AskUserQuestionOption {
  readonly label: string
  readonly description: string
}

export interface AskUserQuestionItem {
  readonly question: string
  readonly header: string
  readonly options: readonly AskUserQuestionOption[]
  readonly multiSelect: boolean
}

export interface AskUserQuestionRequest {
  readonly id: string
  readonly toolUseId: string
  readonly questions: readonly AskUserQuestionItem[]
}

export interface AskUserQuestionResponse {
  readonly requestId: string
  /** question text → selected label; multi-select labels are comma-separated */
  readonly answers: Readonly<Record<string, string>>
  readonly cancelled: boolean
}

// ── ExitPlanMode 审批 ──

export interface ExitPlanModeRequest {
  readonly id: string
  readonly toolUseId: string
  readonly allowedPrompts?: readonly { tool: string; prompt: string }[]
}

export interface ExitPlanModeResponse {
  readonly requestId: string
  /** true = 允许计划执行（选项1/2/3），false = 拒绝/继续规划（选项4） */
  readonly allowed: boolean
  /** 仅当 allowed=false 时：反馈给 Claude 的说明文字 */
  readonly feedback?: string
}

// ── 权限审批 ──

export interface PermissionRequest {
  readonly id: string
  readonly toolName: string
  readonly toolInput: Record<string, unknown>
  readonly description: string
  readonly risk: "low" | "medium" | "high"
  readonly toolUseId?: string
  readonly agentId?: string
  readonly suggestions?: readonly unknown[]
  readonly decisionReason?: string
}

export interface PermissionResponse {
  readonly requestId: string
  readonly allowed: boolean
  readonly reason?: string
  /** 本次会话自动允许此工具 */
  readonly rememberForSession?: boolean
  /** 记忆粒度: 'tool' = 整个工具类型, 'input' = 精确匹配输入 */
  readonly rememberScope?: 'input' | 'tool'
}
