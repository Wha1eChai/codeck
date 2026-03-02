import { describe, it, expect } from 'vitest'
import { computeLineDiff } from '../DiffView'

describe('computeLineDiff', () => {
    it('should produce empty diff for identical strings', () => {
        const lines = computeLineDiff('hello\nworld', 'hello\nworld')
        expect(lines.every(l => l.type === ' ')).toBe(true)
        expect(lines).toHaveLength(2)
    })

    it('should detect single line addition', () => {
        const lines = computeLineDiff('a\nb', 'a\nx\nb')
        const added = lines.filter(l => l.type === '+')
        expect(added).toHaveLength(1)
        expect(added[0].content).toBe('x')
    })

    it('should detect single line removal', () => {
        const lines = computeLineDiff('a\nx\nb', 'a\nb')
        const removed = lines.filter(l => l.type === '-')
        expect(removed).toHaveLength(1)
        expect(removed[0].content).toBe('x')
    })

    it('should detect replacement (remove + add)', () => {
        const lines = computeLineDiff('old line', 'new line')
        const removed = lines.filter(l => l.type === '-')
        const added = lines.filter(l => l.type === '+')
        expect(removed).toHaveLength(1)
        expect(removed[0].content).toBe('old line')
        expect(added).toHaveLength(1)
        expect(added[0].content).toBe('new line')
    })

    it('should handle empty old string (all additions)', () => {
        const lines = computeLineDiff('', 'new\nfile')
        // '' splits to [''] so old has one empty line → removed
        const added = lines.filter(l => l.type === '+')
        expect(added.length).toBeGreaterThanOrEqual(1)
        expect(added.some(l => l.content === 'new')).toBe(true)
    })

    it('should handle empty new string (all removals)', () => {
        const lines = computeLineDiff('old\nfile', '')
        expect(lines.filter(l => l.type === '-').length).toBeGreaterThanOrEqual(1)
        expect(lines.filter(l => l.type === '+').length).toBeLessThanOrEqual(1) // empty string creates one empty line
    })

    it('should handle multi-line diff with context', () => {
        const old = 'function foo() {\n  return 1\n}'
        const new_ = 'function foo() {\n  return 2\n}'
        const lines = computeLineDiff(old, new_)

        // Context lines
        const ctx = lines.filter(l => l.type === ' ')
        expect(ctx.length).toBeGreaterThanOrEqual(2) // { and }

        // Changed lines
        expect(lines.filter(l => l.type === '-')).toHaveLength(1)
        expect(lines.filter(l => l.type === '+')).toHaveLength(1)
    })

    it('should assign line numbers to all lines', () => {
        const lines = computeLineDiff('a\nb\nc', 'a\nx\nc')
        for (const line of lines) {
            // Each line should have at least one line number
            const hasLineNum = (line.oldLineNum !== undefined) || (line.newLineNum !== undefined)
            expect(hasLineNum).toBe(true)
            if (line.oldLineNum !== undefined) expect(line.oldLineNum).toBeGreaterThan(0)
            if (line.newLineNum !== undefined) expect(line.newLineNum).toBeGreaterThan(0)
        }
    })
})
