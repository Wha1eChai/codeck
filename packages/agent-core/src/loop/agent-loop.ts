import { streamText } from 'ai'
import type { LanguageModel, CoreMessage, CoreToolMessage, UserContent } from 'ai'
import type { AgentEvent, StepUsage, TotalUsage } from './types.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { ToolContext } from '../tools/types.js'
import type { PermissionGate } from '../permission/gate.js'
import type { PermissionResponse } from '../permission/types.js'
import { createDoomDetector } from './doom-detector.js'
import { pruneMessages as pruneMessagesForBudget, createContextBudget } from '../context/context-manager.js'
import { createTaskTool } from '../tools/task.js'
import type { TaskToolOptions } from '../tools/task.js'
import { createTeamTools } from '../tools/team.js'
import { createToolRegistry } from '../tools/registry.js'

export interface AgentLoopOptions {
  readonly model: LanguageModel
  readonly systemPrompt: string
  readonly tools: ToolRegistry
  readonly toolContext: ToolContext
  readonly permissionGate?: PermissionGate
  readonly maxSteps?: number
  readonly abortSignal?: AbortSignal
  readonly providerOptions?: Record<string, unknown>
  /** Context window size in tokens. When set, enables automatic message pruning. */
  readonly contextWindow?: number
  /** Max output tokens reserved for pruning budget. Defaults to 64000. */
  readonly maxOutputTokens?: number
  /** Enable Anthropic prompt caching on system prompt. Defaults to false. */
  readonly enablePromptCaching?: boolean
  /** Enable the Task (sub-agent) tool. Default: false. */
  readonly enableSubAgent?: boolean
  /** Maximum sub-agent recursion depth. Default: 1 (no nested sub-agents). */
  readonly subAgentDepth?: number
  /** Enable Team tools (SpawnSession, SendMessage, GetSessionStatus). Default: false. */
  readonly enableTeamTools?: boolean
}

const DEFAULT_MAX_STEPS = 100

function extractUsage(usage: Record<string, unknown>): StepUsage {
  const inputTokens = typeof usage['inputTokens'] === 'number' ? usage['inputTokens'] : 0
  const outputTokens = typeof usage['outputTokens'] === 'number' ? usage['outputTokens'] : 0
  const inputDetails = usage['inputTokenDetails'] as Record<string, unknown> | undefined
  const outputDetails = usage['outputTokenDetails'] as Record<string, unknown> | undefined

  const base: StepUsage = { inputTokens, outputTokens }
  const cacheReadTokens = typeof inputDetails?.['cacheReadTokens'] === 'number'
    ? inputDetails['cacheReadTokens'] : undefined
  const cacheWriteTokens = typeof inputDetails?.['cacheWriteTokens'] === 'number'
    ? inputDetails['cacheWriteTokens'] : undefined
  const reasoningTokens = typeof outputDetails?.['reasoningTokens'] === 'number'
    ? outputDetails['reasoningTokens'] : undefined

  return {
    ...base,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
  }
}

export async function* startAgentLoop(
  prompt: string,
  options: AgentLoopOptions & { readonly images?: readonly string[] },
): AsyncGenerator<AgentEvent> {
  const images = options.images
  let content: UserContent
  if (images && images.length > 0) {
    content = [
      { type: 'text' as const, text: prompt },
      ...images.map(dataUrl => ({ type: 'image' as const, image: dataUrl })),
    ]
  } else {
    content = prompt
  }
  yield* runAgentLoop([{ role: 'user' as const, content }], options)
}

function cloneRegistryWithTask(source: ToolRegistry, taskOptions: TaskToolOptions): ToolRegistry {
  const clone = createToolRegistry()
  for (const tool of source.getAll()) {
    clone.register(tool)
  }
  if (taskOptions.remainingDepth >= 0) {
    clone.register(createTaskTool(taskOptions))
  }
  return clone
}

export async function* runAgentLoop(
  initialMessages: readonly CoreMessage[],
  options: AgentLoopOptions,
): AsyncGenerator<AgentEvent> {
  const {
    model,
    systemPrompt,
    tools,
    toolContext,
    permissionGate,
    maxSteps = DEFAULT_MAX_STEPS,
    abortSignal,
    providerOptions,
    contextWindow,
    maxOutputTokens: maxOutput = 64_000,
    enablePromptCaching = false,
    enableSubAgent = false,
    subAgentDepth = 1,
    enableTeamTools = false,
  } = options

  // Sub-agent support: clone registry and register Task tool
  let effectiveTools = enableSubAgent && subAgentDepth > 0
    ? cloneRegistryWithTask(tools, {
        model, parentSystemPrompt: systemPrompt, tools, permissionGate, abortSignal,
        contextWindow, maxOutputTokens: maxOutput, enablePromptCaching,
        remainingDepth: subAgentDepth - 1,
      })
    : tools

  // Team tools: register SpawnSession, SendMessage, GetSessionStatus
  if (enableTeamTools) {
    if (effectiveTools === tools) {
      const clone = createToolRegistry()
      for (const tool of tools.getAll()) {
        clone.register(tool)
      }
      effectiveTools = clone
    }
    for (const teamTool of createTeamTools()) {
      effectiveTools.register(teamTool)
    }
  }

  const contextBudget = contextWindow
    ? createContextBudget(contextWindow, maxOutput, systemPrompt)
    : undefined

  // When prompt caching is enabled, deliver system prompt as a cached system message
  // instead of the `system` parameter, so Anthropic can cache it across turns.
  const cachedSystemMessage: CoreMessage | undefined = enablePromptCaching
    ? {
        role: 'system' as const,
        content: systemPrompt,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      } as CoreMessage
    : undefined

  const messages: CoreMessage[] = [...initialMessages]
  const doomDetector = createDoomDetector()
  const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, steps: 0 }

  for (let step = 0; step < maxSteps; step++) {
    if (abortSignal?.aborted) {
      yield { type: 'error', error: 'Aborted' }
      break
    }

    const aiSdkTools = effectiveTools.toAISDKTools(toolContext)

    // Prune messages to fit context window when budget is configured
    const prunedMessages = contextBudget
      ? pruneMessagesForBudget(messages, contextBudget)
      : messages

    // When prompt caching is enabled, prepend cached system message to messages
    // and omit the `system` parameter so Anthropic caches the system prompt.
    const effectiveMessages = cachedSystemMessage
      ? [cachedSystemMessage, ...prunedMessages]
      : prunedMessages

    // Cast needed: exactOptionalPropertyTypes conflicts with AI SDK's spread-based API
    const result = streamText({
      model,
      ...(cachedSystemMessage ? {} : { system: systemPrompt }),
      messages: effectiveMessages,
      tools: aiSdkTools,
      maxSteps: 1,
      ...(abortSignal ? { abortSignal } : {}),
      ...(providerOptions ? { providerOptions } : {}),
    } as Parameters<typeof streamText>[0])

    let text = ''
    let thinking = ''
    let inText = false
    let inThinking = false
    let finishReason = 'stop'
    let stepUsage: StepUsage = { inputTokens: 0, outputTokens: 0 }
    const calls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> = []
    const results: CoreToolMessage['content'] = []

    try {
      for await (const part of result.fullStream) {
        if (abortSignal?.aborted) break

        switch (part.type) {
          case 'text-delta': {
            if (!inText) { inText = true; text = ''; yield { type: 'text_start' } }
            text += part.textDelta
            yield { type: 'text_delta', text: part.textDelta }
            break
          }
          case 'reasoning': {
            if (!inThinking) { inThinking = true; thinking = ''; yield { type: 'thinking_start' } }
            thinking += part.textDelta
            yield { type: 'thinking_delta', text: part.textDelta }
            break
          }
          case 'tool-call': {
            if (inText) { inText = false; yield { type: 'text_end', text } }
            if (inThinking) { inThinking = false; yield { type: 'thinking_end', text: thinking } }

            const args = part.args as Record<string, unknown>
            calls.push({ toolCallId: part.toolCallId, toolName: part.toolName, args })
            yield { type: 'tool_call_start', toolCallId: part.toolCallId, toolName: part.toolName }
            yield { type: 'tool_call_args', toolCallId: part.toolCallId, args }

            const toolOutput = await executeToolCall(
              part.toolCallId, part.toolName, args,
              effectiveTools, toolContext, permissionGate, doomDetector,
            )
            // Emit batched child events from sub-agent tool
            if (toolOutput.childEvents && toolOutput.childEvents.length > 0) {
              yield { type: 'child_events', toolCallId: part.toolCallId, events: toolOutput.childEvents }
            }
            const { childEvents: _ce, ...toolResultEvent } = toolOutput
            yield { type: 'tool_result', ...toolResultEvent }
            results.push({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: toolOutput.result,
              ...(toolOutput.isError ? { isError: true } : {}),
            })
            break
          }
          case 'step-finish':
          case 'finish': {
            finishReason = part.finishReason
            stepUsage = extractUsage(part.usage as unknown as Record<string, unknown>)
            break
          }
          case 'error': {
            yield { type: 'error', error: String(part.error) }
            break
          }
          default:
            break
        }
      }
    } catch (err) {
      if (abortSignal?.aborted) { yield { type: 'error', error: 'Aborted' }; break }
      yield { type: 'error', error: `Stream error: ${(err as Error).message}` }
      break
    }

    if (inText) yield { type: 'text_end', text }
    if (inThinking) yield { type: 'thinking_end', text: thinking }

    total.inputTokens += stepUsage.inputTokens
    total.outputTokens += stepUsage.outputTokens
    total.cacheReadTokens += stepUsage.cacheReadTokens ?? 0
    total.cacheWriteTokens += stepUsage.cacheWriteTokens ?? 0
    total.reasoningTokens += stepUsage.reasoningTokens ?? 0
    total.steps++

    yield { type: 'step_end', step, finishReason, usage: stepUsage }

    if (text || calls.length > 0) {
      const content: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown> }> = []
      if (text) content.push({ type: 'text', text })
      for (const c of calls) content.push({ type: 'tool-call', toolCallId: c.toolCallId, toolName: c.toolName, args: c.args })
      messages.push({ role: 'assistant', content })
    }
    if (results.length > 0) messages.push({ role: 'tool', content: results })

    if (finishReason !== 'tool-calls' || calls.length === 0) break
  }

  yield { type: 'done', totalUsage: { ...total } as TotalUsage }
}

interface ToolCallOutput {
  readonly toolCallId: string
  readonly toolName: string
  readonly result: string
  readonly isError: boolean
  readonly childEvents?: readonly AgentEvent[]
}

async function executeToolCall(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  tools: ToolRegistry,
  toolContext: ToolContext,
  permissionGate: PermissionGate | undefined,
  doomDetector: ReturnType<typeof createDoomDetector>,
): Promise<ToolCallOutput> {
  if (doomDetector.record(toolName, args)) {
    return { toolCallId, toolName, result: 'Error: Doom loop detected — same tool called with same arguments 3 times in a row.', isError: true }
  }

  if (permissionGate) {
    let response: PermissionResponse
    try {
      response = await permissionGate.check(toolName, args)
    } catch (err) {
      return { toolCallId, toolName, result: `Permission check failed: ${(err as Error).message}`, isError: true }
    }
    if (!response.allowed) {
      return { toolCallId, toolName, result: `Permission denied: ${response.reason ?? 'User denied'}`, isError: true }
    }
  }

  const toolDef = tools.get(toolName)
  if (!toolDef) {
    return { toolCallId, toolName, result: `Unknown tool: ${toolName}`, isError: true }
  }

  try {
    const toolResult = await toolDef.execute(args, toolContext)
    const childEvents = Array.isArray(toolResult.metadata?.childEvents)
      ? toolResult.metadata.childEvents as AgentEvent[]
      : undefined
    return {
      toolCallId, toolName,
      result: toolResult.output,
      isError: toolResult.isError ?? false,
      ...(childEvents ? { childEvents } : {}),
    }
  } catch (err) {
    return { toolCallId, toolName, result: `Tool execution error: ${(err as Error).message}`, isError: true }
  }
}
