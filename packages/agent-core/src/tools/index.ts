export type { ToolDefinition, ToolResult, ToolContext } from './types.js'
export type { ToolRegistry } from './registry.js'
export { createToolRegistry } from './registry.js'

import { createToolRegistry, type ToolRegistry } from './registry.js'
import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'

/**
 * Create a ToolRegistry pre-loaded with all 6 core tools:
 * Read, Write, Edit, Bash, Glob, Grep
 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = createToolRegistry()
  registry.register(readTool)
  registry.register(writeTool)
  registry.register(editTool)
  registry.register(bashTool)
  registry.register(globTool)
  registry.register(grepTool)
  return registry
}
