import { z } from 'zod'
import type { ToolDefinition, ToolResult, ToolContext } from './types.js'
import type { ToolRegistry } from './registry.js'
import { createToolRegistry } from './registry.js'
import { startAgentLoop } from '../loop/agent-loop.js'
import type { AgentEvent } from '../loop/types.js'
import type { PermissionGate } from '../permission/gate.js'
import type { LanguageModel } from 'ai'

const TASK_TOOL_NAME = 'Task'

const parameters = z.object({
  prompt: z.string().describe('The task description for the sub-agent to complete'),
  allowedTools: z.array(z.string()).optional().describe(
    'Tool names the sub-agent can use. Defaults to all tools except Task.',
  ),
  maxSteps: z.number().int().min(1).max(30).optional().describe(
    'Maximum steps for the sub-agent (default: 15)',
  ),
  context: z.string().optional().describe(
    'Additional context to prepend to the sub-agent system prompt',
  ),
})

export interface TaskToolOptions {
  readonly model: LanguageModel
  readonly parentSystemPrompt: string
  readonly tools: ToolRegistry
  readonly permissionGate?: PermissionGate
  readonly abortSignal?: AbortSignal
  readonly contextWindow?: number
  readonly maxOutputTokens?: number
  readonly enablePromptCaching?: boolean
  /** Remaining recursion depth. When 0, Task tool is not registered. */
  readonly remainingDepth: number
}

const CHILD_SYSTEM_PROMPT_PREFIX = `You are a focused sub-agent. Complete the assigned task concisely.
Do not ask questions — work with the information provided.
When done, respond with a brief summary of what you accomplished.

`

function filterTools(parentTools: ToolRegistry, allowedNames?: readonly string[]): ToolRegistry {
  const filtered = createToolRegistry()
  for (const tool of parentTools.getAll()) {
    if (tool.name === TASK_TOOL_NAME) continue
    if (allowedNames && !allowedNames.includes(tool.name)) continue
    filtered.register(tool)
  }
  return filtered
}

export function createTaskTool(options: TaskToolOptions): ToolDefinition<typeof parameters> {
  return {
    name: TASK_TOOL_NAME,
    description:
      'Delegate a sub-task to an isolated agent. The sub-agent runs with its own context ' +
      'and returns a summary. Use for research, validation, or focused work that benefits ' +
      'from a clean context window.',
    parameters,

    async execute(
      params: z.infer<typeof parameters>,
      ctx: ToolContext,
    ): Promise<ToolResult> {
      const childTools = filterTools(options.tools, params.allowedTools)
      const childMaxSteps = params.maxSteps ?? 15
      const childSystemPrompt = params.context
        ? CHILD_SYSTEM_PROMPT_PREFIX + params.context
        : CHILD_SYSTEM_PROMPT_PREFIX

      const childEvents: AgentEvent[] = []
      let lastText = ''

      try {
        const stream = startAgentLoop(params.prompt, {
          model: options.model,
          systemPrompt: childSystemPrompt,
          tools: childTools,
          toolContext: { sessionId: ctx.sessionId, cwd: ctx.cwd, abortSignal: ctx.abortSignal },
          permissionGate: options.permissionGate,
          maxSteps: childMaxSteps,
          abortSignal: ctx.abortSignal,
          ...(options.contextWindow ? { contextWindow: options.contextWindow, maxOutputTokens: options.maxOutputTokens } : {}),
          enablePromptCaching: options.enablePromptCaching,
        })

        for await (const event of stream) {
          childEvents.push(event)
          if (event.type === 'text_end') {
            lastText = event.text
          }
        }
      } catch (err) {
        return {
          output: `Sub-agent error: ${(err as Error).message}`,
          isError: true,
          metadata: { childEvents },
        }
      }

      const summary = lastText || 'Sub-agent completed without text output.'
      return {
        output: summary,
        metadata: { childEvents },
      }
    },
  }
}

export { TASK_TOOL_NAME }
