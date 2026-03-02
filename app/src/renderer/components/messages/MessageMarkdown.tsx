import React, { useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check } from 'lucide-react'

interface MessageMarkdownProps {
  content: unknown
}

const CodeBlock: React.FC<React.HTMLAttributes<HTMLPreElement>> = ({ children, ...props }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text = extractText(children)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  return (
    <div className="group/code relative my-3">
      <pre
        className="bg-muted/50 p-3 rounded-lg overflow-x-auto border border-border/50 pr-10"
        {...props}
      >
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/code:opacity-100 transition-opacity"
        title="Copy code"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
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

const markdownComponents = {
  p: ({ node, ...props }: any) => <p className="mb-3 last:mb-0 leading-7 text-[15px]" {...props} />,
  pre: ({ node, ...props }: any) => <CodeBlock {...props} />,
  code: ({ node, ...props }: any) => <code className="bg-muted px-1.5 py-0.5 rounded text-[0.9em] font-mono text-muted-foreground" {...props} />,
  a: ({ node, ...props }: any) => <a className="text-primary underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer" {...props} />,
  blockquote: ({ node, ...props }: any) => <blockquote className="border-l-2 border-primary/30 pl-4 my-3 text-muted-foreground italic" {...props} />,
  table: ({ node, ...props }: any) => <div className="overflow-x-auto my-3"><table className="min-w-full text-sm border-collapse" {...props} /></div>,
  th: ({ node, ...props }: any) => <th className="border border-border px-3 py-1.5 bg-muted/50 text-left font-semibold" {...props} />,
  td: ({ node, ...props }: any) => <td className="border border-border px-3 py-1.5" {...props} />,
  hr: ({ node, ...props }: any) => <hr className="my-4 border-border" {...props} />,
}

export const MessageMarkdown: React.FC<MessageMarkdownProps> = ({ content }) => {
  const text = typeof content === 'string' ? content : JSON.stringify(content)

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {text}
    </ReactMarkdown>
  )
}
