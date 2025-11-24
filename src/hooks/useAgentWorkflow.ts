/**
 * Agent 工作流 Hook
 * 
 * 实现三层循环：
 * 1. Planner 循环：判断是否还需要继续做计划
 * 2. Todos 执行循环：执行所有 todos
 * 3. Executor 工具调用循环：每个任务执行时可能需要调用工具
 * 4. Verifier 验证：所有任务完成后验证并打分
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { AIMessage, convertAIMessagesToChatMessages, generateEventId } from '../utils/aiMessageUtils'
import { ToolCall } from '../componets/AI/ToolCallConfirmModal'
import { loadAgentPrompt } from '../agents/loadPrompts'
import { PlannerResponse, Todo, VerifierResponse, AgentType, AgentAction } from '../agents/agentTypes'
import { MCPServerInfo } from '../models'
import { getAvailableTools, findToolServer } from '../utils/toolUtils'

interface AgentWorkflowOptions {
  configId: string
  chatId: string
  userMessage: string
  messages: AIMessage[]
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void
  messagesRef: React.MutableRefObject<AIMessage[]>
  mcpServers: MCPServerInfo[]
  currentResourceId: string | null
  currentTaskId: string | null
  systemMessage: string
  isStoppedRef: React.MutableRefObject<boolean>
}

/**
 * 仅执行工具调用，不继续调用 AI
 */
async function executeToolCallsOnly(
  toolCalls: ToolCall[],
  mcpServers: MCPServerInfo[],
  currentResourceId: string | null,
  currentTaskId: string | null,
  chatId: string,
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
): Promise<AIMessage[]> {
  const toolResults: AIMessage[] = []

  for (const toolCall of toolCalls) {
    const server = findToolServer(toolCall.function.name, mcpServers)
    if (!server) {
      console.error(`[Agent] 找不到工具 ${toolCall.function.name} 对应的服务器`)
      continue
    }

    console.log(`[Agent] Executor 执行工具: ${toolCall.function.name}`)
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
      console.log(`[Agent] Executor 工具执行完成: ${toolCall.function.name}`)
    } catch (err) {
      console.error(`[Agent] Executor 工具执行失败: ${toolCall.function.name}`, err)
      throw err
    }
  }

  // 更新消息列表
  updateMessages((prev) => [...prev, ...toolResults])

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

  return toolResults
}

/**
 * 等待流式响应完成
 */
async function waitForStreamComplete(
  eventId: string,
  assistantMessageId: string,
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
  isStoppedRef: React.MutableRefObject<boolean>,
): Promise<{ content: string; toolCalls?: ToolCall[]; reasoning?: string }> {
  return new Promise((resolve, reject) => {
    let finalContent = ''
    let finalToolCalls: ToolCall[] | undefined = undefined
    let finalReasoning = ''
    let resolved = false
    let unlisten: UnlistenFn | null = null

    const eventName = `ai-chat-stream-${eventId}`

    listen<{
      type: string
      content?: string
      tool_calls?: ToolCall[]
      event_id: string
    }>(eventName, (event) => {
      if (resolved) return

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
        console.log(`[waitForStreamComplete] 收到工具调用:`, payload.tool_calls.length, payload.tool_calls.map(tc => tc.function?.name))
        finalToolCalls = payload.tool_calls
        updateMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { 
                  ...msg, 
                  tool_calls: payload.tool_calls,
                  // 如果有 tool_calls，设置 action 为 calling_tool
                  action: msg.agentType === 'executor' ? 'calling_tool' as AgentAction : msg.action
                }
              : msg
          )
        )
      } else if (payload.type === 'reasoning' && payload.content && payload.content.trim().length > 0) {
        // 处理 reasoning/thinking 内容（过滤空内容）
        finalReasoning += payload.content
        updateMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { 
                  ...msg, 
                  reasoning: (msg.reasoning || '') + payload.content,
                  // 如果有 reasoning，设置 action 为 thinking
                  action: msg.agentType === 'executor' ? 'thinking' as AgentAction : msg.action
                }
              : msg
          )
        )
      } else if (payload.type === 'done' || payload.type === 'stopped') {
        resolved = true
        if (unlisten) {
          unlisten()
        }
        
        // 清理消息对象中的空 reasoning 字段
        const hasValidReasoning = finalReasoning.trim().length > 0
        updateMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  // 如果 reasoning 为空，则移除该字段
                  ...(hasValidReasoning ? { reasoning: finalReasoning } : { reasoning: undefined }),
                }
              : msg
          )
        )
        
        if (payload.type === 'stopped' || isStoppedRef.current) {
          reject(new Error('已停止'))
        } else {
          resolve({
            content: finalContent,
            toolCalls: finalToolCalls,
            reasoning: hasValidReasoning ? finalReasoning : undefined,
          })
        }
      }
    }).then((fn) => {
      unlisten = fn
      // 如果已经停止，清理监听器
      if (isStoppedRef.current) {
        fn()
        reject(new Error('已停止'))
      }
    }).catch((err) => {
      reject(err)
    })
  })
}

/**
 * 调用 AI 并等待完成
 */
async function callAIAndWait(
  configId: string,
  messages: AIMessage[],
  systemMessage: string,
  agentPrompt: string,
  tools: any[] | null,
  eventId: string,
  chatId: string,
  assistantMessageId: string,
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
  isStoppedRef: React.MutableRefObject<boolean>,
): Promise<{ content: string; toolCalls?: ToolCall[]; reasoning?: string }> {
  // 创建助手消息
  const assistantMessage: AIMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    timestamp: new Date(),
  }
  updateMessages((prev) => [...prev, assistantMessage])

  // 先设置监听器
  const waitPromise = waitForStreamComplete(eventId, assistantMessageId, updateMessages, isStoppedRef)

  // 构建消息列表
  const chatMessages = convertAIMessagesToChatMessages(messages)
  
  // 合并 system message 和 agent prompt
  const combinedSystemMessage = `${systemMessage}\n\n${agentPrompt}`

  // 调试：检查工具传递
  const toolsToSend = tools && tools.length > 0 ? tools : null
  if (toolsToSend) {
    console.log(`[callAIAndWait] 传递工具给 AI:`, toolsToSend.length, toolsToSend.map(t => t.name))
  } else {
    console.log(`[callAIAndWait] 没有工具传递给 AI`)
  }

  // 调用 API
  await invoke<string>('chat_completion', {
    configId,
    messages: chatMessages,
    tools: toolsToSend,
    systemMessage: combinedSystemMessage,
    eventId: eventId,
  })

  // 等待流式响应完成
  const result = await waitPromise

  // 保存消息到数据库
  // 过滤空的 reasoning
  const hasValidReasoning = result.reasoning && result.reasoning.trim().length > 0
  await invoke('save_message', {
    chatId,
    role: 'assistant',
    content: result.content,
    toolCalls: result.toolCalls ? JSON.stringify(result.toolCalls) : null,
    toolCallId: null,
    name: null,
    reasoning: hasValidReasoning ? result.reasoning : null,
  }).catch((err) => {
    console.error('保存助手消息失败:', err)
  })

  return result
}

/**
 * 解析 Planner 响应
 */
function parsePlannerResponse(content: string): PlannerResponse | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as PlannerResponse
    }
  } catch (error) {
    console.error('解析 Planner 响应失败:', error)
  }
  return null
}

/**
 * 解析 Verifier 响应
 */
function parseVerifierResponse(content: string): VerifierResponse | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as VerifierResponse
    }
  } catch (error) {
    console.error('解析 Verifier 响应失败:', error)
  }
  return null
}

/**
 * Agent 工作流主函数
 */
export async function runAgentWorkflow({
  configId,
  chatId,
  userMessage,
  messages,
  updateMessages,
  messagesRef,
  mcpServers,
  currentResourceId,
  currentTaskId,
  systemMessage,
  isStoppedRef,
}: AgentWorkflowOptions): Promise<void> {
  // 加载 agent 提示词
  const plannerPrompt = await loadAgentPrompt('planner')
  const executorPrompt = await loadAgentPrompt('executor')
  const verifierPrompt = await loadAgentPrompt('verifier')

  const tools = getAvailableTools(mcpServers)
  console.log(`[Agent] 工作流初始化，可用工具: ${tools.length} 个 (${tools.map(t => t.name).join(', ')})`)
  console.log(`[Agent] 当前上下文 - resourceId: ${currentResourceId}, taskId: ${currentTaskId}`)
  console.log(`[Agent] SystemMessage 包含上下文:`, systemMessage.includes('当前资源ID') || systemMessage.includes('当前任务ID'))
  let currentMessages = [...messages]
  const todos: Todo[] = []

  // ========== 第一层循环：Planner 循环 ==========
  let needsMorePlanning = true
  let planningRound = 0
  const maxPlanningRounds = 3

  while (needsMorePlanning && planningRound < maxPlanningRounds && !isStoppedRef.current) {
    planningRound++
    console.log(`[Agent] Planner 正在规划 (第 ${planningRound} 轮)`)

    // 构建 planner 消息
    const plannerMessages: AIMessage[] = [
      ...currentMessages,
      {
        id: `planner-user-${planningRound}`,
        role: 'user',
        content: planningRound === 1 
          ? userMessage 
          : '请根据之前的对话，判断是否还需要进一步规划任务。如果需要，请补充或细化任务列表。',
        timestamp: new Date(),
      },
    ]

    // 调用 planner
    const eventId = generateEventId()
    const assistantMessageId = `planner-msg-${planningRound}`

    try {
      const response = await callAIAndWait(
        configId,
        plannerMessages,
        systemMessage,
        plannerPrompt,
        null, // planner 不使用工具
        eventId,
        chatId,
        assistantMessageId,
        updateMessages,
        isStoppedRef.current ? isStoppedRef : { current: false },
      )

      // 更新消息的 agentType 和 action
      updateMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, agentType: 'planner' as AgentType, action: 'planning' as AgentAction }
            : msg
        )
      )

      // 解析 planner 响应
      const plannerResponse = parsePlannerResponse(response.content)
      if (plannerResponse) {
        const currentTodosCount = todos.length
        todos.push(...plannerResponse.todos)
        const newTodosCount = todos.length
        
        console.log(`[Agent] Planner 规划完成 (第 ${planningRound} 轮): 生成 ${newTodosCount - currentTodosCount} 个新任务，总计 ${newTodosCount} 个任务`)
        
        // 如果这次规划没有生成新任务，且 planner 还要求继续规划，则停止规划
        if (newTodosCount === currentTodosCount && plannerResponse.needsMorePlanning) {
          console.log('[Agent] Planner 要求继续规划但没有生成新任务，停止规划循环')
          needsMorePlanning = false
        } else {
          needsMorePlanning = plannerResponse.needsMorePlanning
          if (needsMorePlanning) {
            console.log(`[Agent] Planner 需要继续规划`)
          } else {
            console.log(`[Agent] Planner 规划完成，共 ${newTodosCount} 个任务`)
          }
        }
      } else {
        console.log(`[Agent] Planner 规划完成 (第 ${planningRound} 轮): 无法解析响应`)
        needsMorePlanning = false
      }

      currentMessages = [
        ...currentMessages,
        {
          id: `planner-user-${planningRound}`,
          role: 'user',
          content: planningRound === 1 ? userMessage : '请根据之前的对话，判断是否还需要进一步规划任务。',
          timestamp: new Date(),
        },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          agentType: 'planner',
        },
      ]
    } catch (error) {
      console.error('Planner 调用失败:', error)
      if (isStoppedRef.current) {
        return
      }
      throw error
    }
  }

  if (isStoppedRef.current) {
    return
  }

  // 如果没有任务，直接返回
  if (todos.length === 0) {
    return
  }

  // ========== 第二层循环：Todos 执行循环 ==========
  const sortedTodos = [...todos].sort((a, b) => a.priority - b.priority)
  console.log(`[Agent] 开始执行任务，共 ${sortedTodos.length} 个任务`)

  for (let i = 0; i < sortedTodos.length; i++) {
    if (isStoppedRef.current) {
      return
    }

    const todo = sortedTodos[i]
    todo.status = 'executing'
    console.log(`[Agent] Executor 开始执行任务: ${todo.id} - ${todo.description} (${i + 1}/${sortedTodos.length})`)

    // ========== 第三层循环：Executor 工具调用循环 ==========
    let todoCompleted = false
    let executorRound = 0
    const maxExecutorRounds = 10

    while (!todoCompleted && executorRound < maxExecutorRounds && !isStoppedRef.current) {
      executorRound++
      console.log(`[Agent] Executor 正在执行任务: ${todo.id} (第 ${executorRound} 轮)`)

      // 构建 executor 消息
      const executorMessages: AIMessage[] = [
        ...currentMessages,
        {
          id: `executor-user-${todo.id}-${executorRound}`,
          role: 'user',
          content: executorRound === 1
            ? `请执行以下任务：\n\n任务ID: ${todo.id}\n任务描述: ${todo.description}\n\n请开始执行此任务。`
            : '请继续完成当前任务。如果已经完成，请明确说明任务已完成。',
          timestamp: new Date(),
        },
      ]

      // 调用 executor
      const eventId = generateEventId()
      const assistantMessageId = `executor-msg-${todo.id}-${executorRound}`

      // 调试：检查工具是否可用
      if (tools.length > 0) {
        console.log(`[Agent] Executor 可用工具: ${tools.map(t => t.name).join(', ')}`)
      }

      try {
        const response = await callAIAndWait(
          configId,
          executorMessages,
          systemMessage,
          executorPrompt,
          tools.length > 0 ? tools : null,
          eventId,
          chatId,
          assistantMessageId,
          updateMessages,
          isStoppedRef.current ? isStoppedRef : { current: false },
        )

        // 调试：检查响应中的工具调用
        console.log(`[Agent Workflow] Executor 响应:`, {
          hasContent: !!response.content,
          hasToolCalls: !!response.toolCalls,
          toolCallsCount: response.toolCalls?.length || 0,
        })

        // 更新消息的 agentType 和 action
        // 根据是否有 reasoning 或 tool_calls 来决定 action
        let action: AgentAction | undefined = undefined
        if (response.toolCalls && response.toolCalls.length > 0) {
          action = 'calling_tool'
        } else if (response.reasoning && response.reasoning.trim().length > 0) {
          // 只在 reasoning 有实际内容时设置为 thinking
          action = 'thinking'
        }

        updateMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { 
                  ...msg, 
                  agentType: 'executor' as AgentType, 
                  ...(action !== undefined && { action: action as AgentAction })
                }
              : msg
          )
        )

        // 检查是否有工具调用
        if (response.toolCalls && response.toolCalls.length > 0) {
          const toolNames = response.toolCalls.map(tc => tc.function?.name).filter(Boolean)
          console.log(`[Agent] Executor 正在调用工具: ${toolNames.join(', ')}`)
          // 仅执行工具调用，不继续调用 AI
          const toolResults = await executeToolCallsOnly(
            response.toolCalls,
            mcpServers,
            currentResourceId,
            currentTaskId,
            chatId,
            updateMessages,
          )

          // 更新消息历史
          currentMessages = [
            ...currentMessages,
            {
              id: `executor-user-${todo.id}-${executorRound}`,
              role: 'user',
              content: executorRound === 1
                ? `请执行以下任务：\n\n任务ID: ${todo.id}\n任务描述: ${todo.description}`
                : '请继续完成当前任务。',
              timestamp: new Date(),
            },
            {
              id: assistantMessageId,
              role: 'assistant',
              content: response.content,
              timestamp: new Date(),
              tool_calls: response.toolCalls,
              agentType: 'executor',
            },
            ...toolResults,
          ]

          // 工具调用后，继续下一轮循环，检查任务是否完成
        } else {
          // 没有工具调用，检查任务是否完成
          const completionKeywords = ['任务完成', '已完成', '完成', '任务执行完成']
          const contentLower = response.content.toLowerCase()
          todoCompleted = completionKeywords.some((keyword) => contentLower.includes(keyword.toLowerCase()))

          if (todoCompleted) {
            todo.status = 'completed'
            todo.result = response.content
            console.log(`[Agent] Executor 任务完成: ${todo.id} - ${todo.description}`)
          } else {
            console.log(`[Agent] Executor 继续执行任务: ${todo.id} (第 ${executorRound} 轮完成，继续下一轮)`)
          }

          currentMessages = [
            ...currentMessages,
            {
              id: `executor-user-${todo.id}-${executorRound}`,
              role: 'user',
              content: executorRound === 1
                ? `请执行以下任务：\n\n任务ID: ${todo.id}\n任务描述: ${todo.description}`
                : '请继续完成当前任务。',
              timestamp: new Date(),
            },
            {
              id: assistantMessageId,
              role: 'assistant',
              content: response.content,
              timestamp: new Date(),
              agentType: 'executor',
            },
          ]
        }
      } catch (error) {
        console.error(`[Agent] Executor 任务执行失败: ${todo.id}`, error)
        if (isStoppedRef.current) {
          return
        }
        todo.status = 'failed'
        throw error
      }
    }

    if (isStoppedRef.current) {
      return
    }
  }

  console.log(`[Agent] 所有任务执行完成，共 ${sortedTodos.length} 个任务`)

  // ========== Verifier 验证 ==========
  if (isStoppedRef.current) {
    return
  }

  console.log(`[Agent] Verifier 开始验证任务完成情况，共 ${todos.length} 个任务`)

  const todosSummary = todos
    .map((todo) => `- ${todo.id}: ${todo.description} (状态: ${todo.status}${todo.result ? `, 结果: ${todo.result.substring(0, 100)}...` : ''})`)
    .join('\n')

  const verifierMessages: AIMessage[] = [
    ...currentMessages,
    {
      id: 'verifier-user',
      role: 'user',
      content: `请验证以下任务的完成情况：\n\n${todosSummary}\n\n请为每个任务打分（0-100分），80分以上算完成。`,
      timestamp: new Date(),
    },
  ]

  const eventId = generateEventId()
  const assistantMessageId = 'verifier-msg'

  try {
    const response = await callAIAndWait(
      configId,
      verifierMessages,
      systemMessage,
      verifierPrompt,
      null, // verifier 不使用工具
      eventId,
      chatId,
      assistantMessageId,
      updateMessages,
      isStoppedRef.current ? isStoppedRef : { current: false },
    )

    // 更新消息的 agentType 和 action
    updateMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessageId
          ? { ...msg, agentType: 'verifier' as AgentType, action: 'verifying' as AgentAction }
          : msg
      )
    )

    // 解析 verifier 响应
    const verifierResponse = parseVerifierResponse(response.content)

    if (verifierResponse) {
      const completedCount = verifierResponse.tasks.filter(t => t.completed).length
      console.log(`[Agent] Verifier 验证完成: ${completedCount}/${verifierResponse.tasks.length} 个任务已完成`)
    }

    // 如果所有任务都完成，调用 planner 总结
    if (verifierResponse?.allCompleted) {
      console.log(`[Agent] Planner 开始总结用户问题`)
      const summaryMessages: AIMessage[] = [
        ...currentMessages,
        {
          id: 'verifier-user',
          role: 'user',
          content: `请验证以下任务的完成情况：\n\n${todosSummary}`,
          timestamp: new Date(),
        },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          agentType: 'verifier',
        },
        {
          id: 'planner-summary-user',
          role: 'user',
          content: `所有任务已完成验收。请总结用户问题的完成情况。\n\n用户原始问题：${userMessage}\n\n请基于任务执行结果，总结用户问题的完成情况，包括：\n1. 用户问题的核心内容\n2. 问题是否已解决\n3. 获得的结果或答案\n4. 如果有未完全解决的问题，说明原因\n\n注意：只总结用户问题的完成情况，不要总结执行流程或工作流程。`,
          timestamp: new Date(),
        },
      ]

      const summaryEventId = generateEventId()
      const summaryAssistantMessageId = 'planner-summary-msg'

      await callAIAndWait(
        configId,
        summaryMessages,
        systemMessage,
        plannerPrompt,
        null,
        summaryEventId,
        chatId,
        summaryAssistantMessageId,
        updateMessages,
        isStoppedRef.current ? isStoppedRef : { current: false },
      )

      // 更新消息的 agentType 和 action（总结阶段）
      updateMessages((prev) =>
        prev.map((msg) =>
          msg.id === summaryAssistantMessageId
            ? { ...msg, agentType: 'planner' as AgentType, action: 'summarizing' as AgentAction }
            : msg
        )
      )

      console.log(`[Agent] Planner 总结完成`)
    }
  } catch (error) {
    console.error('[Agent] Verifier 调用失败:', error)
    if (isStoppedRef.current) {
      return
    }
    throw error
  }
}
