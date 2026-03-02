export type ClaudeMdScope =
  | 'user-global'
  | 'project-root'
  | 'project-claude-dir'
  | 'local-project'
  | 'memory'

export interface ClaudeMdFile {
  readonly filePath: string
  readonly scope: ClaudeMdScope
  readonly projectPath: string | undefined
  readonly content: string
  readonly name: string | undefined
}

export interface RuleFile {
  readonly filePath: string
  readonly filename: string
  readonly scope: 'global' | 'project'
  readonly content: string
}
