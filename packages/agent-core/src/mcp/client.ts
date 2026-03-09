import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

export interface McpServerConfigLike {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface McpToolDefinition {
  readonly serverName: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface McpConnection {
  readonly serverName: string;
  listTools(): Promise<readonly McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<{ output: string; isError: boolean }>;
  close(): Promise<void>;
}

type McpContentItem = Record<string, unknown>;

function renderContentItem(item: McpContentItem): string {
  if (item.type === 'text' && typeof item.text === 'string') {
    return item.text;
  }

  if (item.type === 'resource' && item.resource && typeof item.resource === 'object') {
    const resource = item.resource as Record<string, unknown>;
    if (typeof resource.text === 'string') {
      return resource.text;
    }
    if (typeof resource.uri === 'string') {
      return `[resource] ${resource.uri}`;
    }
  }

  if (item.type === 'resource_link' && typeof item.uri === 'string') {
    return `[resource] ${item.uri}`;
  }

  return JSON.stringify(item);
}

function renderCallResult(result: Awaited<ReturnType<Client['callTool']>>): string {
  if ('toolResult' in result) {
    return typeof result.toolResult === 'string'
      ? result.toolResult
      : JSON.stringify(result.toolResult, null, 2);
  }

  const parts = (result.content as unknown as McpContentItem[])
    .map(renderContentItem)
    .filter((item) => item.length > 0);

  if (parts.length > 0) {
    return parts.join('\n\n');
  }

  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  return '';
}

export async function connectMcpServer(
  serverName: string,
  config: McpServerConfigLike,
): Promise<McpConnection> {
  if (!config.command) {
    throw new Error(`MCP server "${serverName}" is missing a command`);
  }

  const transport = new StdioClientTransport({
    command: config.command,
    ...(config.args ? { args: [...config.args] } : {}),
    ...(config.env ? { env: { ...config.env } } : {}),
  });

  const client = new Client(
    { name: 'codeck-kernel', version: '0.1.0' },
    { capabilities: {} },
  );
  await client.connect(transport);

  return {
    serverName,
    async listTools(): Promise<readonly McpToolDefinition[]> {
      const response = await client.listTools();
      return response.tools.map((tool) => ({
        serverName,
        name: tool.name,
        description: tool.description ?? `${serverName}:${tool.name}`,
        inputSchema: tool.inputSchema,
      }));
    },
    async callTool(
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ output: string; isError: boolean }> {
      const result = await client.callTool({
        name,
        arguments: args,
      } satisfies CallToolRequest['params']);

      return {
        output: renderCallResult(result),
        isError: Boolean('isError' in result ? result.isError : false),
      };
    },
    async close(): Promise<void> {
      await transport.close();
    },
  };
}
