'use client'

import React, { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check } from 'lucide-react'

interface MarkdownMessageProps {
  content: string
  isStreaming?: boolean
}

function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }, [code])

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-gray-200/80 dark:bg-gray-700/80 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
      title={copied ? 'Copied!' : 'Copy code'}
      aria-label="Copy code"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function extractLanguage(className?: string): string | null {
  if (!className) return null
  const match = className.match(/language-(\w+)/)
  if (!match) return null
  const lang = match[1]
  const displayNames: Record<string, string> = {
    js: 'JavaScript',
    ts: 'TypeScript',
    jsx: 'JSX',
    tsx: 'TSX',
    py: 'Python',
    rb: 'Ruby',
    rs: 'Rust',
    go: 'Go',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    cs: 'C#',
    php: 'PHP',
    swift: 'Swift',
    kt: 'Kotlin',
    sql: 'SQL',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    md: 'Markdown',
    sh: 'Shell',
    bash: 'Bash',
    zsh: 'Zsh',
    dockerfile: 'Dockerfile',
    graphql: 'GraphQL',
    xml: 'XML',
    toml: 'TOML',
  }
  return displayNames[lang] || lang.charAt(0).toUpperCase() + lang.slice(1)
}

export default function MarkdownMessage({ content, isStreaming = false }: MarkdownMessageProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-full overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>
          ),
          // Headings
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h3>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-5 mb-4 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-5 mb-4 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          // Code
          code: ({ inline, children, className, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="bg-gray-100 dark:bg-gray-700 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-sm font-mono break-words"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code
                className="block text-sm font-mono whitespace-pre-wrap break-words"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre: ({ children }) => {
            // Extract text content and language from the code child
            const codeChild = React.Children.toArray(children).find(
              (child): child is React.ReactElement => React.isValidElement(child) && (child as any).type === 'code'
            )
            const codeText = codeChild
              ? String(codeChild.props.children || '').replace(/\n$/, '')
              : ''
            const language = codeChild ? extractLanguage(codeChild.props.className) : null

            return (
              <div className="relative group mb-4">
                {language && (
                  <div className="flex items-center justify-between px-3 py-1.5 bg-gray-200 dark:bg-gray-800 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{language}</span>
                  </div>
                )}
                <pre className={`bg-gray-100 dark:bg-gray-900 p-3 ${language ? 'rounded-b-lg' : 'rounded-lg'} border border-gray-200 dark:border-gray-700 overflow-x-auto max-w-full`}>
                  {children}
                </pre>
                <CodeCopyButton code={codeText} />
              </div>
            )
          },
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-4 py-1 my-4 italic text-gray-700 dark:text-gray-300">
              {children}
            </blockquote>
          ),
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {children}
            </a>
          ),
          // Strong (bold)
          strong: ({ children }) => (
            <strong className="font-bold text-gray-900 dark:text-gray-100">{children}</strong>
          ),
          // Emphasis (italic)
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
              {children}
            </td>
          ),
          // Horizontal rule
          hr: () => (
            <hr className="my-6 border-t border-gray-300 dark:border-gray-600" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5"></span>
      )}
    </div>
  )
}
