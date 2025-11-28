/**
 * ReAct Framework 工作流引擎
 */

import { IReActBackend, IToolInfoProvider } from '../core/interfaces'
import { AIMessage, AICallResult, AgentMeta, ReActPhase } from '../core/types'
import { ToolCall } from '../core/types'
import { ReActPromptManager } from '../prompts/PromptManager'
import { parseAgentMeta, removeAgentMeta } from '../utils/parser'

export interface ReActWorkflowOptions {
  configId: string
  chatId: string
  initialMessages?: AIMessage[]
  currentResourceId?: string | null
  currentTaskId?: string | null
  maxIterations?: number
}

export interface ReActWorkflowEvents {
  onMessageUpdate: (updater: (prev: AIMessage[]) => AIMessage[]) => void
  onPhaseChange?: (phase: ReActPhase) => void
  onIterationChange?: (iteration: number) => void
  onLog?: (message: string) => void
  onError?: (error: Error) => void
}

export class ReActWorkflowEngine {
  private backend: IReActBackend
  private toolProvider: IToolInfoProvider
  private promptManager: ReActPromptManager
  private isStopped: boolean = false
  private currentStreamEventId: string | null = null
  private cleanupListeners: (() => void)[] = []

  constructor(
    backend: IReActBackend,
    toolProvider: IToolInfoProvider,
    promptManager?: ReActPromptManager,
  ) {
    this.backend = backend
    this.toolProvider = toolProvider
    this.promptManager = promptManager || new ReActPromptManager()
  }

  /**
   * 停止工作流
   */
  stop() {
    this.isStopped = true
    if (this.currentStreamEventId) {
      this.backend.stopStream(this.currentStreamEventId).catch(console.error)
    }
    // 清理所有监听器
    this.cleanupListeners.forEach((cleanup) => cleanup())
    this.cleanupListeners = []
  }

  /**
   * 执行 AI 调用
   */
  private async executeAICall(
    configId: string,
    chatId: string,
    messages: AIMessage[],
    systemMessage: string,
    includeTools: boolean,
    eventId: string,
    assistantMessageId: string,
    updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
  ): Promise<AICallResult> {
    return new Promise(async (resolve, reject) => {
      let finalContent = ''
      let finalToolCalls: ToolCall[] | undefined
      let finalReasoning = ''

      try {
        // 在开始流式输出之前，先创建空的 assistant 消息
        updateMessages((prev) => {
          // 检查消息是否已存在
          const exists = prev.some((msg) => msg.id === assistantMessageId)
          if (exists) {
            return prev
          }
          // 创建新的 assistant 消息
          return [
            ...prev,
            {
              id: assistantMessageId,
              role: 'assistant' as const,
              content: '',
              timestamp: new Date(),
            },
          ]
        })

        const cleanup = await this.backend.listenToStream(eventId, {
          onContent: (content) => {
            finalContent += content
            updateMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: (msg.content || '') + content }
                  : msg,
              ),
            )
          },
          onToolCalls: (toolCalls) => {
            finalToolCalls = toolCalls
            updateMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, tool_calls: toolCalls }
                  : msg,
              ),
            )
          },
          onReasoning: (content) => {
            finalReasoning += content
            updateMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, reasoning: (msg.reasoning || '') + content }
                  : msg,
              ),
            )
          },
          onDone: () => {
            const hasValidReasoning = finalReasoning.trim().length > 0
            if (finalContent || finalToolCalls || hasValidReasoning) {
              const msgToSave: AIMessage = {
                id: assistantMessageId,
                role: 'assistant',
                content: finalContent,
                timestamp: new Date(),
                tool_calls: finalToolCalls,
                reasoning: hasValidReasoning ? finalReasoning : undefined,
              }
              this.backend
                .saveMessage(msgToSave, chatId)
                .catch(console.error)
            }
            resolve({
              content: finalContent,
              toolCalls: finalToolCalls,
              reasoning: hasValidReasoning ? finalReasoning : undefined,
            })
          },
          onError: (err) => {
            reject(err)
          },
        })

        this.cleanupListeners.push(cleanup)

        // 获取完整的工具列表（包含 inputSchema）
        // TauriToolInfoProvider 实现了 getFullToolList 方法
        const toolProviderWithFullList = this.toolProvider as any
        const tools = includeTools
          ? (toolProviderWithFullList.getFullToolList?.() || [])
          : []

        await this.backend.chatCompletion({
          configId,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          systemMessage,
          eventId,
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(
    toolCall: ToolCall,
    currentResourceId?: string | null,
    currentTaskId?: string | null,
  ): Promise<string> {
    const server = this.toolProvider.findToolServer(toolCall.function.name)
    if (!server) {
      throw new Error(
        `找不到工具 ${toolCall.function.name} 对应的服务器`,
      )
    }

    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(toolCall.function.arguments)
    } catch {
      args = {}
    }

    const result = await this.backend.executeTool(
      server.key || server.name,
      toolCall.function.name,
      args,
      {
        currentResourceId: currentResourceId || null,
        currentTaskId: currentTaskId || null,
      },
    )

    return JSON.stringify(result)
  }

  /**
   * 执行思考阶段
   */
  private async executeThought(
    configId: string,
    chatId: string,
    messages: AIMessage[],
    currentResourceId?: string | null,
    currentTaskId?: string | null,
    updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
  ): Promise<AgentMeta | null> {
    const toolInfoList = this.toolProvider.getToolInfoList()
    const systemMessage = this.promptManager.getThoughtPrompt(
      currentResourceId,
      currentTaskId,
      toolInfoList,
    )

    const eventId = `react-thought-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const assistantMessageId = `thought-${Date.now()}`
    this.currentStreamEventId = eventId

    // 思考阶段不传工具，让 AI 只做分析决策
    const result = await this.executeAICall(
      configId,
      chatId,
      messages,
      systemMessage,
      false,
      eventId,
      assistantMessageId,
      updateMessages,
    )

    const meta = parseAgentMeta(result.content)

    // 如果不需要继续，从消息内容中移除 agent_meta 标签
    if (meta && !meta.shouldContinue) {
      const cleanedContent = removeAgentMeta(result.content)
      let finalContent = cleanedContent
      if (!finalContent || finalContent.trim().length === 0) {
        console.warn(
          '[ReAct] 清理后内容为空，AI 只输出了 agent_meta 标签，没有输出实际内容',
        )
        // 尝试使用 reasoning 字段作为内容
        if (result.reasoning && result.reasoning.trim().length > 0) {
          finalContent = result.reasoning.trim()
          console.log('[ReAct] 使用 reasoning 字段作为内容')
        } else if (meta.reason && meta.reason.trim().length > 0) {
          // 如果没有 reasoning，使用 meta.reason 作为临时内容
          finalContent = meta.reason.trim()
          console.log('[ReAct] 使用 meta.reason 作为临时内容')
        } else {
          // 如果都没有，使用友好的提示信息
          finalContent = '抱歉，AI 未能生成完整的回答内容。请尝试重新提问。'
          console.warn('[ReAct] 无法找到替代内容，使用默认提示')
        }
      }

      // 更新消息内容，移除 agent_meta 标签
      updateMessages((prev) => {
        let lastAssistantIndex = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant') {
            lastAssistantIndex = i
            break
          }
        }
        if (lastAssistantIndex >= 0) {
          const updated = [...prev]
          updated[lastAssistantIndex] = {
            ...updated[lastAssistantIndex],
            content: finalContent,
          }
          return updated
        }
        return prev
      })

      // 更新数据库中的消息内容
      const lastAssistantMsg = messages
        .slice()
        .reverse()
        .find((msg) => msg.role === 'assistant')
      if (lastAssistantMsg) {
        await this.backend
          .saveMessage(
            {
              ...lastAssistantMsg,
              content: finalContent,
            },
            chatId,
          )
          .catch((err) => {
            console.error('更新思考消息失败:', err)
          })
      }
    }

    return meta
  }

  /**
   * 执行行动阶段
   */
  private async executeAction(
    configId: string,
    chatId: string,
    messages: AIMessage[],
    currentResourceId?: string | null,
    currentTaskId?: string | null,
    updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
  ): Promise<AICallResult> {
    const toolInfoList = this.toolProvider.getToolInfoList()
    console.log(
      `[ReAct] 行动阶段 - 可用工具数量: ${toolInfoList.length}`,
      toolInfoList.map((t) => t.name),
    )
    const systemMessage = this.promptManager.getActionPrompt(
      currentResourceId,
      currentTaskId,
      toolInfoList,
    )

    const eventId = `react-action-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const assistantMessageId = `action-${Date.now()}`
    this.currentStreamEventId = eventId

    // 总是传入工具列表，让 AI 自己判断是否需要调用工具
    const result = await this.executeAICall(
      configId,
      chatId,
      messages,
      systemMessage,
      toolInfoList.length > 0,
      eventId,
      assistantMessageId,
      updateMessages,
    )

    console.log(
      `[ReAct] 行动阶段完成 - content: "${result.content?.substring(0, 100)}", toolCalls: ${result.toolCalls?.length || 0}`,
    )

    return result
  }

  /**
   * 执行观察阶段
   */
  private async executeObservation(
    configId: string,
    chatId: string,
    messages: AIMessage[],
    currentResourceId?: string | null,
    currentTaskId?: string | null,
    updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
  ): Promise<string> {
    const systemMessage = this.promptManager.getObservationPrompt(
      currentResourceId,
      currentTaskId,
    )

    const eventId = `react-observation-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const assistantMessageId = `observation-${Date.now()}`
    this.currentStreamEventId = eventId

    const result = await this.executeAICall(
      configId,
      chatId,
      messages,
      systemMessage,
      false,
      eventId,
      assistantMessageId,
      updateMessages,
    )

    return result.content
  }

  /**
   * 运行 ReAct 工作流
   */
  async run(
    options: ReActWorkflowOptions,
    events: ReActWorkflowEvents,
  ): Promise<void> {
    this.isStopped = false
    const {
      configId,
      chatId,
      initialMessages = [],
      currentResourceId,
      currentTaskId,
      maxIterations = 10,
    } = options

    let currentMessages = [...initialMessages]
    const updateMessages = (updater: (prev: AIMessage[]) => AIMessage[]) => {
      currentMessages = updater(currentMessages)
      // 传递 updater 函数给 onMessageUpdate，而不是数组
      // 这样 wrappedUpdateMessages 可以正确处理
      events.onMessageUpdate(updater)
    }

    const log = (msg: string) => events.onLog?.(msg)

    let iteration = 0

    while (iteration < maxIterations && !this.isStopped) {
      iteration++
      events.onIterationChange?.(iteration)
      log(`[ReAct] ========== 第 ${iteration} 轮迭代 ==========`)

      try {
        // 阶段1: 思考
        events.onPhaseChange?.('thought')
        const thoughtMeta = await this.executeThought(
          configId,
          chatId,
          currentMessages,
          currentResourceId,
          currentTaskId,
          updateMessages,
        )

        if (!thoughtMeta) {
          log('[ReAct] 思考阶段未返回有效 meta，结束循环')
          break
        }

        log(`[ReAct] 思考决定: ${JSON.stringify(thoughtMeta)}`)

        // 检查是否结束
        if (!thoughtMeta.shouldContinue) {
          log('[ReAct] 思考决定结束循环（回答已在思考中输出）')
          break
        }

        // 阶段2: 行动
        events.onPhaseChange?.('action')
        const actionResult = await this.executeAction(
          configId,
          chatId,
          currentMessages,
          currentResourceId,
          currentTaskId,
          updateMessages,
        )

        log(
          `[ReAct] 行动结果 - content长度: ${actionResult.content?.length || 0}, toolCalls: ${actionResult.toolCalls?.length || 0}`,
        )

        // 检查是否有工具调用
        if (actionResult.toolCalls && actionResult.toolCalls.length > 0) {
          // 检查是否需要用户确认
          const allAutoConfirmable = this.toolProvider.areAllToolsAutoConfirmable(
            actionResult.toolCalls,
          )

          if (!allAutoConfirmable) {
            // 非自动确认工具需要用户确认，暂停循环
            log('[ReAct] 工具需要用户确认，暂停循环')
            const lastAssistantMsg = currentMessages
              .slice()
              .reverse()
              .find((m: AIMessage) => m.role === 'assistant' && m.tool_calls)
            if (lastAssistantMsg) {
              updateMessages((prev) =>
                prev.map((msg) =>
                  msg.id === lastAssistantMsg.id
                    ? { ...msg, pendingToolCalls: actionResult.toolCalls }
                    : msg,
                ),
              )
            }
            break
          }

          // 执行工具调用
          log('[ReAct] 执行工具调用')
          for (const toolCall of actionResult.toolCalls) {
            try {
              const toolResult = await this.executeToolCall(
                toolCall,
                currentResourceId,
                currentTaskId,
              )

              // 添加工具结果消息
              const toolMessage: AIMessage = {
                id: `${Date.now()}-${Math.random()}`,
                role: 'tool',
                content: toolResult,
                timestamp: new Date(),
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
              }
              updateMessages((prev) => [...prev, toolMessage])

              // 保存工具结果到数据库
              await this.backend.saveMessage(toolMessage, chatId)
            } catch (err) {
              console.error('工具调用失败:', err)
              events.onError?.(err as Error)
            }
          }

          // 阶段3: 观察
          events.onPhaseChange?.('observation')
          log('[ReAct] 开始执行观察阶段')
          try {
            await this.executeObservation(
              configId,
              chatId,
              currentMessages,
              currentResourceId,
              currentTaskId,
              updateMessages,
            )
            log('[ReAct] 观察阶段完成，准备进入下一轮')
          } catch (obsErr) {
            console.error('[ReAct] 观察阶段出错:', obsErr)
            events.onError?.(obsErr as Error)
          }

          // 继续下一轮循环
          continue
        }

        // 没有工具调用，说明是 answer 或 analyze，检查是否结束
        log('[ReAct] 行动完成，无工具调用')
        break
      } catch (err) {
        if ((err as Error).message === '用户停止' || this.isStopped) {
          log('[ReAct] 用户停止循环')
        } else {
          console.error('[ReAct] 执行出错:', err)
          events.onError?.(err as Error)
        }
        break
      }
    }

    if (iteration >= maxIterations) {
      log('[ReAct] 达到最大迭代次数限制')
    }

    events.onPhaseChange?.('idle')
    this.currentStreamEventId = null
  }

  /**
   * 继续执行（在工具确认后）
   */
  async continueAfterToolConfirm(
    toolCalls: ToolCall[],
    options: ReActWorkflowOptions,
    events: ReActWorkflowEvents,
  ): Promise<void> {
    const { chatId, currentResourceId, currentTaskId } = options

    let currentMessages = [...(options.initialMessages || [])]

    // 执行工具调用
    for (const toolCall of toolCalls) {
      try {
        const toolResult = await this.executeToolCall(
          toolCall,
          currentResourceId,
          currentTaskId,
        )

        const toolMessage: AIMessage = {
          id: `${Date.now()}-${Math.random()}`,
          role: 'tool',
          content: toolResult,
          timestamp: new Date(),
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        }

        currentMessages = [...currentMessages, toolMessage]
        events.onMessageUpdate((prev) => [...prev, toolMessage])

        await this.backend.saveMessage(toolMessage, chatId)
      } catch (err) {
        console.error('工具调用失败:', err)
        events.onError?.(err as Error)
      }
    }

    // 继续 ReAct 循环，使用更新后的消息列表
    await this.run(
      {
        ...options,
        initialMessages: currentMessages,
      },
      events,
    )
  }
}

