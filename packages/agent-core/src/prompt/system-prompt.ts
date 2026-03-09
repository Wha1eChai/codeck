import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildEnvironmentBlock } from './environment.js'
import { estimateTokens } from '../context/token-estimator.js'
import type { ClaudeMdSource, SystemPromptOptions } from './types.js'

export interface AssembleSystemPromptOptions extends SystemPromptOptions {
  readonly homedir?: string
  /** Max token budget for system prompt. Sections are dropped by priority when exceeded. */
  readonly maxTokens?: number
}

function encodeProjectPath(cwd: string): string {
  return encodeURIComponent(cwd)
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const trimmed = content.trim()
    return trimmed.length > 0 ? trimmed : undefined
  } catch {
    return undefined
  }
}

async function loadRuleFiles(rulesDir: string): Promise<readonly ClaudeMdSource[]> {
  let entries: string[]
  try {
    entries = await readdir(rulesDir)
  } catch {
    return []
  }

  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort()
  const results: ClaudeMdSource[] = []

  for (const file of mdFiles) {
    const filePath = join(rulesDir, file)
    const content = await readFileIfExists(filePath)
    if (content !== undefined) {
      results.push({ path: filePath, content })
    }
  }

  return results
}

function wrapSection(label: string, content: string): string {
  return `<claude-md>\n# ${label}\n${content}\n</claude-md>`
}

function buildPlanModeInstructions(): string {
  return [
    '<plan-mode>',
    'You are in Plan Mode.',
    'Explain the intended steps before executing tools.',
    'Do not assume tool execution is approved until the user explicitly approves the plan.',
    'If a tool invocation is denied, incorporate the feedback and continue planning instead of forcing execution.',
    '</plan-mode>',
  ].join('\n')
}

/**
 * Priority levels for system prompt sections.
 * Higher priority sections are kept first when token budget is exceeded.
 * CRITICAL sections are never dropped.
 */
type SectionPriority = 'critical' | 'high' | 'medium' | 'low'

interface PrioritizedSection {
  readonly content: string
  readonly priority: SectionPriority
}

function fitSectionsIntoBudget(sections: readonly PrioritizedSection[], maxTokens: number): string[] {
  // Critical sections are always included
  const critical = sections.filter((s) => s.priority === 'critical')
  const droppable = sections.filter((s) => s.priority !== 'critical')

  const criticalText = critical.map((s) => s.content).join('\n\n')
  let usedTokens = estimateTokens(criticalText)
  const result = critical.map((s) => s.content)

  // Sort droppable by priority: high → medium → low
  const priorityOrder: Record<SectionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...droppable].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  for (const section of sorted) {
    const sectionTokens = estimateTokens(section.content)
    if (usedTokens + sectionTokens <= maxTokens) {
      result.push(section.content)
      usedTokens += sectionTokens
    }
    // else: drop this section silently
  }

  return result
}

export async function assembleSystemPrompt(
  options: AssembleSystemPromptOptions,
): Promise<string> {
  const home = options.homedir ?? homedir()
  const claudeDir = join(home, '.claude')
  const sections: PrioritizedSection[] = []

  // Environment block — always included
  const envBlock = buildEnvironmentBlock(options)
  sections.push({ content: `<environment>\n${envBlock}\n</environment>`, priority: 'critical' })

  // 1. User global CLAUDE.md — low priority (dropped first under budget pressure)
  const userGlobal = await readFileIfExists(join(claudeDir, 'CLAUDE.md'))
  if (userGlobal !== undefined) {
    sections.push({
      content: wrapSection('User Instructions (~/.claude/CLAUDE.md)', userGlobal),
      priority: 'low',
    })
  }

  // 2. User rules (~/.claude/rules/*.md) — medium priority
  const rules = await loadRuleFiles(join(claudeDir, 'rules'))
  for (const rule of rules) {
    const fileName = rule.path.split(/[/\\]/).pop() ?? 'unknown.md'
    sections.push({
      content: wrapSection(`User Rules (~/.claude/rules/${fileName})`, rule.content),
      priority: 'medium',
    })
  }

  // 3. Project root CLAUDE.md — high priority (most relevant to current task)
  const projectRoot = await readFileIfExists(join(options.cwd, 'CLAUDE.md'))
  if (projectRoot !== undefined) {
    sections.push({
      content: wrapSection(`Project Instructions (${options.cwd}/CLAUDE.md)`, projectRoot),
      priority: 'high',
    })
  }

  // 4. Project-specific CLAUDE.md in ~/.claude/projects/<encoded>/ — low priority
  const encodedPath = encodeProjectPath(options.cwd)
  const projectMemory = await readFileIfExists(
    join(claudeDir, 'projects', encodedPath, 'CLAUDE.md'),
  )
  if (projectMemory !== undefined) {
    sections.push({
      content: wrapSection(
        `Project Memory (~/.claude/projects/${encodedPath}/CLAUDE.md)`,
        projectMemory,
      ),
      priority: 'low',
    })
  }

  // 5. Custom instructions — high priority
  if (options.customInstructions !== undefined && options.customInstructions.trim().length > 0) {
    sections.push({ content: options.customInstructions.trim(), priority: 'high' })
  }

  // Plan mode instructions — critical (always included)
  if (options.permissionMode === 'plan') {
    sections.push({ content: buildPlanModeInstructions(), priority: 'critical' })
  }

  // Apply token budget if specified, otherwise include everything
  if (options.maxTokens !== undefined) {
    const fitted = fitSectionsIntoBudget(sections, options.maxTokens)
    return fitted.join('\n\n')
  }

  return sections.map((s) => s.content).join('\n\n')
}
