import React, { useCallback, useState, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check } from 'lucide-react'
import { useHighlighter, isSupportedLang } from '../../hooks/useHighlighter'

interface MessageMarkdownProps {
  content: unknown
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node) && node.props) {
    return extractText((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

/** Extract language from className like "language-typescript" */
function extractLang(className?: string): string | undefined {
  if (!className) return undefined
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : undefined
}

interface HighlightedCodeBlockProps {
  code: string
  lang: string | undefined
}

const HighlightedCodeBlock: React.FC<HighlightedCodeBlockProps> = ({ code, lang }) => {
  const { highlighter } = useHighlighter()
  const [copied, setCopied] = useState(false)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!highlighter || !lang || !isSupportedLang(lang)) {
      setHighlightedHtml(null)
      return
    }
    try {
      const isDark = document.documentElement.classList.contains('dark')
      const html = highlighter.codeToHtml(code, {
        lang,
        theme: isDark ? 'github-dark' : 'github-light',
      })
      setHighlightedHtml(html)
    } catch {
      setHighlightedHtml(null)
    }
  }, [highlighter, code, lang])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API not available
    }
  }, [code])

  return (
    <div className="group/code relative my-3">
      {lang && (
        <div className="flex items-center justify-between bg-muted/80 border border-b-0 border-border/50 rounded-t-lg px-3 py-1">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">{lang}</span>
        </div>
      )}
      {highlightedHtml ? (
        <div
          className={`overflow-x-auto border border-border/50 ${lang ? 'rounded-b-lg' : 'rounded-lg'} pr-10 [&_pre]:p-3 [&_pre]:m-0 [&_pre]:bg-transparent [&_code]:bg-transparent [&_code]:p-0`}
          style={{ backgroundColor: 'var(--shiki-bg, hsl(var(--muted) / 0.5))' }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className={`bg-muted/50 p-3 overflow-x-auto border border-border/50 pr-10 ${lang ? 'rounded-b-lg' : 'rounded-lg'}`}>
          <code className="font-mono text-sm">{code}</code>
        </pre>
      )}
      <button
        onClick={handleCopy}
        className={`absolute ${lang ? 'top-9' : 'top-2'} right-2 p-1.5 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/code:opacity-100 transition-opacity`}
        title="Copy code"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

const CodeBlock: React.FC<React.HTMLAttributes<HTMLPreElement>> = ({ children, ...props }) => {
  const code = extractText(children)
  const lang = useMemo(() => {
    // Extract language from nested <code> element's className
    if (React.isValidElement(children)) {
      const childProps = children.props as { className?: string }
      return extractLang(childProps.className)
    }
    return undefined
  }, [children])

  return <HighlightedCodeBlock code={code} lang={lang} />
}

const markdownComponents = {
  p: ({ node, ...props }: any) => <p className="mb-3 last:mb-0 leading-7 text-[15px]" {...props} />,
  pre: ({ node, ...props }: any) => <CodeBlock {...props} />,
  code: ({ node, inline, className, ...props }: any) => {
    // Inline code — no highlighting
    if (inline) {
      return <code className="bg-muted px-1.5 py-0.5 rounded text-[0.9em] font-mono text-muted-foreground" {...props} />
    }
    // Block code inside <pre> — let CodeBlock handle it via the pre renderer
    return <code className={className} {...props} />
  },
  a: ({ node, ...props }: any) => <a className="text-primary underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer" {...props} />,
  blockquote: ({ node, ...props }: any) => <blockquote className="border-l-2 border-primary/30 pl-4 my-3 text-muted-foreground italic" {...props} />,
  table: ({ node, ...props }: any) => <div className="overflow-x-auto my-3"><table className="min-w-full text-sm border-collapse" {...props} /></div>,
  th: ({ node, ...props }: any) => <th className="border border-border px-3 py-1.5 bg-muted/50 text-left font-semibold" {...props} />,
  td: ({ node, ...props }: any) => <td className="border border-border px-3 py-1.5" {...props} />,
  hr: ({ node, ...props }: any) => <hr className="my-4 border-border" {...props} />,
}

export const MessageMarkdown: React.FC<MessageMarkdownProps> = React.memo(({ content }) => {
  const text = typeof content === 'string' ? content : JSON.stringify(content)

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {text}
    </ReactMarkdown>
  )
})
