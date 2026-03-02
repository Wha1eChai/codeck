import { useState, useEffect } from 'react'
import type { Highlighter } from 'shiki'

const BUNDLED_LANGS = [
  'typescript', 'javascript', 'tsx', 'jsx', 'json', 'python',
  'bash', 'sh', 'css', 'html', 'markdown', 'diff',
  'yaml', 'toml', 'sql', 'go', 'rust',
] as const

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: [...BUNDLED_LANGS],
      })
    )
  }
  return highlighterPromise
}

export function useHighlighter() {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getHighlighter().then(h => {
      if (!cancelled) {
        setHighlighter(h)
        setIsLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  return { highlighter, isLoading }
}

/** Check if a language is supported by the bundled highlighter. */
export function isSupportedLang(lang: string): boolean {
  return (BUNDLED_LANGS as readonly string[]).includes(lang)
}
