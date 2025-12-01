import React from 'react'

// 创建 markdown 组件配置的工厂函数
// 允许自定义表格组件
export const createMarkdownComponents = (
  TableComponent: React.FC<{ children: React.ReactNode }>,
) => ({
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  code: ({
    className,
    children,
    ...props
  }: {
    className?: string
    children?: React.ReactNode
    [key: string]: any
  }) => {
    const isInline = !className
    return isInline ? (
      <code
        className="bg-base-300 px-1 py-0.5 rounded text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    ) : (
      <code
        className="block bg-base-300 p-3 rounded text-sm font-mono overflow-x-auto"
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-base-300 p-3 rounded overflow-x-auto mb-2">
      {children}
    </pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="ml-4">{children}</li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-base-300 pl-4 italic mb-2">
      {children}
    </blockquote>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-bold mb-2 mt-4 first:mt-0">{children}</h3>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      className="text-primary underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  hr: () => (
    <hr className="my-4 border-base-300" />
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <TableComponent>{children}</TableComponent>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-base-200">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b border-base-300">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-base-300 px-2 py-1.5 text-left font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-base-300 px-2 py-1.5 break-words max-w-xs">
      {children}
    </td>
  ),
})

