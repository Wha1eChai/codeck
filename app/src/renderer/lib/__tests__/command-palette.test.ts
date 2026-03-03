import { describe, it, expect } from 'vitest'
import { buildPaletteItems, filterPaletteItems } from '../command-palette'

describe('command-palette', () => {
  it('returns builtin commands when metadata is undefined', () => {
    const items = buildPaletteItems(undefined)
    expect(items.some(i => i.label === '/compact')).toBe(true)
    expect(items.some(i => i.label === '/clear')).toBe(true)
  })

  it('merges SDK slash commands without duplicating builtins', () => {
    const metadata = { sessionId: 's1', slashCommands: ['compact', 'model', 'status'] }
    const items = buildPaletteItems(metadata)
    const compactItems = items.filter(i => i.insertText === '/compact')
    expect(compactItems).toHaveLength(1)
    expect(items.some(i => i.insertText === '/model')).toBe(true)
    expect(items.some(i => i.insertText === '/status')).toBe(true)
  })

  it('includes skills and agents from metadata', () => {
    const metadata = { sessionId: 's1', skills: ['commit', 'tdd'], agents: ['Explore', 'Plan'] }
    const items = buildPaletteItems(metadata)
    expect(items.filter(i => i.category === 'skill')).toHaveLength(2)
    expect(items.filter(i => i.category === 'agent')).toHaveLength(2)
  })

  it('filters items by query', () => {
    const items = buildPaletteItems({ sessionId: 's1', slashCommands: ['compact', 'clear', 'model'] })
    const filtered = filterPaletteItems(items, '/c')
    expect(filtered.every(i => i.label.toLowerCase().includes('c'))).toBe(true)
    expect(filtered.length).toBeGreaterThan(0)
  })

  it('filters by description as well', () => {
    const items = buildPaletteItems(undefined)
    const filtered = filterPaletteItems(items, 'conversation')
    expect(filtered.length).toBeGreaterThan(0)
  })

  it('returns all items for empty query', () => {
    const items = buildPaletteItems(undefined)
    const filtered = filterPaletteItems(items, '')
    expect(filtered.length).toBe(items.length)
  })

  it('handles slash commands with / prefix from SDK', () => {
    const metadata = { sessionId: 's1', slashCommands: ['/compact', '/model'] }
    const items = buildPaletteItems(metadata)
    const compactItems = items.filter(i => i.insertText === '/compact')
    expect(compactItems).toHaveLength(1)
  })
})
