/**
 * Multi-Session Kernel Integration Tests
 *
 * Verifies that multiple kernel sessions can run concurrently without interference.
 * Requires ANTHROPIC_API_KEY environment variable.
 *
 * Run with: pnpm --filter codeck test:integration
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  startAgentLoop,
  createDefaultToolRegistry,
  assembleSystemPrompt,
  createEventToMessageMapper,
} from '@codeck/agent-core';
import type { AgentEvent } from '@codeck/agent-core';
import { createAnthropicProvider } from '@codeck/provider';
import type { Message } from '@common/types';
import crypto from 'crypto';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_URL = process.env.ANTHROPIC_BASE_URL;
const MODEL_ID = process.env.INTEGRATION_TEST_MODEL || 'haiku';
const hasApiKey = Boolean(API_KEY);

function createProvider() {
  return createAnthropicProvider({
    apiKey: API_KEY!,
    ...(BASE_URL ? { baseURL: BASE_URL } : {}),
  });
}

function createSessionId(): string {
  return `multi-test-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

async function collectEvents(stream: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe.skipIf(!hasApiKey)('Multi-Session Kernel Integration', () => {
  let provider: ReturnType<typeof createAnthropicProvider>;
  let systemPrompt: string;

  beforeAll(async () => {
    provider = createProvider();
    systemPrompt = await assembleSystemPrompt({
      cwd: process.cwd(),
      platform: process.platform,
      model: MODEL_ID,
      date: new Date().toISOString().split('T')[0]!,
    });
  });

  it('concurrent sessions produce independent results', async () => {
    const resolved = provider.resolveModel(MODEL_ID);
    const tools = createDefaultToolRegistry();

    const sessionA = createSessionId();
    const sessionB = createSessionId();

    // Launch two sessions in parallel
    const [eventsA, eventsB] = await Promise.all([
      collectEvents(
        startAgentLoop('Reply with exactly: "SESSION-A-REPLY". Nothing else.', {
          model: resolved.languageModel,
          systemPrompt,
          tools,
          toolContext: { sessionId: sessionA, cwd: process.cwd() },
          maxSteps: 1,
        }),
      ),
      collectEvents(
        startAgentLoop('Reply with exactly: "SESSION-B-REPLY". Nothing else.', {
          model: resolved.languageModel,
          systemPrompt,
          tools: createDefaultToolRegistry(), // separate registry instance
          toolContext: { sessionId: sessionB, cwd: process.cwd() },
          maxSteps: 1,
        }),
      ),
    ]);

    // Both should complete with done events
    expect(eventsA.find((e) => e.type === 'done')).toBeDefined();
    expect(eventsB.find((e) => e.type === 'done')).toBeDefined();

    // Results should be independent
    const textA = (eventsA.find((e) => e.type === 'text_end') as { text: string } | undefined)?.text ?? '';
    const textB = (eventsB.find((e) => e.type === 'text_end') as { text: string } | undefined)?.text ?? '';
    expect(textA).toContain('SESSION-A');
    expect(textB).toContain('SESSION-B');

    // Event-to-message mappers produce session-scoped messages
    const mapperA = createEventToMessageMapper({ sessionId: sessionA, idGenerator: () => crypto.randomUUID() });
    const mapperB = createEventToMessageMapper({ sessionId: sessionB, idGenerator: () => crypto.randomUUID() });

    const msgsA: Message[] = eventsA.map((e) => mapperA.map(e)).filter((m): m is Message => m != null);
    const msgsB: Message[] = eventsB.map((e) => mapperB.map(e)).filter((m): m is Message => m != null);

    // Messages should carry their respective session IDs
    for (const msg of msgsA) expect(msg.sessionId).toBe(sessionA);
    for (const msg of msgsB) expect(msg.sessionId).toBe(sessionB);
  }, 60_000);

  it('aborting one session does not affect the other', async () => {
    const resolved = provider.resolveModel(MODEL_ID);

    const sessionA = createSessionId();
    const sessionB = createSessionId();
    const abortA = new AbortController();

    // Session A: will be aborted
    const streamA = startAgentLoop('Write a 500-word essay about quantum computing.', {
      model: resolved.languageModel,
      systemPrompt,
      tools: createDefaultToolRegistry(),
      toolContext: { sessionId: sessionA, cwd: process.cwd(), abortSignal: abortA.signal },
      maxSteps: 1,
      abortSignal: abortA.signal,
    });

    // Session B: should complete normally
    const promiseB = collectEvents(
      startAgentLoop('Reply with exactly: "B-SURVIVED". Nothing else.', {
        model: resolved.languageModel,
        systemPrompt,
        tools: createDefaultToolRegistry(),
        toolContext: { sessionId: sessionB, cwd: process.cwd() },
        maxSteps: 1,
      }),
    );

    // Consume a few events from A, then abort
    const eventsA: AgentEvent[] = [];
    for await (const event of streamA) {
      eventsA.push(event);
      if (event.type === 'text_delta') {
        abortA.abort();
        break;
      }
    }

    // B should complete unaffected
    const eventsB = await promiseB;
    expect(eventsB.find((e) => e.type === 'done')).toBeDefined();
    const textB = (eventsB.find((e) => e.type === 'text_end') as { text: string } | undefined)?.text ?? '';
    expect(textB).toContain('B-SURVIVED');
  }, 60_000);
});
