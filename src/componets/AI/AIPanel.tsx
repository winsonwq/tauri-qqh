import { useState, useRef, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import ReactMarkdown from 'react-markdown'
import AIMessageInput from './AIMessageInput'
import ToolCallConfirmModal, { ToolCall } from './ToolCallConfirmModal'
import { AIConfig, MCPServerInfo, MCPTool } from '../../models'
import { useMessage } from '../Toast'
import { useAppSelector } from '../../redux/hooks'

interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string // tool name
}

// Markdown 组件配置 - 共用样式
const markdownComponents = {
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
}

// 渲染消息内容
const renderMessageContent = (content: string) => {
  return (
    <div className="text-sm prose prose-sm max-w-none text-base-content">
      <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
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
const getMessageContainerClasses = (
  role: 'user' | 'assistant',
  isSticky: boolean,
) => {
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
  const message = useMessage()
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const configs = useAppSelector((state) => state.aiConfig.configs)
  const mcpServers = useAppSelector((state) => state.mcp.servers)
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[] | null>(null)
  const [currentStreamEventId, setCurrentStreamEventId] = useState<string | null>(null)
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const systemMessage = '你是一个专业的文档解析和分析专家，擅长理解和分析各种类型的文档内容。'

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
  const setMessageRef = useCallback(
    (messageId: string, element: HTMLDivElement | null) => {
      if (element) {
        messageRefs.current.set(messageId, element)
      } else {
        messageRefs.current.delete(messageId)
      }
    },
    [],
  )

  // 从 Redux store 中获取 AI 配置，并设置默认选中的配置
  useEffect(() => {
    if (configs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(configs[0].id)
    }
  }, [configs, selectedConfigId])

  // 清理事件监听
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [])

  // 获取可用的 MCP 工具
  const getAvailableTools = (): MCPTool[] => {
    const tools: MCPTool[] = []
    mcpServers.forEach((server) => {
      if (server.status === 'connected' && server.tools) {
        tools.push(...server.tools)
      }
    })
    return tools
  }

  // 查找工具对应的服务器
  const findToolServer = (toolName: string): MCPServerInfo | null => {
    return mcpServers.find((server) =>
      server.tools?.some((tool) => tool.name === toolName)
    ) || null
  }

  // 处理流式响应
  const handleStreamResponse = async (eventId: string) => {
    // 创建助手消息
    const assistantMessageId = Date.now().toString()
    const assistantMessage: AIMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, assistantMessage])

    // 监听流式事件
    const unlisten = await listen<{
      type: string
      content?: string
      tool_calls?: ToolCall[]
      event_id: string
    }>(`ai-chat-stream-${eventId}`, (event) => {
      const payload = event.payload
      if (payload.type === 'content' && payload.content) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: msg.content + payload.content }
              : msg
          )
        )
      } else if (payload.type === 'tool_calls' && payload.tool_calls) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, tool_calls: payload.tool_calls }
              : msg
          )
        )
        setPendingToolCalls(payload.tool_calls)
      } else if (payload.type === 'done') {
        if (unlistenRef.current) {
          unlistenRef.current()
          unlistenRef.current = null
        }
        setCurrentStreamEventId(null)
      }
    })
    unlistenRef.current = unlisten
  }

  // 执行工具调用并继续对话
  const executeToolCallsAndContinue = async (toolCalls: ToolCall[]) => {
    if (!selectedConfigId) {
      message.error('请先选择 AI 配置')
      return
    }

    // 执行所有工具调用
    const toolResults: AIMessage[] = []
    for (const toolCall of toolCalls) {
      const server = findToolServer(toolCall.function.name)
      if (!server) {
        message.error(`找不到工具 ${toolCall.function.name} 对应的服务器`)
        continue
      }

      try {
        let args: any = {}
        try {
          args = JSON.parse(toolCall.function.arguments)
        } catch {
          args = {}
        }

        const result = await invoke<any>('execute_mcp_tool_call', {
          serverName: server.name,
          toolName: toolCall.function.name,
          arguments: args,
        })

        toolResults.push({
          id: Date.now().toString() + Math.random(),
          role: 'tool',
          content: JSON.stringify(result),
          timestamp: new Date(),
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        })
      } catch (err) {
        console.error('工具调用失败:', err)
        message.error(`工具调用失败: ${err}`)
      }
    }

    // 添加工具结果消息
    setMessages((prev) => [...prev, ...toolResults])

    // 继续对话
    const allMessages = [...messages, ...toolResults]
    const chatMessages = allMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
      .map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
        name: m.name,
      }))

    const tools = getAvailableTools()
    const eventId = await invoke<string>('chat_completion', {
      configId: selectedConfigId,
      messages: chatMessages,
      tools: tools.length > 0 ? tools : null,
      systemMessage: systemMessage,
    })

    setCurrentStreamEventId(eventId)
    await handleStreamResponse(eventId)
  }

  const handleSend = async (messageText: string, configId?: string) => {
    const effectiveConfigId = configId || selectedConfigId
    if (!effectiveConfigId) {
      message.error('请先选择 AI 配置')
      return
    }

    // 添加用户消息
    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      // 构建消息历史
      const chatMessages = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
        .map((m) => ({
          role: m.role,
          content: m.content,
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name,
        }))

      // 添加当前用户消息
      chatMessages.push({
        role: 'user',
        content: messageText,
      })

      // 获取可用工具
      const tools = getAvailableTools()

      // 调用流式 API
      const eventId = await invoke<string>('chat_completion', {
        configId: effectiveConfigId,
        messages: chatMessages,
        tools: tools.length > 0 ? tools : null,
        systemMessage: systemMessage,
      })

      setCurrentStreamEventId(eventId)
      await handleStreamResponse(eventId)
    } catch (err) {
      console.error('AI 对话失败:', err)
      message.error(`AI 对话失败: ${err}`)
    }
  }

  // 处理工具调用确认
  const handleToolCallConfirm = async () => {
    if (!pendingToolCalls) return
    const toolCalls = pendingToolCalls
    setPendingToolCalls(null)
    await executeToolCallsAndContinue(toolCalls)
  }

  const handleToolCallCancel = () => {
    setPendingToolCalls(null)
    message.info('已取消工具调用')
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
              const isSticky =
                message.role === 'user' && stickyMessageId === message.id

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

      {/* 工具调用确认弹窗 */}
      {pendingToolCalls && (
        <ToolCallConfirmModal
          isOpen={!!pendingToolCalls}
          toolCalls={pendingToolCalls}
          onConfirm={handleToolCallConfirm}
          onCancel={handleToolCallCancel}
        />
      )}
    </div>
  )
}

export default AIPanel
