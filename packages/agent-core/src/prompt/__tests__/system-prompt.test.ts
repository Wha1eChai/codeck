import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assembleSystemPrompt } from '../system-prompt.js'
import { buildEnvironmentBlock } from '../environment.js'
import type { SystemPromptOptions } from '../types.js'

const BASE_OPTIONS: SystemPromptOptions = {
  cwd: '/test/project',
  platform: 'linux',
  model: 'claude-sonnet-4-20250514',
  date: '2026-03-05',
}

describe('buildEnvironmentBlock', () => {
  it('should format environment variables correctly', () => {
    const result = buildEnvironmentBlock(BASE_OPTIONS)
    expect(result).toBe(
      [
        '# Environment',
        '- Working directory: /test/project',
        '- Platform: linux',
        '- Date: 2026-03-05',
        '- Model: claude-sonnet-4-20250514',
      ].join('\n'),
    )
  })

  it('should use the provided cwd and platform', () => {
    const result = buildEnvironmentBlock({
      ...BASE_OPTIONS,
      cwd: '/other/path',
      platform: 'win32',
    })
    expect(result).toContain('- Working directory: /other/path')
    expect(result).toContain('- Platform: win32')
  })
})

describe('assembleSystemPrompt', () => {
  let tempHome: string
  let projectDir: string

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'prompt-test-'))
    projectDir = await mkdtemp(join(tmpdir(), 'project-test-'))
  })

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  })

  it('should return only environment block when no files exist', async () => {
    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    expect(result).toContain('<environment>')
    expect(result).toContain('# Environment')
    expect(result).toContain('</environment>')
    expect(result).not.toContain('<claude-md>')
  })

  it('should include user global CLAUDE.md when present', async () => {
    const claudeDir = join(tempHome, '.claude')
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(claudeDir, 'CLAUDE.md'), 'Global user instructions')

    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    expect(result).toContain('<claude-md>')
    expect(result).toContain('# User Instructions (~/.claude/CLAUDE.md)')
    expect(result).toContain('Global user instructions')
    expect(result).toContain('</claude-md>')
  })

  it('should include user rules when present', async () => {
    const rulesDir = join(tempHome, '.claude', 'rules')
    await mkdir(rulesDir, { recursive: true })
    await writeFile(join(rulesDir, 'coding.md'), 'Coding rules content')
    await writeFile(join(rulesDir, 'security.md'), 'Security rules content')
    await writeFile(join(rulesDir, 'notes.txt'), 'Should be ignored')

    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    expect(result).toContain('# User Rules (~/.claude/rules/coding.md)')
    expect(result).toContain('Coding rules content')
    expect(result).toContain('# User Rules (~/.claude/rules/security.md)')
    expect(result).toContain('Security rules content')
    expect(result).not.toContain('Should be ignored')
  })

  it('should sort rules alphabetically', async () => {
    const rulesDir = join(tempHome, '.claude', 'rules')
    await mkdir(rulesDir, { recursive: true })
    await writeFile(join(rulesDir, 'z-last.md'), 'Last rule')
    await writeFile(join(rulesDir, 'a-first.md'), 'First rule')

    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    const firstIdx = result.indexOf('First rule')
    const lastIdx = result.indexOf('Last rule')
    expect(firstIdx).toBeLessThan(lastIdx)
  })

  it('should include project root CLAUDE.md when present', async () => {
    await writeFile(join(projectDir, 'CLAUDE.md'), 'Project instructions')

    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    expect(result).toContain(`# Project Instructions (${projectDir}/CLAUDE.md)`)
    expect(result).toContain('Project instructions')
  })

  it('should include project memory CLAUDE.md when present', async () => {
    const encoded = encodeURIComponent(projectDir)
    const projectMemoryDir = join(tempHome, '.claude', 'projects', encoded)
    await mkdir(projectMemoryDir, { recursive: true })
    await writeFile(join(projectMemoryDir, 'CLAUDE.md'), 'Project memory content')

    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    expect(result).toContain('Project Memory')
    expect(result).toContain('Project memory content')
  })

  it('should include all files when all are present', async () => {
    // User global
    const claudeDir = join(tempHome, '.claude')
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(claudeDir, 'CLAUDE.md'), 'Global instructions')

    // Rules
    const rulesDir = join(claudeDir, 'rules')
    await mkdir(rulesDir, { recursive: true })
    await writeFile(join(rulesDir, 'style.md'), 'Style rules')

    // Project root
    await writeFile(join(projectDir, 'CLAUDE.md'), 'Project root instructions')

    // Project memory
    const encoded = encodeURIComponent(projectDir)
    const projectMemoryDir = join(claudeDir, 'projects', encoded)
    await mkdir(projectMemoryDir, { recursive: true })
    await writeFile(join(projectMemoryDir, 'CLAUDE.md'), 'Project memory')

    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    expect(result).toContain('Global instructions')
    expect(result).toContain('Style rules')
    expect(result).toContain('Project root instructions')
    expect(result).toContain('Project memory')

    // Verify order: environment first, then user global, rules, project, memory
    const envIdx = result.indexOf('<environment>')
    const globalIdx = result.indexOf('Global instructions')
    const rulesIdx = result.indexOf('Style rules')
    const projectIdx = result.indexOf('Project root instructions')
    const memoryIdx = result.indexOf('Project memory')

    expect(envIdx).toBeLessThan(globalIdx)
    expect(globalIdx).toBeLessThan(rulesIdx)
    expect(rulesIdx).toBeLessThan(projectIdx)
    expect(projectIdx).toBeLessThan(memoryIdx)
  })

  it('should append custom instructions when provided', async () => {
    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
      customInstructions: 'Always respond in French',
    })

    expect(result).toContain('Always respond in French')
    // Custom instructions should be last
    const envIdx = result.indexOf('</environment>')
    const customIdx = result.indexOf('Always respond in French')
    expect(customIdx).toBeGreaterThan(envIdx)
  })

  it('should skip empty custom instructions', async () => {
    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
      customInstructions: '   ',
    })

    // Only environment block should be present
    const sections = result.split('\n\n')
    expect(sections).toHaveLength(1)
    expect(sections[0]).toContain('<environment>')
  })

  it('should skip empty CLAUDE.md files', async () => {
    const claudeDir = join(tempHome, '.claude')
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(claudeDir, 'CLAUDE.md'), '')

    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    expect(result).not.toContain('User Instructions')
  })

  it('should skip whitespace-only CLAUDE.md files', async () => {
    const claudeDir = join(tempHome, '.claude')
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(claudeDir, 'CLAUDE.md'), '   \n\n  ')

    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
    })

    expect(result).not.toContain('User Instructions')
  })

  it('should append plan mode instructions when permissionMode=plan', async () => {
    const result = await assembleSystemPrompt({
      ...BASE_OPTIONS,
      cwd: projectDir,
      homedir: tempHome,
      permissionMode: 'plan',
    })

    expect(result).toContain('<plan-mode>')
    expect(result).toContain('You are in Plan Mode.')
    expect(result).toContain('Do not assume tool execution is approved')
  })

  describe('maxTokens budget', () => {
    it('should include all sections when budget is large enough', async () => {
      const claudeDir = join(tempHome, '.claude')
      await mkdir(claudeDir, { recursive: true })
      await writeFile(join(claudeDir, 'CLAUDE.md'), 'Global instructions')
      await writeFile(join(projectDir, 'CLAUDE.md'), 'Project instructions')

      const result = await assembleSystemPrompt({
        ...BASE_OPTIONS,
        cwd: projectDir,
        homedir: tempHome,
        maxTokens: 100_000,
      })

      expect(result).toContain('Global instructions')
      expect(result).toContain('Project instructions')
    })

    it('should always include environment block (critical priority)', async () => {
      const result = await assembleSystemPrompt({
        ...BASE_OPTIONS,
        cwd: projectDir,
        homedir: tempHome,
        maxTokens: 50, // very tight budget
      })

      expect(result).toContain('<environment>')
    })

    it('should drop low-priority sections first under budget pressure', async () => {
      const claudeDir = join(tempHome, '.claude')
      await mkdir(claudeDir, { recursive: true })
      await writeFile(join(claudeDir, 'CLAUDE.md'), 'X'.repeat(2000)) // low priority, large

      await writeFile(join(projectDir, 'CLAUDE.md'), 'Project instructions') // high priority, small

      // Budget enough for env + project CLAUDE.md, but not user global
      const result = await assembleSystemPrompt({
        ...BASE_OPTIONS,
        cwd: projectDir,
        homedir: tempHome,
        maxTokens: 200,
      })

      expect(result).toContain('<environment>')
      expect(result).toContain('Project instructions')
      expect(result).not.toContain('X'.repeat(100)) // user global dropped
    })

    it('should keep plan mode instructions even under tight budget', async () => {
      const result = await assembleSystemPrompt({
        ...BASE_OPTIONS,
        cwd: projectDir,
        homedir: tempHome,
        permissionMode: 'plan',
        maxTokens: 100,
      })

      expect(result).toContain('<plan-mode>')
      expect(result).toContain('<environment>')
    })

    it('should include all when maxTokens is not specified', async () => {
      const claudeDir = join(tempHome, '.claude')
      await mkdir(claudeDir, { recursive: true })
      await writeFile(join(claudeDir, 'CLAUDE.md'), 'X'.repeat(50000))
      await writeFile(join(projectDir, 'CLAUDE.md'), 'Y'.repeat(50000))

      const result = await assembleSystemPrompt({
        ...BASE_OPTIONS,
        cwd: projectDir,
        homedir: tempHome,
      })

      // Both should be included regardless of size
      expect(result).toContain('X'.repeat(100))
      expect(result).toContain('Y'.repeat(100))
    })
  })
})
