import { tool as aiTool } from 'ai'
import type { ToolDefinition, ToolContext } from './types.js'

export interface ToolRegistry {
  register(tool: ToolDefinition): void
  get(name: string): ToolDefinition | undefined
  getAll(): readonly ToolDefinition[]
  /** Convert to Vercel AI SDK tools format for streamText() */
  toAISDKTools(ctx: ToolContext): Record<string, unknown>
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>()

  return {
    register(definition: ToolDefinition): void {
      tools.set(definition.name, definition)
    },

    get(name: string): ToolDefinition | undefined {
      return tools.get(name)
    },

    getAll(): readonly ToolDefinition[] {
      return [...tools.values()]
    },

    toAISDKTools(_ctx: ToolContext): Record<string, unknown> {
      // NOTE: We intentionally omit `execute` here. The agent-loop handles
      // tool execution manually after receiving tool-call events from the stream.
      // Including execute would cause AI SDK to auto-execute tools when maxSteps > 1,
      // leading to double execution of side-effecting tools (Write, Bash, etc.).
      const result: Record<string, unknown> = {}
      for (const [name, def] of tools) {
        result[name] = aiTool({
          description: def.description,
          parameters: def.parameters,
        })
      }
      return result
    },
  }
}
