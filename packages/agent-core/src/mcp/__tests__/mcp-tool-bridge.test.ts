import { describe, expect, it, vi } from 'vitest';
import { bridgeMcpTools } from '../mcp-tool-bridge.js';
import type { McpConnection, McpToolDefinition } from '../client.js';

describe('bridgeMcpTools', () => {
  it('bridges MCP tools into executable ToolDefinitions', async () => {
    const callTool = vi.fn().mockResolvedValue({ output: 'done', isError: false });
    const connection: McpConnection = {
      serverName: 'filesystem',
      listTools: async () => [],
      callTool,
      close: async () => undefined,
    };

    const mcpTools: readonly McpToolDefinition[] = [
      {
        serverName: 'filesystem',
        name: 'read_file',
        description: 'Read a file from disk',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
    ];

    const [tool] = bridgeMcpTools(connection, mcpTools);
    expect(tool?.parameters.safeParse({ path: '/tmp/a.ts' }).success).toBe(true);
    expect(tool?.parameters.safeParse({}).success).toBe(false);

    const result = await tool!.execute(
      { path: '/tmp/a.ts' },
      { sessionId: 's1', cwd: '/tmp', abortSignal: new AbortController().signal },
    );

    expect(callTool).toHaveBeenCalledWith('read_file', { path: '/tmp/a.ts' });
    expect(result).toEqual({ output: 'done', isError: false });
  });
});
