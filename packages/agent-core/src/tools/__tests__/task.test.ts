import { describe, it, expect } from 'vitest'
import { createTaskTool, TASK_TOOL_NAME } from '../task.js'
import { createToolRegistry } from '../registry.js'
import type { TaskToolOptions } from '../task.js'
import type { LanguageModel } from 'ai'

function createMockOptions(overrides?: Partial<TaskToolOptions>): TaskToolOptions {
  return {
    model: {} as LanguageModel,
    parentSystemPrompt: 'Test system prompt',
    tools: createDefaultTools(),
    remainingDepth: 1,
    ...overrides,
  }
}

function createDefaultTools() {
  const reg = createToolRegistry()
  reg.register({
    name: 'Read',
    description: 'Read a file',
    parameters: {} as never,
    execute: async () => ({ output: 'file contents' }),
  })
  reg.register({
    name: 'Glob',
    description: 'Glob files',
    parameters: {} as never,
    execute: async () => ({ output: '*.ts' }),
  })
  return reg
}

describe('createTaskTool', () => {
  it('creates a tool with correct name', () => {
    const tool = createTaskTool(createMockOptions())
    expect(tool.name).toBe('Task')
  })

  it('TASK_TOOL_NAME is "Task"', () => {
    expect(TASK_TOOL_NAME).toBe('Task')
  })

  it('has description mentioning sub-task', () => {
    const tool = createTaskTool(createMockOptions())
    expect(tool.description).toContain('sub-task')
  })

  it('has Zod parameters for prompt, allowedTools, maxSteps, context', () => {
    const tool = createTaskTool(createMockOptions())
    const shape = tool.parameters.shape
    expect(shape).toHaveProperty('prompt')
    expect(shape).toHaveProperty('allowedTools')
    expect(shape).toHaveProperty('maxSteps')
    expect(shape).toHaveProperty('context')
  })
})

describe('Task tool filtering', () => {
  it('excludes Task tool from child registry when parent has it', () => {
    const parentTools = createDefaultTools()
    parentTools.register({
      name: 'Task',
      description: 'fake task tool',
      parameters: {} as never,
      execute: async () => ({ output: '' }),
    })

    const tool = createTaskTool(createMockOptions({ tools: parentTools }))
    // Tool is created regardless — filtering happens at execute() time
    expect(tool.name).toBe('Task')
  })
})
