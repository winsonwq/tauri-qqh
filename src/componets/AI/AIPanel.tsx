import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import AIMessageInput from './AIMessageInput'

interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// Markdown 组件配置 - 共用样式
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: any }) => {
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
    <ul className="list-disc list-inside mb-2 space-y-1">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1">
      {children}
    </ol>
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
    <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-bold mb-2 mt-4 first:mt-0">
      {children}
    </h3>
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
}

// 渲染消息内容
const renderMessageContent = (content: string) => {
  return (
    <div className="text-sm prose prose-sm max-w-none text-base-content">
      <ReactMarkdown components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

// 渲染时间戳
const renderTimestamp = (timestamp: Date) => {
  return (
    <div className="text-xs mt-2 text-base-content/60">
      {timestamp.toLocaleTimeString()}
    </div>
  )
}

// 获取消息容器样式
const getMessageContainerClasses = (role: 'user' | 'assistant', isSticky: boolean) => {
  const baseClasses = 'w-full'
  if (role === 'user') {
    return `${baseClasses} bg-base-200 border-b border-base-300 ${
      isSticky ? 'sticky top-0 z-10' : ''
    }`
  }
  return `${baseClasses} bg-base-100`
}

// 获取消息内容区域样式
const getMessageContentClasses = (role: 'user' | 'assistant') => {
  const baseClasses = 'w-full px-4 py-3'
  return role === 'user'
    ? `${baseClasses} bg-base-200`
    : `${baseClasses} bg-base-100`
}

// 消息项组件
interface MessageItemProps {
  message: AIMessage
  isSticky: boolean
  onRef: (element: HTMLDivElement | null) => void
}

const MessageItem = ({ message, isSticky, onRef }: MessageItemProps) => {
  return (
    <div
      ref={onRef}
      data-message-id={message.id}
      className={getMessageContainerClasses(message.role, isSticky)}
    >
      <div className={getMessageContentClasses(message.role)}>
        {renderMessageContent(message.content)}
        {renderTimestamp(message.timestamp)}
      </div>
    </div>
  )
}

const AIPanel = () => {
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 检测 sticky 状态：只保留最后一个进入 sticky 状态的 user 消息
  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === 'user')
    if (userMessages.length === 0) {
      setStickyMessageId(null)
      return
    }

    // 检测哪些消息在视口顶部
    const checkStickyMessages = () => {
      const stickyIds: string[] = []
      
      messageRefs.current.forEach((element, messageId) => {
        const message = messages.find((m) => m.id === messageId)
        if (message && message.role === 'user') {
          const rect = element.getBoundingClientRect()
          // 如果消息的顶部在视口顶部或上方，且底部在视口内，则认为它应该 sticky
          if (rect.top <= 0 && rect.bottom > 0) {
            stickyIds.push(messageId)
          }
        }
      })

      // 只保留最后一个 sticky 的消息（按消息顺序）
      if (stickyIds.length > 0) {
        // 按照消息在数组中的顺序排序，取最后一个
        const sortedStickyIds = stickyIds.sort((a, b) => {
          const indexA = messages.findIndex((m) => m.id === a)
          const indexB = messages.findIndex((m) => m.id === b)
          return indexA - indexB
        })
        setStickyMessageId(sortedStickyIds[sortedStickyIds.length - 1])
      } else {
        setStickyMessageId(null)
      }
    }

    // 使用 scroll 事件来检测
    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', checkStickyMessages)
      // 初始检查
      setTimeout(checkStickyMessages, 0)
      
      return () => {
        scrollContainer.removeEventListener('scroll', checkStickyMessages)
      }
    }
  }, [messages])

  // 注册消息元素的 ref
  const setMessageRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element)
    } else {
      messageRefs.current.delete(messageId)
    }
  }, [])

  const handleSend = (message: string) => {
    // 添加用户消息
    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    // TODO: 这里可以调用 AI API 获取回复
    // 暂时模拟一个回复
    setTimeout(() => {
      const assistantMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `这是一个模拟的 AI 回复。实际使用时，这里会调用 AI API 获取真实的回复。

## 功能特性

这个 AI 助手支持以下功能：

1. **Markdown 渲染** - 支持完整的 Markdown 语法
2. **代码高亮** - 可以展示代码块和行内代码
3. **格式化文本** - 支持*斜体*和**粗体**文本
4. **列表展示** - 有序列表和无序列表

### 代码示例

这里是一个简单的 JavaScript 示例：

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

### 引用文本

> 这是一段引用文本，用于强调重要信息。

### 链接和更多内容

你可以访问 [示例链接](https://example.com) 了解更多信息。

**注意**：这是一个模拟回复，实际使用时将调用真实的 AI API。`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    }, 500)
  }

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* 消息列表区域 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-base-content/60 p-4">
            <div className="text-center">
              <p className="text-lg mb-2">开始对话</p>
              <p className="text-sm">输入消息开始与 AI 对话</p>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {messages.map((message) => {
              const isSticky = message.role === 'user' && stickyMessageId === message.id
              
              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  isSticky={isSticky}
                  onRef={(el) => setMessageRef(message.id, el)}
                />
              )
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框区域 - 固定在底部 */}
      <div className="flex-shrink-0 p-3">
        <AIMessageInput onSend={handleSend} />
      </div>
    </div>
  )
}

export default AIPanel
