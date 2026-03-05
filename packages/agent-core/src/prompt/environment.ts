import type { SystemPromptOptions } from './types.js'

export function buildEnvironmentBlock(options: SystemPromptOptions): string {
  const lines = [
    '# Environment',
    `- Working directory: ${options.cwd}`,
    `- Platform: ${options.platform}`,
    `- Date: ${options.date}`,
    `- Model: ${options.model}`,
  ]
  return lines.join('\n')
}
