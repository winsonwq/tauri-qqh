import { useState, useRef, useCallback } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { AIMessage, convertAIMessagesToChatMessages, generateEventId } from '../utils/aiMessageUtils'
import { ToolCall } from '../componets/AI/ToolCallConfirmModal'
import { useMessage } from '../componets/Toast'
import { findToolServer, getAvailableTools, areAllDefaultMCPTools } from '../utils/toolUtils'
import { MCPServerInfo } from '../models'
import { generateThoughtPrompt, generateActionPrompt, generateObservationPrompt, ToolInfo } from '../utils/aiUtils'

// ReAct Agent 元数据，用于判断是否需要继续执行
export interface AgentMeta {
  shouldContinue: boolean // 是否需要继续执行
  nextAction?: string // 下一步行动（工具名、answer、analyze）
  reason?: string // 选择这个行动的原因
}

// ReAct 循环阶段
export type ReActPhase = 'idle' | 'thought' | 'action' | 'observation'

// 解析 AI 响应中的 agent_meta 标签
export function parseAgentMeta(content: string): AgentMeta | null {
  const metaMatch = content.match(/<agent_meta>([\s\S]*?)<\/agent_meta>/)
  if (!metaMatch) {
    return null
  }

  try {
    const metaContent = metaMatch[1].trim()
    // 尝试解析 JSON 格式
    if (metaContent.startsWith('{')) {
      return JSON.parse(metaContent)
    }
    return null
  } catch (e) {
    console.error('解析 agent_meta 失败:', e)
    return null
  }
}

// 从内容中移除 agent_meta 标签
export function removeAgentMeta(content: string): string {
  return content.replace(/<agent_meta>[\s\S]*?<\/agent_meta>/g, '').trim()
}

interface UseReActAgentOptions {
  selectedConfigId: string
  currentChatId: string | undefined
  currentResourceId: string | null
  currentTaskId: string | null
  messagesRef: React.MutableRefObject<AIMessage[]>
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void
  mcpServers: MCPServerInfo[]
}

// 从 MCP 服务器获取工具信息列表（只返回 enabled 且已连接的服务器工具）
function getToolInfoList(mcpServers: MCPServerInfo[]): ToolInfo[] {
  const toolInfoList: ToolInfo[] = []
  console.log('[ReAct getToolInfoList] 检查服务器:', mcpServers.map(s => ({
    name: s.name,
    status: s.status,
    enabled: s.config?.enabled,
    toolsCount: s.tools?.length || 0
  })))
  for (const server of mcpServers) {
    const isEnabled = server.config?.enabled ?? true
    console.log(`[ReAct] Server ${server.name}: enabled=${isEnabled}, status=${server.status}, tools=${server.tools?.length || 0}`)
    if (isEnabled && server.status === 'connected' && server.tools) {
      for (const tool of server.tools) {
        toolInfoList.push({
          name: tool.name,
          description: tool.description || '',
        })
      }
    }
  }
  return toolInfoList
}

export function useReActAgent({
  selectedConfigId,
  currentResourceId,
  currentTaskId,
  messagesRef,
  updateMessages,
  mcpServers,
}: UseReActAgentOptions) {
  const message = useMessage()
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<ReActPhase>('idle')
  const [currentIteration, setCurrentIteration] = useState(0)
  const [currentStreamEventId, setCurrentStreamEventId] = useState<string | null>(null)
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const isStoppedRef = useRef(false)
  const maxIterations = 10 // 最大循环次数，防止无限循环

  // 执行单个工具调用
  const executeToolCall = useCallback(
    async (toolCall: ToolCall): Promise<string> => {
      const server = findToolServer(toolCall.function.name, mcpServers)
      if (!server) {
        throw new Error(`找不到工具 ${toolCall.function.name} 对应的服务器`)
      }

      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch {
        args = {}
      }

      const result = await invoke<unknown>('execute_mcp_tool_call', {
        serverName: server.key || server.name,
        toolName: toolCall.function.name,
        arguments: args,
        currentResourceId: currentResourceId || null,
        currentTaskId: currentTaskId || null,
      })

      return JSON.stringify(result)
    },
    [mcpServers, currentResourceId, currentTaskId]
  )

  // 执行一轮 AI 调用并返回结果
  const executeAICall = useCallback(
    async (
      chatId: string,
      systemMessage: string,
      includeTools: boolean = false,
    ): Promise<{ content: string; toolCalls?: ToolCall[]; reasoning?: string }> => {
      return new Promise(async (resolve, reject) => {
        const eventId = generateEventId()
        setCurrentStreamEventId(eventId)

        const assistantMessageId = Date.now().toString()
        const assistantMessage: AIMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        }
        updateMessages((prev) => [...prev, assistantMessage])

        let finalContent = ''
        let finalReasoning = ''
        let finalToolCalls: ToolCall[] | undefined = undefined

        const eventName = `ai-chat-stream-${eventId}`
        
        const unlisten = await listen<{
          type: string
          content?: string
          tool_calls?: ToolCall[]
          event_id: string
        }>(eventName, (event) => {
          if (isStoppedRef.current) return

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
            updateMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, tool_calls: payload.tool_calls }
                  : msg
              )
            )
          } else if (payload.type === 'reasoning' && payload.content && payload.content.trim().length > 0) {
            finalReasoning += payload.content
            updateMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, reasoning: (msg.reasoning || '') + payload.content }
                  : msg
              )
            )
          } else if (payload.type === 'done' || payload.type === 'stopped') {
            unlisten()
            unlistenRef.current = null
            setCurrentStreamEventId(null)

            // 保存助手消息到数据库
            const hasValidReasoning = finalReasoning.trim().length > 0
            if (finalContent || finalToolCalls || hasValidReasoning) {
              invoke('save_message', {
                chatId,
                role: 'assistant',
                content: finalContent,
                toolCalls: finalToolCalls ? JSON.stringify(finalToolCalls) : null,
                toolCallId: null,
                name: null,
                reasoning: hasValidReasoning ? finalReasoning : null,
              }).catch((err) => {
                console.error('保存助手消息失败:', err)
              })
            }

            if (payload.type === 'stopped') {
              reject(new Error('用户停止'))
            } else {
              resolve({
                content: finalContent,
                toolCalls: finalToolCalls,
                reasoning: hasValidReasoning ? finalReasoning : undefined,
              })
            }
          }
        })
        unlistenRef.current = unlisten

        // 调用 AI API
        const currentMessages = messagesRef.current
        const chatMessages = convertAIMessagesToChatMessages(currentMessages)
        const tools = includeTools ? getAvailableTools(mcpServers) : []

        try {
          await invoke<string>('chat_completion', {
            configId: selectedConfigId,
            messages: chatMessages,
            tools: tools.length > 0 ? tools : null,
            systemMessage: systemMessage,
            eventId: eventId,
          })
        } catch (err) {
          unlisten()
          unlistenRef.current = null
          setCurrentStreamEventId(null)
          reject(err)
        }
      })
    },
    [selectedConfigId, messagesRef, updateMessages, mcpServers]
  )

  // 阶段1: 思考 - 分析问题，决定下一步行动
  const executeThought = useCallback(
    async (chatId: string): Promise<AgentMeta | null> => {
      setCurrentPhase('thought')
      console.log('[ReAct] 阶段1: 思考')
      
      const toolInfoList = getToolInfoList(mcpServers)
      console.log('[ReAct] 可用工具:', toolInfoList.map(t => t.name))
      const systemMessage = generateThoughtPrompt(currentResourceId, currentTaskId, toolInfoList)
      
      // 思考阶段不传工具，让 AI 只做分析决策
      const result = await executeAICall(chatId, systemMessage, false)
      console.log('[ReAct] 思考结果:', result.content.substring(0, 300))
      
      const meta = parseAgentMeta(result.content)
      console.log('[ReAct] 解析的 meta:', meta)
      return meta
    },
    [executeAICall, currentResourceId, currentTaskId, mcpServers]
  )

  // 阶段2: 行动 - 执行具体行动
  const executeAction = useCallback(
    async (chatId: string, actionType: string): Promise<{ content: string; toolCalls?: ToolCall[] }> => {
      setCurrentPhase('action')
      console.log('[ReAct] 阶段2: 行动 -', actionType)
      
      const toolInfoList = getToolInfoList(mcpServers)
      const isToolAction = toolInfoList.some(t => t.name === actionType)
      
      if (isToolAction) {
        // 工具调用：传入工具让 AI 调用
        const systemMessage = generateActionPrompt(actionType, currentResourceId, currentTaskId)
        console.log('[ReAct] 工具调用 prompt:', systemMessage)
        const result = await executeAICall(chatId, systemMessage, true)
        console.log('[ReAct] 工具调用结果 - toolCalls:', result.toolCalls)
        return result
      } else {
        // 非工具行动（answer、analyze）：让 AI 执行
        const systemMessage = generateActionPrompt(actionType, currentResourceId, currentTaskId)
        const result = await executeAICall(chatId, systemMessage, false)
        return result
      }
    },
    [executeAICall, currentResourceId, currentTaskId, mcpServers]
  )

  // 阶段3: 观察 - 总结工具结果
  const executeObservation = useCallback(
    async (chatId: string): Promise<string> => {
      setCurrentPhase('observation')
      console.log('[ReAct] 阶段3: 观察')
      
      const systemMessage = generateObservationPrompt()
      const result = await executeAICall(chatId, systemMessage, false)
      return result.content
    },
    [executeAICall]
  )

  // ReAct 主循环
  const runReActLoop = useCallback(
    async (chatId: string) => {
      let iteration = 0

      while (iteration < maxIterations && !isStoppedRef.current) {
        iteration++
        setCurrentIteration(iteration)
        console.log(`[ReAct] ========== 第 ${iteration} 轮迭代 ==========`)

        try {
          // 阶段1: 思考 - 分析问题，决定下一步行动
          const thoughtMeta = await executeThought(chatId)
          
          if (!thoughtMeta) {
            console.log('[ReAct] 思考阶段未返回有效 meta，结束循环')
            break
          }

          console.log('[ReAct] 思考决定:', thoughtMeta)

          // 检查是否结束（思考阶段已经包含了回答内容）
          if (!thoughtMeta.shouldContinue) {
            console.log('[ReAct] 思考决定结束循环（回答已在思考中输出）')
            break
          }

          // 阶段2: 行动 - 执行具体行动
          const nextAction = thoughtMeta.nextAction || 'answer'
          const actionResult = await executeAction(chatId, nextAction)
          
          // 检查是否有工具调用
          if (actionResult.toolCalls && actionResult.toolCalls.length > 0) {
            // 检查是否需要用户确认
            const allDefault = areAllDefaultMCPTools(actionResult.toolCalls, mcpServers)
            
            if (!allDefault) {
              // 非默认工具需要用户确认，暂停循环
              console.log('[ReAct] 工具需要用户确认，暂停循环')
              const lastAssistantMsg = [...messagesRef.current].reverse().find(
                (m: AIMessage) => m.role === 'assistant' && m.tool_calls
              )
              if (lastAssistantMsg) {
                updateMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === lastAssistantMsg.id
                      ? { ...msg, pendingToolCalls: actionResult.toolCalls }
                      : msg
                  )
                )
              }
              break
            }

            // 执行工具调用
            console.log('[ReAct] 执行工具调用')
            for (const toolCall of actionResult.toolCalls) {
              try {
                const toolResult = await executeToolCall(toolCall)
                
                // 添加工具结果消息
                const toolMessage: AIMessage = {
                  id: Date.now().toString() + Math.random(),
                  role: 'tool',
                  content: toolResult,
                  timestamp: new Date(),
                  tool_call_id: toolCall.id,
                  name: toolCall.function.name,
                }
                updateMessages((prev) => [...prev, toolMessage])

                // 保存工具结果到数据库
                await invoke('save_message', {
                  chatId,
                  role: 'tool',
                  content: toolResult,
                  toolCalls: null,
                  toolCallId: toolCall.id,
                  name: toolCall.function.name,
                  reasoning: null,
                })
              } catch (err) {
                console.error('工具调用失败:', err)
                message.error(`工具调用失败: ${err}`)
              }
            }

            // 阶段3: 观察 - 总结工具结果
            console.log('[ReAct] 开始执行观察阶段')
            try {
              await executeObservation(chatId)
              console.log('[ReAct] 观察阶段完成，准备进入下一轮')
            } catch (obsErr) {
              console.error('[ReAct] 观察阶段出错:', obsErr)
            }
            
            // 继续下一轮循环
            console.log('[ReAct] 执行 continue')
            continue
          }

          // 没有工具调用，说明是 answer 或 analyze，检查是否结束
          console.log('[ReAct] 行动完成，无工具调用')
          break

        } catch (err) {
          if ((err as Error).message === '用户停止') {
            console.log('[ReAct] 用户停止循环')
          } else {
            console.error('[ReAct] 执行出错:', err)
            message.error(`AI 对话失败: ${err}`)
          }
          break
        }
      }

      if (iteration >= maxIterations) {
        console.warn('[ReAct] 达到最大迭代次数限制')
        message.warning('AI 达到最大迭代次数限制')
      }

      setCurrentPhase('idle')
      setCurrentIteration(0)
      setIsStreaming(false)
    },
    [executeThought, executeAction, executeObservation, executeToolCall, mcpServers, messagesRef, updateMessages, message]
  )

  // 启动 ReAct Agent
  const startReActAgent = useCallback(
    async (chatId: string) => {
      isStoppedRef.current = false
      setIsStreaming(true)
      await runReActLoop(chatId)
    },
    [runReActLoop]
  )

  // 停止 ReAct Agent
  const stopReActAgent = useCallback(async () => {
    isStoppedRef.current = true
    if (currentStreamEventId) {
      try {
        await invoke('stop_chat_stream', { eventId: currentStreamEventId })
      } catch (err) {
        console.error('停止流式响应失败:', err)
      }
    }
    if (unlistenRef.current) {
      unlistenRef.current()
      unlistenRef.current = null
    }
    setIsStreaming(false)
    setCurrentStreamEventId(null)
  }, [currentStreamEventId])

  // 手动确认工具调用后继续执行
  const continueAfterToolConfirm = useCallback(
    async (toolCalls: ToolCall[], chatId: string) => {
      setIsStreaming(true)
      isStoppedRef.current = false

      // 执行工具调用
      for (const toolCall of toolCalls) {
        try {
          const toolResult = await executeToolCall(toolCall)
          
          const toolMessage: AIMessage = {
            id: Date.now().toString() + Math.random(),
            role: 'tool',
            content: toolResult,
            timestamp: new Date(),
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
          }
          updateMessages((prev) => [...prev, toolMessage])

          await invoke('save_message', {
            chatId,
            role: 'tool',
            content: toolResult,
            toolCalls: null,
            toolCallId: toolCall.id,
            name: toolCall.function.name,
            reasoning: null,
          })
        } catch (err) {
          console.error('工具调用失败:', err)
          message.error(`工具调用失败: ${err}`)
        }
      }

      // 继续 ReAct 循环
      await runReActLoop(chatId)
    },
    [executeToolCall, updateMessages, runReActLoop, message]
  )

  return {
    isStreaming,
    setIsStreaming,
    currentStreamEventId,
    currentPhase,
    currentIteration,
    startReActAgent,
    stopReActAgent,
    continueAfterToolConfirm,
  }
}

