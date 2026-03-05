import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildEnvironmentBlock } from './environment.js'
import type { ClaudeMdSource, SystemPromptOptions } from './types.js'

export interface AssembleSystemPromptOptions extends SystemPromptOptions {
  readonly homedir?: string
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

export async function assembleSystemPrompt(
  options: AssembleSystemPromptOptions,
): Promise<string> {
  const home = options.homedir ?? homedir()
  const claudeDir = join(home, '.claude')
  const sections: string[] = []

  // Environment block
  const envBlock = buildEnvironmentBlock(options)
  sections.push(`<environment>\n${envBlock}\n</environment>`)

  // 1. User global CLAUDE.md
  const userGlobal = await readFileIfExists(join(claudeDir, 'CLAUDE.md'))
  if (userGlobal !== undefined) {
    sections.push(wrapSection('User Instructions (~/.claude/CLAUDE.md)', userGlobal))
  }

  // 2. User rules (~/.claude/rules/*.md)
  const rules = await loadRuleFiles(join(claudeDir, 'rules'))
  for (const rule of rules) {
    const fileName = rule.path.split(/[/\\]/).pop() ?? 'unknown.md'
    sections.push(wrapSection(`User Rules (~/.claude/rules/${fileName})`, rule.content))
  }

  // 3. Project root CLAUDE.md
  const projectRoot = await readFileIfExists(join(options.cwd, 'CLAUDE.md'))
  if (projectRoot !== undefined) {
    sections.push(wrapSection(`Project Instructions (${options.cwd}/CLAUDE.md)`, projectRoot))
  }

  // 4. Project-specific CLAUDE.md in ~/.claude/projects/<encoded>/
  const encodedPath = encodeProjectPath(options.cwd)
  const projectMemory = await readFileIfExists(
    join(claudeDir, 'projects', encodedPath, 'CLAUDE.md'),
  )
  if (projectMemory !== undefined) {
    sections.push(
      wrapSection(
        `Project Memory (~/.claude/projects/${encodedPath}/CLAUDE.md)`,
        projectMemory,
      ),
    )
  }

  // 5. Custom instructions
  if (options.customInstructions !== undefined && options.customInstructions.trim().length > 0) {
    sections.push(options.customInstructions.trim())
  }

  return sections.join('\n\n')
}
