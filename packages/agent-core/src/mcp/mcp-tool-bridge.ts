import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.js';
import type { McpConnection, McpToolDefinition } from './client.js';

function toZodSchema(schema: unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.record(z.string(), z.unknown());
  }

  const jsonSchema = schema as Record<string, unknown>;
  const type = jsonSchema.type;

  if (Array.isArray(type)) {
    const variants = type
      .map((variant) => toZodSchema({ ...jsonSchema, type: variant }))
      .filter(Boolean) as z.ZodTypeAny[];
    if (variants.length === 0) {
      return z.unknown();
    }
    return z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(toZodSchema(jsonSchema.items));
    case 'object':
    default:
      return toObjectSchema(jsonSchema);
  }
}

function toObjectSchema(schema: Record<string, unknown>): z.ZodTypeAny {
  const properties =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : [],
  );

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(properties)) {
    const nested = toZodSchema(value);
    shape[key] = required.has(key) ? nested : nested.optional();
  }

  return z.object(shape).passthrough();
}

export function bridgeMcpTools(
  connection: McpConnection,
  tools: readonly McpToolDefinition[],
): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toZodSchema(tool.inputSchema),
    async execute(params): Promise<{ output: string; isError: boolean }> {
      return connection.callTool(tool.name, params as Record<string, unknown>);
    },
  }));
}
