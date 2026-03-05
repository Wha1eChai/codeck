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

    toAISDKTools(ctx: ToolContext): Record<string, unknown> {
      const result: Record<string, unknown> = {}
      for (const [name, def] of tools) {
        result[name] = aiTool({
          description: def.description,
          parameters: def.parameters,
          execute: async (params: unknown) => {
            const toolResult = await def.execute(params, ctx)
            return toolResult.output
          },
        })
      }
      return result
    },
  }
}
