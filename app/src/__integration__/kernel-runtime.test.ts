/**
 * Kernel Runtime Integration Tests
 *
 * These tests exercise the full kernel agent loop against the real Anthropic API.
 * They require:
 *   - ANTHROPIC_API_KEY environment variable
 *   - Network access
 *
 * Run with: pnpm --filter codeck test:integration
 *
 * Each test creates a unique session ID to avoid conflicts.
 * Tests are independent and can run in parallel.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  startAgentLoop,
  runAgentLoop,
  createDefaultToolRegistry,
  assembleSystemPrompt,
  createEventToMessageMapper,
  createPermissionGate,
  createPermissionMemoryStore,
} from '@codeck/agent-core';
import type { AgentEvent, ToolRegistry } from '@codeck/agent-core';
import { createAnthropicProvider } from '@codeck/provider';
import { reconstructCoreMessages } from '../main/services/claude-files/transcript-to-core-messages';
import type { Message } from '@common/types';
import crypto from 'crypto';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const hasApiKey = Boolean(API_KEY);

// Use haiku for cost efficiency in integration tests
const MODEL_ALIAS = 'haiku';

function createProvider() {
  return createAnthropicProvider({ apiKey: API_KEY! });
}

function createSessionId(): string {
  return `integration-test-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

async function collectEvents(stream: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function eventsToMessages(events: AgentEvent[], sessionId: string): Message[] {
  const mapper = createEventToMessageMapper({
    sessionId,
    idGenerator: () => crypto.randomUUID(),
  });
  const messages: Message[] = [];
  for (const event of events) {
    const msg = mapper.map(event);
    if (msg) messages.push(msg);
  }
  return messages;
}

describe.skipIf(!hasApiKey)('Kernel Runtime Integration', () => {
  let provider: ReturnType<typeof createAnthropicProvider>;
  let tools: ToolRegistry;
  let systemPrompt: string;

  beforeAll(async () => {
    provider = createProvider();
    tools = createDefaultToolRegistry();
    systemPrompt = await assembleSystemPrompt({
      cwd: process.cwd(),
      platform: process.platform,
      model: 'claude-haiku-4-5-20251001',
      date: new Date().toISOString().split('T')[0]!,
    });
  });

  it('scenario 1: basic conversation — send message, receive streaming response', async () => {
    const sessionId = createSessionId();
    const resolved = provider.resolveModel(MODEL_ALIAS);

    const events = await collectEvents(
      startAgentLoop('Reply with exactly: "Hello from kernel integration test". Nothing else.', {
        model: resolved.languageModel,
        systemPrompt,
        tools,
        toolContext: { sessionId, cwd: process.cwd() },
        maxSteps: 1,
      }),
    );

    // Must have text events and a done event
    const textDeltas = events.filter((e) => e.type === 'text_delta');
    const doneEvents = events.filter((e) => e.type === 'done');
    expect(textDeltas.length).toBeGreaterThan(0);
    expect(doneEvents).toHaveLength(1);

    // Full text should contain the expected response
    const textEnd = events.find((e) => e.type === 'text_end');
    expect(textEnd).toBeDefined();
    expect((textEnd as { text: string }).text.toLowerCase()).toContain('hello from kernel');

    // Usage should be reported
    const done = doneEvents[0] as { totalUsage: { inputTokens: number; outputTokens: number } };
    expect(done.totalUsage.inputTokens).toBeGreaterThan(0);
    expect(done.totalUsage.outputTokens).toBeGreaterThan(0);

    // Event-to-message mapper should produce valid messages
    const messages = eventsToMessages(events, sessionId);
    expect(messages.length).toBeGreaterThan(0);
    const textMessages = messages.filter((m) => m.type === 'text' && m.role === 'assistant');
    expect(textMessages.length).toBeGreaterThan(0);
  }, 30_000);

  it('scenario 2: tool execution — agent calls Read tool', async () => {
    const sessionId = createSessionId();
    const resolved = provider.resolveModel(MODEL_ALIAS);

    const events = await collectEvents(
      startAgentLoop('Read the file package.json in the current directory and tell me the project name. Use the Read tool.', {
        model: resolved.languageModel,
        systemPrompt,
        tools,
        toolContext: { sessionId, cwd: process.cwd() },
        maxSteps: 5,
      }),
    );

    // Should have tool call events
    const toolCalls = events.filter((e) => e.type === 'tool_call_start');
    expect(toolCalls.length).toBeGreaterThan(0);

    // At least one tool call should be to Read
    const readCall = toolCalls.find(
      (e) => (e as { toolName: string }).toolName === 'Read',
    );
    expect(readCall).toBeDefined();

    // Should have tool results
    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults.length).toBeGreaterThan(0);

    // The result should contain content from package.json
    const readResult = toolResults.find(
      (e) => (e as { toolName: string }).toolName === 'Read',
    ) as { result: string } | undefined;
    expect(readResult?.result).toBeDefined();
  }, 60_000);

  it('scenario 3: permission flow — gate blocks tool and reports denial', async () => {
    const sessionId = createSessionId();
    const resolved = provider.resolveModel(MODEL_ALIAS);

    // Create a permission gate that denies everything
    const gate = createPermissionGate({
      store: createPermissionMemoryStore(),
      onPermissionRequest: async () => ({
        requestId: 'test',
        allowed: false,
        reason: 'Integration test denial',
      }),
    });

    const events = await collectEvents(
      startAgentLoop('List files in the current directory using the Bash tool with command "ls".', {
        model: resolved.languageModel,
        systemPrompt,
        tools,
        toolContext: { sessionId, cwd: process.cwd() },
        permissionGate: gate,
        maxSteps: 3,
      }),
    );

    // Should have tool result with denial
    const toolResults = events.filter((e) => e.type === 'tool_result');
    const denied = toolResults.find(
      (e) => (e as { isError: boolean; result: string }).isError &&
        (e as { result: string }).result.includes('denied'),
    );
    expect(denied).toBeDefined();
  }, 60_000);

  it('scenario 4: session resume — reconstruct history and continue conversation', async () => {
    const sessionId = createSessionId();
    const resolved = provider.resolveModel(MODEL_ALIAS);

    // Turn 1: initial conversation
    const turn1Events = await collectEvents(
      startAgentLoop('Remember: the secret code is ALPHA-7. Confirm you received it.', {
        model: resolved.languageModel,
        systemPrompt,
        tools,
        toolContext: { sessionId, cwd: process.cwd() },
        maxSteps: 1,
      }),
    );

    // Convert events to messages (simulating JSONL persistence)
    const turn1Messages = eventsToMessages(turn1Events, sessionId);
    expect(turn1Messages.length).toBeGreaterThan(0);

    // Build full transcript: user message + assistant response
    const transcript: Message[] = [
      {
        id: `user_${Date.now()}`,
        sessionId,
        role: 'user',
        type: 'text',
        content: 'Remember: the secret code is ALPHA-7. Confirm you received it.',
        timestamp: Date.now(),
      },
      ...turn1Messages,
    ];

    // Reconstruct CoreMessage[] from transcript
    const coreMessages = reconstructCoreMessages(transcript);
    expect(coreMessages.length).toBeGreaterThanOrEqual(2); // user + assistant

    // Turn 2: resume with history + new user message
    const resumeMessages = [
      ...coreMessages,
      { role: 'user' as const, content: 'What was the secret code I told you earlier? Reply with just the code.' },
    ];

    const turn2Events = await collectEvents(
      runAgentLoop(resumeMessages, {
        model: resolved.languageModel,
        systemPrompt,
        tools,
        toolContext: { sessionId, cwd: process.cwd() },
        maxSteps: 1,
      }),
    );

    // The response should reference ALPHA-7
    const textEnd = turn2Events.find((e) => e.type === 'text_end');
    expect(textEnd).toBeDefined();
    expect((textEnd as { text: string }).text).toContain('ALPHA-7');
  }, 60_000);

  it('scenario 5: abort — clean termination mid-stream', async () => {
    const sessionId = createSessionId();
    const resolved = provider.resolveModel(MODEL_ALIAS);
    const abortController = new AbortController();

    // Start a long task, abort after first text delta
    const stream = startAgentLoop('Write a very long essay about the history of computing, at least 2000 words.', {
      model: resolved.languageModel,
      systemPrompt,
      tools,
      toolContext: { sessionId, cwd: process.cwd(), abortSignal: abortController.signal },
      maxSteps: 1,
      abortSignal: abortController.signal,
    });

    const events: AgentEvent[] = [];
    for await (const event of stream) {
      events.push(event);
      if (event.type === 'text_delta') {
        // Abort after receiving first text
        abortController.abort();
        break;
      }
    }

    // Should have received at least one event before abort
    expect(events.length).toBeGreaterThan(0);
    // No uncaught promise rejections — clean termination
  }, 30_000);

  it('scenario 6: model selection — haiku produces cheaper output', async () => {
    const sessionId = createSessionId();
    const resolvedHaiku = provider.resolveModel('haiku');

    // Verify model resolution
    expect(resolvedHaiku.ref.modelId).toContain('haiku');

    const events = await collectEvents(
      startAgentLoop('Say "OK".', {
        model: resolvedHaiku.languageModel,
        systemPrompt,
        tools,
        toolContext: { sessionId, cwd: process.cwd() },
        maxSteps: 1,
      }),
    );

    const done = events.find((e) => e.type === 'done') as
      | { totalUsage: { inputTokens: number; outputTokens: number } }
      | undefined;
    expect(done).toBeDefined();
    // Haiku should use minimal output tokens for "OK"
    expect(done!.totalUsage.outputTokens).toBeLessThan(100);
  }, 30_000);
});
