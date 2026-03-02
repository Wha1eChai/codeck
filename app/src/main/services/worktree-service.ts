// ============================================================
// WorktreeService — Git worktree management for isolated sessions
// ============================================================

import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

export interface WorktreeEntry {
  readonly path: string
  readonly branch: string
  readonly head: string
  readonly isBare: boolean
}

export interface WorktreeDiffResult {
  readonly files: readonly string[]
  readonly insertions: number
  readonly deletions: number
  readonly diff: string
}

export interface WorktreeCreateResult {
  readonly worktreePath: string
  readonly branchName: string
  readonly baseBranch: string
}

const WORKTREE_DIR = '.claude-worktrees'
const GIT_TIMEOUT = 15_000

function gitExec(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    timeout: GIT_TIMEOUT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

export class WorktreeService {
  /**
   * Create a new git worktree for an isolated session.
   * The worktree is placed under `<projectPath>/.claude-worktrees/<sessionId>/`.
   */
  async createWorktree(
    projectPath: string,
    sessionId: string,
    branchName?: string,
  ): Promise<WorktreeCreateResult> {
    // Get current branch as base
    const baseBranch = gitExec('git rev-parse --abbrev-ref HEAD', projectPath)

    // Generate branch name if not provided
    const branch = branchName ?? `claude-session/${sessionId.slice(0, 8)}`

    // Worktree path
    const worktreeDir = path.join(projectPath, WORKTREE_DIR)
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true })
    }
    const worktreePath = path.join(worktreeDir, sessionId)

    // Create worktree with new branch
    gitExec(
      `git worktree add "${worktreePath}" -b "${branch}"`,
      projectPath,
    )

    return {
      worktreePath,
      branchName: branch,
      baseBranch,
    }
  }

  /**
   * List all worktrees for a project.
   */
  async listWorktrees(projectPath: string): Promise<readonly WorktreeEntry[]> {
    try {
      const output = gitExec('git worktree list --porcelain', projectPath)
      return this.parseWorktreeList(output)
    } catch {
      return []
    }
  }

  /**
   * Remove a worktree and its branch.
   */
  async removeWorktree(projectPath: string, sessionId: string): Promise<void> {
    const worktreePath = path.join(projectPath, WORKTREE_DIR, sessionId)

    try {
      gitExec(`git worktree remove "${worktreePath}" --force`, projectPath)
    } catch {
      // If git worktree remove fails, try manual cleanup
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true })
        // Prune stale worktree references
        try {
          gitExec('git worktree prune', projectPath)
        } catch {
          // Non-critical
        }
      }
    }
  }

  /**
   * Get diff between worktree branch and its base branch.
   */
  async getWorktreeDiff(
    projectPath: string,
    baseBranch: string,
    worktreeBranch: string,
  ): Promise<WorktreeDiffResult> {
    try {
      const diff = gitExec(
        `git diff ${baseBranch}...${worktreeBranch}`,
        projectPath,
      )

      const statOutput = gitExec(
        `git diff ${baseBranch}...${worktreeBranch} --stat`,
        projectPath,
      )

      const files = this.parseStatFiles(statOutput)
      const { insertions, deletions } = this.parseStatSummary(statOutput)

      return { files, insertions, deletions, diff }
    } catch {
      return { files: [], insertions: 0, deletions: 0, diff: '' }
    }
  }

  /**
   * Merge a worktree branch back into the base branch.
   */
  async mergeWorktree(
    projectPath: string,
    worktreeBranch: string,
    baseBranch: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Checkout the base branch
      gitExec(`git checkout ${baseBranch}`, projectPath)

      // Merge the worktree branch
      gitExec(`git merge ${worktreeBranch} --no-edit`, projectPath)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /** Check if a path is inside a git repository. */
  isGitRepo(projectPath: string): boolean {
    try {
      gitExec('git rev-parse --git-dir', projectPath)
      return true
    } catch {
      return false
    }
  }

  // ── Parsing helpers ──

  private parseWorktreeList(output: string): WorktreeEntry[] {
    const entries: WorktreeEntry[] = []
    const blocks = output.split('\n\n').filter(Boolean)

    for (const block of blocks) {
      const lines = block.split('\n')
      let wtPath = ''
      let head = ''
      let branch = ''
      let isBare = false

      for (const line of lines) {
        if (line.startsWith('worktree ')) wtPath = line.slice(9)
        else if (line.startsWith('HEAD ')) head = line.slice(5)
        else if (line.startsWith('branch ')) branch = line.slice(7).replace('refs/heads/', '')
        else if (line === 'bare') isBare = true
      }

      if (wtPath) {
        entries.push({ path: wtPath, branch, head, isBare })
      }
    }

    return entries
  }

  private parseStatFiles(statOutput: string): string[] {
    return statOutput
      .split('\n')
      .filter(line => line.includes('|'))
      .map(line => line.split('|')[0].trim())
  }

  private parseStatSummary(statOutput: string): { insertions: number; deletions: number } {
    const lastLine = statOutput.split('\n').pop() ?? ''
    const insertMatch = lastLine.match(/(\d+) insertion/)
    const deleteMatch = lastLine.match(/(\d+) deletion/)
    return {
      insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
      deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
    }
  }
}

export const worktreeService = new WorktreeService()
