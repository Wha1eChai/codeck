import { z } from 'zod'

export interface ToolResult {
  readonly output: string
  readonly metadata?: Record<string, unknown>
  readonly isError?: boolean
}

export interface ToolContext {
  readonly sessionId: string
  readonly cwd: string
  readonly abortSignal: AbortSignal
}

export interface ToolDefinition<TParams extends z.ZodType = z.ZodType> {
  readonly name: string
  readonly description: string
  readonly parameters: TParams
  execute(params: z.infer<TParams>, ctx: ToolContext): Promise<ToolResult>
}
