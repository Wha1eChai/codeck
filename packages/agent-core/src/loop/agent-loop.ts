import { streamText } from 'ai'
import type { LanguageModel, CoreMessage, CoreToolMessage, UserContent } from 'ai'
import type { AgentEvent, StepUsage, TotalUsage } from './types.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { ToolContext } from '../tools/types.js'
import type { PermissionGate } from '../permission/gate.js'
import type { PermissionResponse } from '../permission/types.js'
import { createDoomDetector } from './doom-detector.js'

export interface AgentLoopOptions {
  readonly model: LanguageModel
  readonly systemPrompt: string
  readonly tools: ToolRegistry
  readonly toolContext: ToolContext
  readonly permissionGate?: PermissionGate
  readonly maxSteps?: number
  readonly abortSignal?: AbortSignal
  readonly providerOptions?: Record<string, unknown>
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
  } = options

  const messages: CoreMessage[] = [...initialMessages]
  const doomDetector = createDoomDetector()
  const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, steps: 0 }

  for (let step = 0; step < maxSteps; step++) {
    if (abortSignal?.aborted) {
      yield { type: 'error', error: 'Aborted' }
      break
    }

    const aiSdkTools = tools.toAISDKTools(toolContext)

    // Cast needed: exactOptionalPropertyTypes conflicts with AI SDK's spread-based API
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
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
              tools, toolContext, permissionGate, doomDetector,
            )
            yield { type: 'tool_result', ...toolOutput }
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
    return { toolCallId, toolName, result: toolResult.output, isError: toolResult.isError ?? false }
  } catch (err) {
    return { toolCallId, toolName, result: `Tool execution error: ${(err as Error).message}`, isError: true }
  }
}
