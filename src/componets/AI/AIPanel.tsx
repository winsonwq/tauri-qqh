import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useStateWithRef } from '../../hooks'
import { useChatManagement } from '../../hooks/useChatManagement'
import { useStickyMessages } from '../../hooks/useStickyMessages'
import { useStreamResponse } from '../../hooks/useStreamResponse'
import { useToolCalls } from '../../hooks/useToolCalls'
import { useReActAgent } from '../../hooks/useReActAgent'
import { runAgentWorkflow, AgentWorkflowController } from '../../hooks/useAgentWorkflow'
import { invoke } from '@tauri-apps/api/core'
import AIMessageInput, { AIMode } from './AIMessageInput'
import { ToolCall } from './ToolCallConfirmModal'
import { MessageItem } from './MessageItem'
import { ChatBar } from './ChatBar'
import { EmptyState } from './EmptyState'
import { AIMessage } from '../../utils/aiMessageUtils'
import { useMessage } from '../Toast'
import { useAppSelector } from '../../redux/hooks'
import { generateSystemMessage } from '../../utils/aiUtils'

const AIPanel = () => {
  const message = useMessage()
  const [messages, updateMessages, messagesRef] = useStateWithRef<AIMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const chatBarRef = useRef<HTMLDivElement | null>(null)
  const [chatBarHeight, setChatBarHeight] = useState(0)

  const configs = useAppSelector((state) => state.aiConfig.configs)
  const mcpServers = useAppSelector((state) => state.mcp.servers)
  const { currentResourceId, currentTaskId } = useAppSelector((state) => state.aiContext)
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [mode, setMode] = useState<AIMode>('ask')
  const isStoppedRef = useRef<boolean>(false)
  const workflowControllerRef = useRef<AgentWorkflowController | null>(null)

  // 动态生成 system message，根据当前上下文状态添加提示信息
  const systemMessage = useMemo(() => {
    return generateSystemMessage(currentResourceId, currentTaskId)
  }, [currentResourceId, currentTaskId])

  // Chat 管理
  const {
    currentChat,
    setCurrentChat,
    chatList,
    showHistoryDropdown,
    setShowHistoryDropdown,
    historyDropdownRef,
    loadChatList,
    handleCreateChat,
    handleSwitchChat,
    initialMessages,
  } = useChatManagement()

  // 初始化消息：只在首次加载时使用 initialMessages
  const isInitializedRef = useRef(false)
  useEffect(() => {
    if (!isInitializedRef.current && initialMessages.length > 0) {
      updateMessages(initialMessages)
      isInitializedRef.current = true
    }
  }, [initialMessages, updateMessages])


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

  // Sticky 消息检测
  const { stickyMessageId, setMessageRef } = useStickyMessages(
    messages,
    scrollContainerRef,
    chatBarHeight,
  )

  // 流式响应处理
  const {
    isStreaming,
    setIsStreaming,
    currentStreamEventId,
    setCurrentStreamEventId,
    startStreamResponse,
  } = useStreamResponse()

  // 工具调用处理
  const { executeToolCallsAndContinue } = useToolCalls({
    selectedConfigId,
    currentChatId: currentChat?.id,
    currentResourceId,
    currentTaskId,
    systemMessage,
    messagesRef,
    updateMessages,
    mcpServers,
    onStreamStart: async (eventId: string, chatId: string) => {
      await startStreamResponse(
        eventId,
        chatId,
        updateMessages,
        executeToolCallsAndContinue,
        mcpServers,
      )
    },
    setCurrentStreamEventId,
    setIsStreaming,
  })

  // ReAct Agent 处理 (Ask 模式)
  const {
    isStreaming: isReActStreaming,
    currentPhase: reactPhase,
    currentIteration: reactIteration,
    startReActAgent,
    stopReActAgent,
    continueAfterToolConfirm: continueReActAfterToolConfirm,
  } = useReActAgent({
    selectedConfigId,
    currentChatId: currentChat?.id,
    currentResourceId,
    currentTaskId,
    messagesRef,
    updateMessages,
    mcpServers,
  })

  // 合并流式状态
  const effectiveIsStreaming = isStreaming || isReActStreaming

  // 从 Redux store 中获取 AI 配置，并设置默认选中的配置
  useEffect(() => {
    if (configs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(configs[0].id)
    }
  }, [configs, selectedConfigId])

  // 处理发送消息 - Ask 模式（ReAct 循环模式）
  const handleSendAsk = useCallback(
    async (messageText: string, configId?: string) => {
      // 防止重复调用
      if (effectiveIsStreaming) {
        return
      }

      const effectiveConfigId = configId || selectedConfigId
      if (!effectiveConfigId) {
        message.error('请先选择 AI 配置')
        return
      }

      // 确保有当前 chat
      let chatId = currentChat?.id
      if (!chatId) {
        try {
          const newChat = await handleCreateChat()
          chatId = newChat?.id
        } catch (err) {
          return
        }
      }

      // 重置停止标志
      isStoppedRef.current = false

      // 添加用户消息
      const userMessageId = Date.now().toString()
      const userMessage: AIMessage = {
        id: userMessageId,
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      }
      updateMessages((prev) => [...prev, userMessage])

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

      // 启动 ReAct Agent 循环
      try {
        await startReActAgent(chatId!)
      } catch (err) {
        console.error('ReAct Agent 执行失败:', err)
        if (!isStoppedRef.current) {
          message.error(`AI 对话失败: ${err}`)
        }
      }
    },
    [
      selectedConfigId,
      currentChat,
      handleCreateChat,
      updateMessages,
      startReActAgent,
      message,
      effectiveIsStreaming,
    ],
  )

  // 处理发送消息 - Agents 模式（多 Agent 工作流）
  const handleSendAgents = useCallback(
    async (messageText: string, configId?: string) => {
      // 防止重复调用
      if (effectiveIsStreaming) {
        return
      }

      const effectiveConfigId = configId || selectedConfigId
      if (!effectiveConfigId) {
        message.error('请先选择 AI 配置')
        return
      }

      // 确保有当前 chat
      let chatId = currentChat?.id
      if (!chatId) {
        try {
          const newChat = await handleCreateChat()
          chatId = newChat?.id
        } catch (err) {
          return
        }
      }

      // 重置停止标志
      isStoppedRef.current = false

      // 添加用户消息
      const userMessageId = Date.now().toString()
      const userMessage: AIMessage = {
        id: userMessageId,
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      }
      updateMessages((prev) => [...prev, userMessage])

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
        setIsStreaming(true)

        // 使用 messagesRef.current 获取最新的消息列表（不包含刚添加的用户消息）
        // 因为 userMessage 会单独传递给 runAgentWorkflow
        const currentMessages = messagesRef.current.filter(msg => msg.id !== userMessageId)

        // 使用 Agent 工作流，获取控制器
        const { controller, promise } = runAgentWorkflow({
          configId: effectiveConfigId,
          chatId: chatId!,
          userMessage: messageText,
          messages: currentMessages,
          updateMessages: updateMessages,
          messagesRef: messagesRef,
          mcpServers: mcpServers,
          currentResourceId: currentResourceId,
          currentTaskId: currentTaskId,
          systemMessage: systemMessage,
        })
        
        // 保存控制器引用，以便停止时使用
        workflowControllerRef.current = controller
        
        await promise
      } catch (err) {
        console.error('AI 对话失败:', err)
        if (!isStoppedRef.current) {
          message.error(`AI 对话失败: ${err}`)
        }
      } finally {
        setIsStreaming(false)
        setCurrentStreamEventId(null)
        workflowControllerRef.current = null
      }
    },
    [
      selectedConfigId,
      currentChat,
      handleCreateChat,
      updateMessages,
      messagesRef,
      mcpServers,
      currentResourceId,
      currentTaskId,
      systemMessage,
      setIsStreaming,
      setCurrentStreamEventId,
      message,
      isStreaming,
    ],
  )

  // 统一的发送处理函数
  const handleSend = useCallback(
    async (messageText: string, configId?: string) => {
      if (mode === 'ask') {
        await handleSendAsk(messageText, configId)
      } else {
        await handleSendAgents(messageText, configId)
      }
    },
    [mode, handleSendAsk, handleSendAgents],
  )

  // 处理工具调用确认
  const handleToolCallConfirm = useCallback(
    async (toolCalls: ToolCall[]) => {
      // 找到包含这些 toolCalls 的消息并清除 pendingToolCalls
      updateMessages((prev) =>
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
      
      // 根据模式选择不同的继续执行方式
      if (mode === 'ask' && currentChat?.id) {
        // Ask 模式使用 ReAct 继续执行
        await continueReActAfterToolConfirm(toolCalls, currentChat.id)
      } else {
        // Agents 模式使用原有的工具调用继续
        await executeToolCallsAndContinue(toolCalls)
      }
    },
    [updateMessages, executeToolCallsAndContinue, continueReActAfterToolConfirm, mode, currentChat],
  )

  const handleToolCallCancel = useCallback(
    (messageId: string) => {
      updateMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, pendingToolCalls: undefined } : msg
        )
      )
      message.info('已取消工具调用')
    },
    [updateMessages, message],
  )

  // 处理停止请求
  const handleStop = useCallback(async () => {
    // 设置停止标志
    isStoppedRef.current = true

    // 停止 Agent 工作流（会中止所有进行中的请求）
    if (workflowControllerRef.current) {
      workflowControllerRef.current.stop()
      workflowControllerRef.current = null
    }

    // 停止 ReAct Agent（Ask 模式）
    await stopReActAgent()

    // 同时停止单独的流式请求
    if (currentStreamEventId) {
      try {
        await invoke('stop_chat_completion', { eventId: currentStreamEventId })
      } catch (err) {
        console.error('停止请求失败:', err)
      }
    }

    setIsStreaming(false)
    setCurrentStreamEventId(null)
  }, [currentStreamEventId, setIsStreaming, setCurrentStreamEventId, stopReActAgent])

  // 使用 AI 总结 chat 标题
  const handleSummarizeTitle = useCallback(async () => {
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
  }, [currentChat, messages.length, selectedConfigId, configs, setCurrentChat, loadChatList, message])

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      try {
        await invoke('delete_chat', { chatId })
        message.success('对话已删除')
        const chats = await loadChatList()
        setShowHistoryDropdown(false)

        if (chats.length > 0) {
          const latestChatId = chats[0].id
          const convertedMessages = await handleSwitchChat(latestChatId)
          updateMessages(convertedMessages)
        } else {
          const newChat = await handleCreateChat()
          if (newChat) {
            updateMessages([])
          }
        }
      } catch (err) {
        console.error('删除对话失败:', err)
        message.error('删除对话失败')
      }
    },
    [
      handleCreateChat,
      handleSwitchChat,
      loadChatList,
      message,
      setShowHistoryDropdown,
      updateMessages,
    ],
  )

  const handleRenameChat = useCallback(
    async (chatId: string, newTitle: string) => {
      const trimmed = newTitle.trim()
      if (!trimmed) {
        message.error('标题不能为空')
        return
      }

      try {
        await invoke('update_chat_title', { chatId, title: trimmed })
        await loadChatList()
        if (currentChat?.id === chatId) {
          setCurrentChat((prev) => (prev ? { ...prev, title: trimmed } : prev))
        }
        message.success('标题已更新')
      } catch (err) {
        console.error('更新标题失败:', err)
        message.error('更新标题失败')
      }
    },
    [currentChat, loadChatList, message, setCurrentChat],
  )

  // 处理创建新 chat
  const onCreateChat = useCallback(async () => {
    try {
      await handleCreateChat()
      updateMessages([])
    } catch (err) {
      // 错误已在 handleCreateChat 中处理
    }
  }, [handleCreateChat, updateMessages])

  // 处理切换 chat
  const onSwitchChat = useCallback(
    async (chatId: string) => {
      const convertedMessages = await handleSwitchChat(chatId)
      updateMessages(convertedMessages)
    },
    [handleSwitchChat, updateMessages],
  )

  // 找到最后一个 assistant 消息
  const lastAssistantIndex = useMemo(() => {
    return (
      messages
        .map((m, i) => ({ role: m.role, index: i }))
        .filter((m) => m.role === 'assistant')
        .pop()?.index ?? -1
    )
  }, [messages])

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Chat Bar */}
      <div ref={chatBarRef}>
        <ChatBar
          currentChat={currentChat}
          chatList={chatList}
          showHistoryDropdown={showHistoryDropdown}
          historyDropdownRef={historyDropdownRef}
          messagesCount={messages.length}
          onToggleHistory={() => setShowHistoryDropdown(!showHistoryDropdown)}
          onCreateChat={onCreateChat}
          onSwitchChat={onSwitchChat}
          onSummarizeTitle={handleSummarizeTitle}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
        />
      </div>

      {/* 消息列表区域 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-0">
            {messages.map((message, index) => {
              const isSticky = message.role === 'user' && stickyMessageId === message.id
              const isLastAssistantMessage = index === lastAssistantIndex

              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  isSticky={isSticky}
                  messages={messages}
                  onRef={(el) => setMessageRef(message.id, el)}
                  onToolCallConfirm={handleToolCallConfirm}
                  onToolCallCancel={handleToolCallCancel}
                  isStreaming={effectiveIsStreaming}
                  isLastAssistantMessage={isLastAssistantMessage}
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
          isStreaming={effectiveIsStreaming}
          onStop={handleStop}
          mode={mode}
          onModeChange={setMode}
        />
      </div>
    </div>
  )
}

export default AIPanel
