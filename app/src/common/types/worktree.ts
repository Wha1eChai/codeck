// ── Worktree ──

/** Worktree metadata attached to a session. */
export interface WorktreeInfo {
  readonly worktreePath: string
  readonly branchName: string
  readonly baseBranch: string
}

/** A git worktree entry returned from `git worktree list`. */
export interface WorktreeListEntry {
  readonly path: string
  readonly branch: string
  readonly head: string
  readonly isBare: boolean
}

/** Diff info between a worktree branch and its base. */
export interface WorktreeDiffInfo {
  readonly files: readonly string[]
  readonly insertions: number
  readonly deletions: number
  readonly diff: string
}
