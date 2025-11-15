import { useState, useRef, useEffect, useCallback } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { AIMessage } from '../utils/aiMessageUtils'
import { ToolCall } from '../componets/AI/ToolCallConfirmModal'
import { useMessage } from '../componets/Toast'
import { areAllDefaultMCPTools } from '../utils/toolUtils'
import { MCPServerInfo } from '../models'

interface StreamResponseOptions {
  eventId: string
  chatId: string
  assistantMessageId: string
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void
  executeToolCallsAndContinue: (toolCalls: ToolCall[]) => Promise<void>
  mcpServers: MCPServerInfo[]
  setIsStreaming: (isStreaming: boolean) => void
  setCurrentStreamEventId: (eventId: string | null) => void
}

export function useStreamResponse() {
  const message = useMessage()
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStreamEventId, setCurrentStreamEventId] = useState<string | null>(null)
  const unlistenRef = useRef<UnlistenFn | null>(null)

  // 处理流式响应
  const handleStreamResponse = useCallback(
    async ({
      eventId,
      chatId,
      assistantMessageId,
      updateMessages,
      executeToolCallsAndContinue,
      mcpServers,
      setIsStreaming,
      setCurrentStreamEventId,
    }: StreamResponseOptions) => {
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
          updateMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + payload.content }
                : msg
            )
          )
        } else if (payload.type === 'tool_calls' && payload.tool_calls) {
          finalToolCalls = payload.tool_calls

          // 检查是否所有工具都属于默认 MCP
          const allDefault = areAllDefaultMCPTools(payload.tool_calls, mcpServers)

          if (allDefault) {
            // 默认 MCP 工具直接执行，不显示确认界面
            updateMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, tool_calls: payload.tool_calls }
                  : msg
              )
            )
            // 直接执行工具调用
            executeToolCallsAndContinue(payload.tool_calls).catch((err) => {
              console.error('执行默认 MCP 工具调用失败:', err)
              message.error(`工具调用失败: ${err}`)
            })
          } else {
            // 非默认 MCP 工具需要用户确认
            updateMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, tool_calls: payload.tool_calls, pendingToolCalls: payload.tool_calls }
                  : msg
              )
            )
          }
        } else if (payload.type === 'reasoning' && payload.content) {
          // 处理 reasoning/thinking 内容
          finalReasoning += payload.content
          updateMessages((prev) =>
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
    },
    [message],
  )

  // 启动流式响应（创建助手消息并开始监听）
  const startStreamResponse = useCallback(
    async (
      eventId: string,
      chatId: string,
      updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
      executeToolCallsAndContinue: (toolCalls: ToolCall[]) => Promise<void>,
      mcpServers: MCPServerInfo[],
    ) => {
      // 创建助手消息
      const assistantMessageId = Date.now().toString()
      const assistantMessage: AIMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }
      updateMessages((prev) => [...prev, assistantMessage])

      await handleStreamResponse({
        eventId,
        chatId,
        assistantMessageId,
        updateMessages,
        executeToolCallsAndContinue,
        mcpServers,
        setIsStreaming,
        setCurrentStreamEventId,
      })
    },
    [handleStreamResponse],
  )

  // 清理事件监听
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [])

  return {
    isStreaming,
    setIsStreaming,
    currentStreamEventId,
    setCurrentStreamEventId,
    startStreamResponse,
  }
}

