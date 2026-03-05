export interface SystemPromptOptions {
  readonly cwd: string
  readonly platform: string
  readonly model: string
  readonly date: string
  readonly customInstructions?: string
}

export interface ClaudeMdSource {
  readonly path: string
  readonly content: string
}
