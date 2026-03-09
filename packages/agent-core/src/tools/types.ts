import { z } from 'zod'

export interface ToolResult {
  readonly output: string
  readonly metadata?: Record<string, unknown>
  readonly isError?: boolean
}

export interface TeamBridge {
  spawnChild(params: {
    role: string
    prompt: string
    useWorktree?: boolean
    model?: string
  }): Promise<{ sessionId: string }>

  sendToChild(sessionId: string, message: string): Promise<void>

  getChildStatus(sessionId: string): Promise<{
    status: 'idle' | 'streaming' | 'error' | 'not_found'
    lastMessage?: string
    error?: string
  }>
}

export interface ToolContext {
  readonly sessionId: string
  readonly cwd: string
  readonly abortSignal: AbortSignal
  readonly teamBridge?: TeamBridge
}

export interface ToolDefinition<TParams extends z.ZodType = z.ZodType> {
  readonly name: string
  readonly description: string
  readonly parameters: TParams
  execute(params: z.infer<TParams>, ctx: ToolContext): Promise<ToolResult>
}
