import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AIMessage, convertAIMessagesToChatMessages, generateEventId } from '../utils/aiMessageUtils'
import { ToolCall } from '../componets/AI/ToolCallConfirmModal'
import { useMessage } from '../componets/Toast'
import { findToolServer, getAvailableTools } from '../utils/toolUtils'
import { MCPServerInfo } from '../models'

interface UseToolCallsOptions {
  selectedConfigId: string
  currentChatId: string | undefined
  currentResourceId: string | null
  currentTaskId: string | null
  systemMessage: string
  messagesRef: React.MutableRefObject<AIMessage[]>
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void
  mcpServers: MCPServerInfo[]
  onStreamStart: (eventId: string, chatId: string) => Promise<void>
  setCurrentStreamEventId: (eventId: string | null) => void
  setIsStreaming: (isStreaming: boolean) => void
}

export function useToolCalls({
  selectedConfigId,
  currentChatId,
  currentResourceId,
  currentTaskId,
  systemMessage,
  messagesRef,
  updateMessages,
  mcpServers,
  onStreamStart,
  setCurrentStreamEventId,
  setIsStreaming,
}: UseToolCallsOptions) {
  const message = useMessage()

  // 执行工具调用并继续对话
  const executeToolCallsAndContinue = useCallback(
    async (toolCalls: ToolCall[]) => {
      if (!selectedConfigId) {
        message.error('请先选择 AI 配置')
        return
      }

      if (!currentChatId) {
        message.error('当前没有活动的对话')
        return
      }

      // 执行所有工具调用
      const toolResults: AIMessage[] = []
      for (const toolCall of toolCalls) {
        const server = findToolServer(toolCall.function.name, mcpServers)
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
            serverName: server.key || server.name,
            toolName: toolCall.function.name,
            arguments: args,
            currentResourceId: currentResourceId || null,
            currentTaskId: currentTaskId || null,
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

      // 更新消息列表
      // 使用 ref 获取最新的消息状态，避免异步状态更新的时序问题
      const currentMessages = messagesRef.current
      const updatedMessages = [...currentMessages, ...toolResults]
      console.log(
        '[executeToolCallsAndContinue] 当前消息数量:',
        currentMessages.length,
        '工具结果数量:',
        toolResults.length,
        '更新后消息数量:',
        updatedMessages.length
      )

      // 更新状态
      updateMessages(updatedMessages)

      // 保存工具结果消息到数据库
      for (const toolResult of toolResults) {
        invoke('save_message', {
          chatId: currentChatId,
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
      const chatMessages = convertAIMessagesToChatMessages(updatedMessages)

      // 异步调用 API（只调用一次）
      const tools = getAvailableTools(mcpServers)
      try {
        // 在前端生成 eventId，这样可以先设置监听器，避免丢失第一个事件
        const eventId = generateEventId()
        console.log('[AI Frontend] 生成 eventId (工具调用继续):', eventId)

        setCurrentStreamEventId(eventId)
        setIsStreaming(true)

        // 先设置监听器，然后再调用后端
        await onStreamStart(eventId, currentChatId)

        // 调用流式 API（传递 eventId）
        await invoke<string>('chat_completion', {
          configId: selectedConfigId,
          messages: chatMessages,
          tools: tools.length > 0 ? tools : null,
          systemMessage: systemMessage,
          eventId: eventId,
        })
      } catch (err) {
        console.error('AI 对话失败:', err)
        message.error(`AI 对话失败: ${err}`)
        setIsStreaming(false)
        setCurrentStreamEventId(null)
      }
    },
    [
      selectedConfigId,
      currentChatId,
      currentResourceId,
      currentTaskId,
      systemMessage,
      messagesRef,
      updateMessages,
      mcpServers,
      onStreamStart,
      setCurrentStreamEventId,
      setIsStreaming,
      message,
    ],
  )

  return {
    executeToolCallsAndContinue,
  }
}

