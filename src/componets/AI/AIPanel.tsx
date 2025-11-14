import { useState, useRef, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { HiPlus, HiClock } from 'react-icons/hi2'
import { FaMagic } from 'react-icons/fa'
import AIMessageInput from './AIMessageInput'
import { ToolCall } from './ToolCallConfirmModal'
import { markdownComponents } from './MarkdownComponents'
import { MCPServerInfo, MCPTool, Chat, ChatListItem, Message as ChatMessage } from '../../models'
import { useMessage } from '../Toast'
import { useAppSelector } from '../../redux/hooks'
import Tooltip from '../Tooltip'
import { formatDateTime } from '../../utils/format'

interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string // tool name
  reasoning?: string // thinking/reasoning 内容
  pendingToolCalls?: ToolCall[] // 待确认的工具调用
}

// 渲染消息内容
const renderMessageContent = (content: string) => {
  return (
    <div className="text-sm prose prose-sm max-w-none text-base-content break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

// 渲染时间戳
const renderTimestamp = (timestamp: Date) => {
  return (
    <div className="text-xs mt-2 text-base-content/60">
      {formatDateTime(timestamp)}
    </div>
  )
}

// 获取消息容器样式
const getMessageContainerClasses = (
  role: 'user' | 'assistant' | 'tool',
  isSticky: boolean,
) => {
  const baseClasses = ''
  if (role === 'user') {
    return `${baseClasses} p-2 bg-gradient-to-b from-base-100 via-base-100 to-transparent ${
      isSticky ? `sticky z-10` : ''
    }`
  }
  return `${baseClasses} bg-base-100`
}

// 获取消息内容区域样式
const getMessageContentClasses = (role: 'user' | 'assistant' | 'tool') => {
  const baseClasses = 'px-4 py-3'
  return role === 'user'
    ? `${baseClasses} bg-base-200 border rounded-lg border-base-300`
    : `${baseClasses} bg-base-100`
}

// 消息项组件
interface MessageItemProps {
  message: AIMessage
  isSticky: boolean
  onRef: (element: HTMLDivElement | null) => void
  onToolCallConfirm?: (toolCalls: ToolCall[]) => void
  onToolCallCancel?: (messageId: string) => void
}

const MessageItem = ({ message, isSticky, onRef, onToolCallConfirm, onToolCallCancel }: MessageItemProps) => {
  const [showReasoning, setShowReasoning] = useState(true)
  
  return (
    <div
      ref={onRef}
      data-message-id={message.id}
      className={getMessageContainerClasses(message.role, isSticky)}
      style={isSticky ? { top: 0 } : undefined}
    >
      <div className={getMessageContentClasses(message.role)}>
        {/* 显示 reasoning/thinking 内容 */}
        {message.reasoning && (
          <div className="mb-3 p-3 bg-base-300 rounded-lg border-l-4 border-primary relative">
            <div className="text-xs font-semibold text-primary mb-2">思考过程</div>
            <div className="relative min-h-[2rem]">
              {showReasoning ? (
                <div className="text-sm text-base-content/80 whitespace-pre-wrap break-words pb-6">
                  {message.reasoning}
                </div>
              ) : null}
              <button
                className="btn btn-ghost btn-xs text-left text-xs text-base-content/70 hover:text-base-content mt-2 p-0 h-auto min-h-0"
                onClick={() => setShowReasoning(!showReasoning)}
              >
                {showReasoning ? '收起' : '展开'}
              </button>
            </div>
          </div>
        )}
        
        {/* 显示主要内容 */}
        {message.content && renderMessageContent(message.content)}
        
        {/* 显示待确认的工具调用 */}
        {message.pendingToolCalls && message.pendingToolCalls.length > 0 && (
          <div className="mt-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
            <div className="text-sm font-semibold text-warning mb-2">需要确认工具调用</div>
            <div className="space-y-2 mb-3">
              {message.pendingToolCalls.map((toolCall, index) => {
                let args: any = {}
                try {
                  args = JSON.parse(toolCall.function.arguments)
                } catch {
                  args = {}
                }
                return (
                  <div key={index} className="bg-base-200 rounded p-2">
                    <div className="font-medium text-sm">{toolCall.function.name}</div>
                    <div className="text-xs text-base-content/70 mt-1 break-words">
                      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(args, null, 2)}</pre>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => onToolCallConfirm?.(message.pendingToolCalls!)}
              >
                确认执行
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => onToolCallCancel?.(message.id)}
              >
                取消
              </button>
            </div>
          </div>
        )}
        
        {/* 显示已完成的工具调用 */}
        {message.tool_calls && message.tool_calls.length > 0 && !message.pendingToolCalls && (
          <div className="mt-3 p-3 bg-info/10 rounded-lg border border-info/20">
            <div className="text-sm font-semibold text-info mb-2">工具调用</div>
            <div className="space-y-2">
              {message.tool_calls.map((toolCall, index) => {
                let args: any = {}
                try {
                  args = JSON.parse(toolCall.function.arguments)
                } catch {
                  args = {}
                }
                return (
                  <div key={index} className="bg-base-200 rounded p-2">
                    <div className="font-medium text-sm">{toolCall.function.name}</div>
                    <div className="text-xs text-base-content/70 mt-1 break-words">
                      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(args, null, 2)}</pre>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
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
  // 不再使用全局的 pendingToolCalls，而是将其存储在消息中
  // currentStreamEventId 用于跟踪当前流式响应的事件 ID，用于清理事件监听器
  const [currentStreamEventId, setCurrentStreamEventId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const systemMessage = '你是一个专业的文档解析和分析专家，擅长理解和分析各种类型的文档内容。'
  
  // Chat 相关状态
  const [currentChat, setCurrentChat] = useState<Chat | null>(null)
  const [chatList, setChatList] = useState<ChatListItem[]>([])
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const historyDropdownRef = useRef<HTMLDivElement>(null)
  const chatBarRef = useRef<HTMLDivElement>(null)
  const [chatBarHeight, setChatBarHeight] = useState(0)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 获取 Chat Bar 高度
  useEffect(() => {
    const updateChatBarHeight = () => {
      if (chatBarRef.current) {
        setChatBarHeight(chatBarRef.current.offsetHeight)
        console.log('[AIPanel] Chat Bar Height updated:', chatBarRef.current.offsetHeight)
      }
    }
    
    updateChatBarHeight()
    window.addEventListener('resize', updateChatBarHeight)
    
    return () => {
      window.removeEventListener('resize', updateChatBarHeight)
    }
  }, [])

  // 检测 sticky 状态：只保留最后一个进入 sticky 状态的 user 消息
  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === 'user')
    if (userMessages.length === 0) {
      setStickyMessageId(null)
      console.log('[AIPanel] Sticky Message ID: null (no user messages)')
      return
    }

    // 检测哪些消息在视口顶部
    const checkStickyMessages = () => {
      const stickyIds: string[] = []
      const scrollContainer = scrollContainerRef.current
      if (!scrollContainer) return

      // 获取滚动容器的位置
      const containerRect = scrollContainer.getBoundingClientRect()
      const containerTop = containerRect.top

      messageRefs.current.forEach((element, messageId) => {
        const message = messages.find((m) => m.id === messageId)
        if (message && message.role === 'user') {
          const rect = element.getBoundingClientRect()
          // 如果消息的顶部在滚动容器顶部或上方，且底部在滚动容器内，则认为它应该 sticky
          if (rect.top <= containerTop && rect.bottom > containerTop) {
            stickyIds.push(messageId)
          }
        }
      })

      // 只保留最后一个 sticky 的消息（按消息顺序）
      if (stickyIds.length > 0) {
        const sortedStickyIds = stickyIds.sort((a, b) => {
          const indexA = messages.findIndex((m) => m.id === a)
          const indexB = messages.findIndex((m) => m.id === b)
          return indexA - indexB
        })
        const newStickyId = sortedStickyIds[sortedStickyIds.length - 1]
        if (newStickyId !== stickyMessageId) {
          setStickyMessageId(newStickyId)
          console.log('[AIPanel] Sticky Message ID updated to:', newStickyId)
        }
      } else if (stickyMessageId !== null) {
        setStickyMessageId(null)
        console.log('[AIPanel] Sticky Message ID updated to: null (no sticky messages)')
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
  }, [messages, chatBarHeight])

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

  // 加载 chat 列表
  const loadChatList = async () => {
    try {
      const chats = await invoke<ChatListItem[]>('get_all_chats')
      setChatList(chats)
    } catch (err) {
      console.error('加载 chat 列表失败:', err)
    }
  }

  // 创建新 chat
  const handleCreateChat = async () => {
    try {
      const newChat = await invoke<Chat>('create_chat', { title: '' })
      setCurrentChat(newChat)
      setMessages([])
      await loadChatList()
    } catch (err) {
      console.error('创建 chat 失败:', err)
      message.error('创建对话失败')
    }
  }

  // 切换 chat
  const handleSwitchChat = async (chatId: string) => {
    try {
      const chat = await invoke<Chat | null>('get_chat', { chatId })
      if (!chat) {
        message.error('Chat 不存在')
        return
      }
      
      setCurrentChat(chat)
      
      // 加载消息
      const dbMessages = await invoke<ChatMessage[]>('get_messages_by_chat', { chatId })
      
      // 转换消息格式
      const convertedMessages: AIMessage[] = dbMessages.map((msg) => {
        let tool_calls: ToolCall[] | undefined
        if (msg.tool_calls) {
          try {
            tool_calls = JSON.parse(msg.tool_calls) as ToolCall[]
          } catch {
            tool_calls = undefined
          }
        }
        
        return {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          tool_calls,
          tool_call_id: msg.tool_call_id || undefined,
          name: msg.name || undefined,
          reasoning: msg.reasoning || undefined,
        }
      })
      
      setMessages(convertedMessages)
      setShowHistoryDropdown(false)
    } catch (err) {
      console.error('切换 chat 失败:', err)
      message.error('切换对话失败')
    }
  }

  // 初始化：加载最后一个 chat，如果没有则创建新 chat
  useEffect(() => {
    const initChat = async () => {
      if (!currentChat) {
        // 先加载 chat 列表
        try {
          const chats = await invoke<ChatListItem[]>('get_all_chats')
          setChatList(chats)
          
          // 如果有 chat，加载最新的（第一个）
          if (chats.length > 0) {
            const chatId = chats[0].id
            try {
              const chat = await invoke<Chat | null>('get_chat', { chatId })
              if (chat) {
                setCurrentChat(chat)
                
                // 加载消息
                const dbMessages = await invoke<ChatMessage[]>('get_messages_by_chat', { chatId })
                
                // 转换消息格式
                const convertedMessages: AIMessage[] = dbMessages.map((msg) => {
                  let tool_calls: ToolCall[] | undefined
                  if (msg.tool_calls) {
                    try {
                      tool_calls = JSON.parse(msg.tool_calls) as ToolCall[]
                    } catch {
                      tool_calls = undefined
                    }
                  }
                  
                  return {
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    timestamp: new Date(msg.created_at),
                    tool_calls,
                    tool_call_id: msg.tool_call_id || undefined,
                    name: msg.name || undefined,
                  }
                })
                
                setMessages(convertedMessages)
              }
            } catch (err) {
              console.error('加载 chat 失败:', err)
              // 如果加载失败，创建新 chat
              try {
                const newChat = await invoke<Chat>('create_chat', { title: '' })
                setCurrentChat(newChat)
                setMessages([])
                const updatedChats = await invoke<ChatListItem[]>('get_all_chats')
                setChatList(updatedChats)
              } catch (createErr) {
                console.error('创建 chat 失败:', createErr)
                message.error('创建对话失败')
              }
            }
          } else {
            // 如果没有 chat，创建新 chat
            try {
              const newChat = await invoke<Chat>('create_chat', { title: '' })
              setCurrentChat(newChat)
              setMessages([])
            } catch (err) {
              console.error('创建 chat 失败:', err)
              message.error('创建对话失败')
            }
          }
        } catch (err) {
          console.error('初始化 chat 失败:', err)
          // 如果加载失败，尝试创建新 chat
          try {
            const newChat = await invoke<Chat>('create_chat', { title: '' })
            setCurrentChat(newChat)
            setMessages([])
          } catch (createErr) {
            console.error('创建 chat 失败:', createErr)
            message.error('创建对话失败')
          }
        }
      }
    }
    initChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 点击外部关闭 dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false)
      }
    }
    
    if (showHistoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showHistoryDropdown])

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
  const handleStreamResponse = async (eventId: string, chatId: string) => {
    // 创建助手消息
    const assistantMessageId = Date.now().toString()
    const assistantMessage: AIMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, assistantMessage])
    
    let finalContent = ''
    let finalReasoning = ''
    let finalToolCalls: ToolCall[] | undefined = undefined

    // 监听流式事件
    const eventName = `ai-chat-stream-${eventId}`
    console.log('[AI Frontend] 开始监听事件:', eventName)
    
    const unlisten = await listen<{
      type: string
      content?: string
      tool_calls?: ToolCall[]
      event_id: string
    }>(eventName, (event) => {
      console.log('[AI Frontend] 收到事件类型:', event.payload.type)
      console.log('[AI Frontend] 收到事件:', event.payload)
      const payload = event.payload
      if (payload.type === 'content' && payload.content) {
        finalContent += payload.content
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: msg.content + payload.content }
              : msg
          )
        )
      } else if (payload.type === 'tool_calls' && payload.tool_calls) {
        finalToolCalls = payload.tool_calls
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, tool_calls: payload.tool_calls, pendingToolCalls: payload.tool_calls }
              : msg
          )
        )
      } else if (payload.type === 'reasoning' && payload.content) {
        // 处理 reasoning/thinking 内容
        finalReasoning += payload.content
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, reasoning: (msg.reasoning || '') + payload.content }
              : msg
          )
        )
      } else if (payload.type === 'done' || payload.type === 'stopped') {
        if (unlistenRef.current) {
          unlistenRef.current()
          unlistenRef.current = null
        }
        setCurrentStreamEventId(null)
        setIsStreaming(false)
        
        // 保存助手消息到数据库（即使被停止，也要保存已接收的内容）
        if (finalContent || finalToolCalls || finalReasoning) {
          invoke('save_message', {
            chatId,
            role: 'assistant',
            content: finalContent,
            toolCalls: finalToolCalls ? JSON.stringify(finalToolCalls) : null,
            toolCallId: null,
            name: null,
            reasoning: finalReasoning || null,
          }).catch((err) => {
            console.error('保存助手消息失败:', err)
          })
        }
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

    const chatId = currentChat?.id
    if (!chatId) {
      message.error('当前没有活动的对话')
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
    setMessages((prev) => {
      const updatedMessages = [...prev, ...toolResults]
      
      // 保存工具结果消息到数据库
      for (const toolResult of toolResults) {
        invoke('save_message', {
          chatId,
          role: 'tool',
          content: toolResult.content,
          toolCalls: null,
          toolCallId: toolResult.tool_call_id || null,
          name: toolResult.name || null,
          reasoning: null,
        }).catch((err) => {
          console.error('保存工具结果消息失败:', err)
        })
      }

      // 继续对话（使用更新后的消息列表）
      const chatMessages = updatedMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
        .map((m) => ({
          role: m.role,
          content: m.content,
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name,
        }))

      // 异步调用 API
      const tools = getAvailableTools()
      invoke<string>('chat_completion', {
        configId: selectedConfigId,
        messages: chatMessages,
        tools: tools.length > 0 ? tools : null,
        systemMessage: systemMessage,
      })
        .then((eventId) => {
          setCurrentStreamEventId(eventId)
          setIsStreaming(true)
          handleStreamResponse(eventId, chatId)
        })
        .catch((err) => {
          console.error('AI 对话失败:', err)
          message.error(`AI 对话失败: ${err}`)
          setIsStreaming(false)
          setCurrentStreamEventId(null)
        })

      return updatedMessages
    })
  }

  const handleSend = async (messageText: string, configId?: string) => {
    const effectiveConfigId = configId || selectedConfigId
    if (!effectiveConfigId) {
      message.error('请先选择 AI 配置')
      return
    }

    // 确保有当前 chat
    let chatId = currentChat?.id
    if (!chatId) {
      try {
        const newChat = await invoke<Chat>('create_chat', { title: '' })
        setCurrentChat(newChat)
        chatId = newChat.id
        await loadChatList()
      } catch (err) {
        console.error('创建 chat 失败:', err)
        message.error('创建对话失败')
        return
      }
    }

    // 添加用户消息
    const userMessageId = Date.now().toString()
    const userMessage: AIMessage = {
      id: userMessageId,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    // 保存用户消息到数据库
    try {
      await invoke('save_message', {
        chatId,
        role: 'user',
        content: messageText,
        toolCalls: null,
        toolCallId: null,
        name: null,
        reasoning: null,
      })
    } catch (err) {
      console.error('保存用户消息失败:', err)
    }

    try {
      // 构建消息历史（包含新添加的用户消息）
      const allMessages = [...messages, userMessage]
      const chatMessages = allMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
        .map((m) => ({
          role: m.role,
          content: m.content,
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name,
        }))

      // 获取可用工具
      const tools = getAvailableTools()

      // 调用流式 API
      console.log('[AI Frontend] 调用 chat_completion，configId:', effectiveConfigId)
      const eventId = await invoke<string>('chat_completion', {
        configId: effectiveConfigId,
        messages: chatMessages,
        tools: tools.length > 0 ? tools : null,
        systemMessage: systemMessage,
      })
      
      console.log('[AI Frontend] 收到 eventId:', eventId)

      setCurrentStreamEventId(eventId)
      setIsStreaming(true)
      await handleStreamResponse(eventId, chatId!)
    } catch (err) {
      console.error('AI 对话失败:', err)
      message.error(`AI 对话失败: ${err}`)
      setIsStreaming(false)
      setCurrentStreamEventId(null)
    }
  }

  // 处理工具调用确认
  const handleToolCallConfirm = async (toolCalls: ToolCall[]) => {
    // 找到包含这些 toolCalls 的消息并清除 pendingToolCalls
    setMessages((prev) =>
      prev.map((msg) => {
        // 使用 JSON 字符串比较来匹配 toolCalls
        const msgToolCallsStr = JSON.stringify(msg.pendingToolCalls || [])
        const toolCallsStr = JSON.stringify(toolCalls)
        if (msgToolCallsStr === toolCallsStr) {
          return { ...msg, pendingToolCalls: undefined }
        }
        return msg
      })
    )
    await executeToolCallsAndContinue(toolCalls)
  }

  const handleToolCallCancel = (messageId: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, pendingToolCalls: undefined }
          : msg
      )
    )
    message.info('已取消工具调用')
  }

  // 处理停止请求
  const handleStop = async () => {
    if (currentStreamEventId) {
      try {
        await invoke('stop_chat_completion', { eventId: currentStreamEventId })
        // 注意：停止后，handleStreamResponse 中的 'stopped' 事件会处理清理和保存
      } catch (err) {
        console.error('停止请求失败:', err)
        message.error('停止请求失败')
      }
    }
  }

  // 格式化时间
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return ''
    try {
      const date = new Date(timeStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      
      if (days === 0) {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      } else if (days === 1) {
        return '昨天'
      } else if (days < 7) {
        return `${days} 天前`
      } else {
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      }
    } catch {
      return ''
    }
  }

  // 使用 AI 总结 chat 标题
  const handleSummarizeTitle = async () => {
    if (!currentChat) {
      message.error('当前没有活动的对话')
      return
    }

    if (messages.length === 0) {
      message.error('对话中没有消息，无法生成标题')
      return
    }

    // 确保有可用的配置
    if (!selectedConfigId && configs.length === 0) {
      message.error('没有可用的 AI 配置，无法生成标题')
      return
    }

    try {
      message.info('正在生成标题...')
      const newTitle = await invoke<string>('summarize_chat_title', {
        chatId: currentChat.id,
        configId: selectedConfigId || (configs.length > 0 ? configs[0].id : null),
      })

      // 更新当前 chat 的标题
      setCurrentChat((prev) => {
        if (prev) {
          return { ...prev, title: newTitle }
        }
        return prev
      })

      // 重新加载 chat 列表以更新标题
      await loadChatList()

      message.success('标题生成成功')
    } catch (err) {
      console.error('生成标题失败:', err)
      message.error(`生成标题失败: ${err}`)
    }
  }

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Chat Bar */}
      <div ref={chatBarRef} className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-200">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {currentChat?.title || '新对话'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentChat && messages.length > 0 && (
            <Tooltip content="使用 AI 生成标题" position="bottom">
              <button
                className="btn btn-xs btn-ghost btn-square"
                onClick={handleSummarizeTitle}
              >
                <FaMagic className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
          <Tooltip content="新建对话" position="bottom">
            <button
              className="btn btn-xs btn-ghost btn-square"
              onClick={handleCreateChat}
            >
              <HiPlus className="h-4 w-4" />
            </button>
          </Tooltip>
          <div className="relative" ref={historyDropdownRef}>
            <Tooltip content="历史记录" position="bottom">
              <button
                className="btn btn-xs btn-ghost btn-square"
                onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              >
                <HiClock className="h-4 w-4" />
              </button>
            </Tooltip>
            {showHistoryDropdown && (
              <ul className="absolute right-0 top-full mt-1 bg-base-100 rounded-box z-[100] w-64 p-2 shadow-lg border border-base-300 max-h-96 overflow-y-auto">
                {chatList.length === 0 ? (
                  <li className="px-4 py-2 text-sm text-base-content/50">暂无历史记录</li>
                ) : (
                  chatList.map((chat) => (
                    <li key={chat.id}>
                      <button
                        className={`w-full text-left px-4 py-2 rounded hover:bg-base-200 transition-colors ${
                          currentChat?.id === chat.id ? 'bg-base-200' : ''
                        }`}
                        onClick={() => handleSwitchChat(chat.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{chat.title}</div>
                          {chat.last_message_at && (
                            <div className="text-xs text-base-content/60">
                              {formatTime(chat.last_message_at)}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

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
                  onToolCallConfirm={handleToolCallConfirm}
                  onToolCallCancel={handleToolCallCancel}
                />
              )
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框区域 - 固定在底部 */}
      <div className="flex-shrink-0 p-3">
        <AIMessageInput 
          onSend={handleSend} 
          isStreaming={isStreaming}
          onStop={handleStop}
        />
      </div>

    </div>
  )
}

export default AIPanel
