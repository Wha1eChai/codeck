import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from './frontmatter.js'

describe('parseFrontmatter', () => {
  it('returns empty metadata and full body when no frontmatter', () => {
    const result = parseFrontmatter('Hello world\nNo frontmatter here')
    expect(result.metadata).toEqual({})
    expect(result.body).toBe('Hello world\nNo frontmatter here')
  })

  it('parses simple key-value pairs', () => {
    const content = `---
name: my-skill
description: A test skill
---
Body content here`
    const result = parseFrontmatter(content)
    expect(result.metadata).toEqual({
      name: 'my-skill',
      description: 'A test skill',
    })
    expect(result.body).toBe('Body content here')
  })

  it('parses single-line YAML arrays', () => {
    const content = `---
allowed-tools: [Read, Write, Bash]
---
Body`
    const result = parseFrontmatter(content)
    expect(result.metadata['allowed-tools']).toEqual(['Read', 'Write', 'Bash'])
  })

  it('parses multi-line YAML arrays', () => {
    const content = `---
allowed-tools:
- Read
- Write
- Bash
---
Body`
    const result = parseFrontmatter(content)
    expect(result.metadata['allowed-tools']).toEqual(['Read', 'Write', 'Bash'])
  })

  it('strips surrounding quotes from values', () => {
    const content = `---
name: "quoted-name"
description: 'single-quoted'
---
Body`
    const result = parseFrontmatter(content)
    expect(result.metadata['name']).toBe('quoted-name')
    expect(result.metadata['description']).toBe('single-quoted')
  })

  it('strips quotes from array items', () => {
    const content = `---
tools: ["Read", 'Write']
---
Body`
    const result = parseFrontmatter(content)
    expect(result.metadata['tools']).toEqual(['Read', 'Write'])
  })

  it('handles empty values', () => {
    const content = `---
name:
description: has value
---
Body`
    const result = parseFrontmatter(content)
    expect(result.metadata['name']).toBe('')
    expect(result.metadata['description']).toBe('has value')
  })

  it('ignores comment lines', () => {
    const content = `---
# This is a comment
name: test
---
Body`
    const result = parseFrontmatter(content)
    expect(result.metadata).toEqual({ name: 'test' })
  })

  it('handles Windows line endings (CRLF)', () => {
    const content = '---\r\nname: test\r\n---\r\nBody'
    const result = parseFrontmatter(content)
    expect(result.metadata['name']).toBe('test')
    expect(result.body).toBe('Body')
  })

  it('handles empty body after frontmatter', () => {
    const content = `---
name: test
---
`
    const result = parseFrontmatter(content)
    expect(result.metadata['name']).toBe('test')
    expect(result.body).toBe('')
  })
})
