import { z } from 'zod'
import type { ToolDefinition, ToolResult, ToolContext } from './types.js'

export const TEAM_TOOL_NAMES = ['SpawnSession', 'SendMessage', 'GetSessionStatus'] as const

const spawnSessionParameters = z.object({
  role: z.string().describe('Role description for the child session agent'),
  prompt: z.string().describe('Initial prompt to send to the child session'),
  useWorktree: z.boolean().optional().describe('Whether to use git worktree isolation for the child session'),
  model: z.string().optional().describe('Model override for the child session (e.g. "sonnet", "haiku")'),
})

const sendMessageParameters = z.object({
  sessionId: z.string().describe('Target child session ID to send the message to'),
  message: z.string().describe('Message content to send to the child session'),
})

const getSessionStatusParameters = z.object({
  sessionId: z.string().describe('Child session ID to check status for'),
})

export function createTeamTools(): readonly ToolDefinition[] {
  const spawnSession: ToolDefinition<typeof spawnSessionParameters> = {
    name: 'SpawnSession',
    description:
      'Spawn a new child session with a specific role. The child runs as an independent agent ' +
      'session that can be communicated with via SendMessage. Use for parallelizing work across ' +
      'multiple agents, each with its own context and optional worktree isolation.',
    parameters: spawnSessionParameters,

    async execute(
      params: z.infer<typeof spawnSessionParameters>,
      ctx: ToolContext,
    ): Promise<ToolResult> {
      if (!ctx.teamBridge) {
        return { output: 'Team tools are not available in this context.', isError: true }
      }
      try {
        const result = await ctx.teamBridge.spawnChild({
          role: params.role,
          prompt: params.prompt,
          useWorktree: params.useWorktree,
          model: params.model,
        })
        return { output: JSON.stringify(result) }
      } catch (err) {
        return { output: `SpawnSession failed: ${(err as Error).message}`, isError: true }
      }
    },
  }

  const sendMessage: ToolDefinition<typeof sendMessageParameters> = {
    name: 'SendMessage',
    description:
      'Send a message to a child session. The child agent will process the message ' +
      'asynchronously. Use GetSessionStatus to check progress and retrieve results.',
    parameters: sendMessageParameters,

    async execute(
      params: z.infer<typeof sendMessageParameters>,
      ctx: ToolContext,
    ): Promise<ToolResult> {
      if (!ctx.teamBridge) {
        return { output: 'Team tools are not available in this context.', isError: true }
      }
      try {
        await ctx.teamBridge.sendToChild(params.sessionId, params.message)
        return { output: 'Message sent successfully.' }
      } catch (err) {
        return { output: `SendMessage failed: ${(err as Error).message}`, isError: true }
      }
    },
  }

  const getSessionStatus: ToolDefinition<typeof getSessionStatusParameters> = {
    name: 'GetSessionStatus',
    description:
      'Check the status of a child session. Returns the current state (idle, streaming, error, ' +
      'not_found), the last message from the child, and any error details.',
    parameters: getSessionStatusParameters,

    async execute(
      params: z.infer<typeof getSessionStatusParameters>,
      ctx: ToolContext,
    ): Promise<ToolResult> {
      if (!ctx.teamBridge) {
        return { output: 'Team tools are not available in this context.', isError: true }
      }
      try {
        const result = await ctx.teamBridge.getChildStatus(params.sessionId)
        return { output: JSON.stringify(result) }
      } catch (err) {
        return { output: `GetSessionStatus failed: ${(err as Error).message}`, isError: true }
      }
    },
  }

  return [spawnSession, sendMessage, getSessionStatus]
}
