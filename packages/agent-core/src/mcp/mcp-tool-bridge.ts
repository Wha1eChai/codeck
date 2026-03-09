import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.js';
import type { McpConnection, McpToolDefinition } from './client.js';

function wrapNullable(base: z.ZodTypeAny, schema: Record<string, unknown>): z.ZodTypeAny {
  return schema.nullable === true ? base.nullable() : base;
}

function toZodSchema(schema: unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.record(z.string(), z.unknown());
  }

  const jsonSchema = schema as Record<string, unknown>;

  // Handle oneOf / anyOf (union of sub-schemas)
  const unionKeyword = jsonSchema.oneOf ?? jsonSchema.anyOf;
  if (Array.isArray(unionKeyword) && unionKeyword.length > 0) {
    const variants = unionKeyword.map((sub) => toZodSchema(sub)) as z.ZodTypeAny[];
    if (variants.length === 1) {
      return wrapNullable(variants[0]!, jsonSchema);
    }
    return wrapNullable(
      z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]),
      jsonSchema,
    );
  }

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
    case 'string': {
      const base = Array.isArray(jsonSchema.enum)
        ? z.enum(jsonSchema.enum as [string, ...string[]])
        : z.string();
      return wrapNullable(base, jsonSchema);
    }
    case 'number':
      return wrapNullable(z.number(), jsonSchema);
    case 'integer':
      return wrapNullable(z.number().int(), jsonSchema);
    case 'boolean':
      return wrapNullable(z.boolean(), jsonSchema);
    case 'null':
      return z.null();
    case 'array':
      return wrapNullable(z.array(toZodSchema(jsonSchema.items)), jsonSchema);
    case 'object':
    default:
      return wrapNullable(toObjectSchema(jsonSchema), jsonSchema);
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
