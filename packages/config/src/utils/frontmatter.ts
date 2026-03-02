/**
 * YAML frontmatter parser for Markdown files.
 * Ported from my-claude-code-desk/src/main/utils/frontmatter.ts
 *
 * Handles:
 * - Single-line YAML arrays: [item1, item2]
 * - Multi-line YAML arrays: - item entries
 * - Quoted and unquoted values
 * - Boolean values (true/false/yes/no)
 */

export interface FrontmatterResult {
  readonly metadata: Readonly<Record<string, string | readonly string[]>>
  readonly body: string
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(FRONTMATTER_REGEX)
  if (!match) {
    return { metadata: {}, body: content }
  }

  const rawYaml = match[1]!
  const body = match[2]!
  const metadata: Record<string, string | string[]> = {}
  let lastKey: string | null = null

  for (const line of rawYaml.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Multi-line YAML array item: "  - value"
    if (trimmed.startsWith('- ') && lastKey) {
      const itemValue = trimmed.slice(2).trim().replace(/^["']|["']$/g, '')
      const existing = metadata[lastKey]
      if (Array.isArray(existing)) {
        existing.push(itemValue)
      } else {
        metadata[lastKey] = [itemValue]
      }
      continue
    }

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue

    const key = trimmed.slice(0, colonIdx).trim()
    let value = trimmed.slice(colonIdx + 1).trim()
    lastKey = key

    // Handle YAML array on single line: [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
      metadata[key] = items
    } else if (value === '') {
      // Empty value — might be followed by multi-line array items
      metadata[key] = ''
    } else {
      // Strip surrounding quotes
      value = value.replace(/^["']|["']$/g, '')
      metadata[key] = value
    }
  }

  return { metadata, body }
}
