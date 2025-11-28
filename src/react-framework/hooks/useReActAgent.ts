/**
 * ReAct Framework Hook
 */

import { useState, useRef, useCallback } from 'react'
import { ReActWorkflowEngine } from '../workflow/ReActWorkflowEngine'
import { TauriReActBackend } from '../adapters/TauriReActBackend'
import { TauriToolInfoProvider } from '../adapters/TauriToolInfoProvider'
import { ReActPromptManager } from '../prompts/PromptManager'
import { ReActPhase, AIMessage } from '../core/types'
import { ToolCall } from '../core/types'
import { MCPServerInfo } from '../../models'

interface UseReActAgentOptions {
  selectedConfigId: string
  currentChatId: string | undefined
  currentResourceId: string | null
  currentTaskId: string | null
  messagesRef: React.MutableRefObject<AIMessage[]>
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void
  mcpServers: MCPServerInfo[]
}

export function useReActAgent({
  selectedConfigId,
  currentChatId,
  currentResourceId,
  currentTaskId,
  messagesRef,
  updateMessages,
  mcpServers,
}: UseReActAgentOptions) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<ReActPhase>('idle')
  const [currentIteration, setCurrentIteration] = useState(0)
  const [currentStreamEventId, setCurrentStreamEventId] = useState<string | null>(null)
  const engineRef = useRef<ReActWorkflowEngine | null>(null)

  // 创建或获取工作流引擎
  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      const backend = new TauriReActBackend()
      const toolProvider = new TauriToolInfoProvider(mcpServers)
      const promptManager = new ReActPromptManager()
      engineRef.current = new ReActWorkflowEngine(
        backend,
        toolProvider,
        promptManager,
      )
    }
    return engineRef.current
  }, [mcpServers])

  // 启动 ReAct Agent
  const startReActAgent = useCallback(
    async (chatId: string) => {
      setIsStreaming(true)
      setCurrentPhase('idle')
      setCurrentIteration(0)

      const engine = getEngine()

      // 包装 updateMessages 以同步 messagesRef
      const wrappedUpdateMessages = (
        updater: (prev: AIMessage[]) => AIMessage[],
      ) => {
        updateMessages(updater)
        // 同步到 ref
        messagesRef.current = updater(messagesRef.current)
      }

      await engine.run(
        {
          configId: selectedConfigId,
          chatId,
          initialMessages: messagesRef.current,
          currentResourceId,
          currentTaskId,
          maxIterations: 10,
        },
        {
          onMessageUpdate: wrappedUpdateMessages,
          onPhaseChange: (phase) => {
            setCurrentPhase(phase)
          },
          onIterationChange: (iteration) => {
            setCurrentIteration(iteration)
          },
          onLog: (msg) => {
            console.log(msg)
          },
          onError: (err) => {
            console.error('[ReAct] 错误:', err)
          },
        },
      )

      setIsStreaming(false)
      setCurrentPhase('idle')
      setCurrentIteration(0)
    },
    [
      selectedConfigId,
      currentResourceId,
      currentTaskId,
      messagesRef,
      updateMessages,
      getEngine,
    ],
  )

  // 停止 ReAct Agent
  const stopReActAgent = useCallback(async () => {
    if (engineRef.current) {
      engineRef.current.stop()
    }
    setIsStreaming(false)
    setCurrentPhase('idle')
    setCurrentIteration(0)
    setCurrentStreamEventId(null)
  }, [])

  // 手动确认工具调用后继续执行
  const continueAfterToolConfirm = useCallback(
    async (toolCalls: ToolCall[], chatId: string) => {
      setIsStreaming(true)

      const engine = getEngine()

      // 包装 updateMessages 以同步 messagesRef
      const wrappedUpdateMessages = (
        updater: (prev: AIMessage[]) => AIMessage[],
      ) => {
        updateMessages(updater)
        // 同步到 ref
        messagesRef.current = updater(messagesRef.current)
      }

      await engine.continueAfterToolConfirm(
        toolCalls,
        {
          configId: selectedConfigId,
          chatId,
          initialMessages: messagesRef.current,
          currentResourceId,
          currentTaskId,
          maxIterations: 10,
        },
        {
          onMessageUpdate: wrappedUpdateMessages,
          onPhaseChange: (phase) => {
            setCurrentPhase(phase)
          },
          onIterationChange: (iteration) => {
            setCurrentIteration(iteration)
          },
          onLog: (msg) => {
            console.log(msg)
          },
          onError: (err) => {
            console.error('[ReAct] 错误:', err)
          },
        },
      )

      setIsStreaming(false)
      setCurrentPhase('idle')
      setCurrentIteration(0)
    },
    [
      selectedConfigId,
      currentResourceId,
      currentTaskId,
      messagesRef,
      updateMessages,
      getEngine,
    ],
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

