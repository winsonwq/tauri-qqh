import React, { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToolCall } from './ToolCallConfirmModal'
import ToolResultDisplay, { parseToolResultContent } from './ToolResultDisplay'
import { markdownComponents } from './MarkdownComponents'
import { AIMessage } from '../../utils/aiMessageUtils'
import { formatDateTime } from '../../utils/format'
import { ReasoningSection } from './ReasoningSection'
import { ToolCallsSection } from './ToolCallsSection'
import { ToolCallDetailModal } from './ToolCallDetailModal'
import { PlannerResponse, Todo, AgentAction } from '../../agents/agentTypes'
import { ComponentRenderer } from './ComponentRegistry'
import { parsePartialJson } from '../../utils/partialJsonParser'
import { AgentActionLabel } from './AgentActionLabel'

interface MessageItemProps {
  message: AIMessage
  isSticky: boolean
  onRef: (element: HTMLDivElement | null) => void
  onToolCallConfirm?: (toolCalls: ToolCall[]) => void
  onToolCallCancel?: (messageId: string) => void
  isStreaming?: boolean
  isLastAssistantMessage?: boolean
  messages?: AIMessage[] // 消息历史，用于查找 planner 的 todos
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

// 推断消息的行为类型
const inferMessageAction = (message: AIMessage): AgentAction | undefined => {
  // 如果消息已经有 action 字段，直接使用
  if (message.action) {
    return message.action
  }

  // 如果没有 action，根据消息状态推断
  if (message.role !== 'assistant') {
    return undefined
  }

  // 优先级：pendingToolCalls > reasoning > agentType > tool_calls
  if (message.pendingToolCalls && message.pendingToolCalls.length > 0) {
    return 'calling_tool'
  }

  // 只在 reasoning 有实际内容时返回 thinking
  if (message.reasoning && message.reasoning.trim().length > 0) {
    return 'thinking'
  }

  if (message.agentType === 'planner') {
    // 检查是否是总结消息（通过消息 ID 或内容判断）
    if (
      message.id === 'planner-summary-msg' ||
      !message.content.match(/\{[\s\S]*"todos"/)
    ) {
      return 'summarizing'
    }
    return 'planning'
  }

  if (message.agentType === 'executor') {
    if (message.tool_calls && message.tool_calls.length > 0) {
      return 'calling_tool'
    }
    return 'thinking'
  }

  if (message.agentType === 'verifier') {
    return 'verifying'
  }

  return undefined
}

// 从消息历史中查找 planner 的 todos
const findPlannerTodos = (messages: AIMessage[] = []): Todo[] => {
  // 从后往前查找最近的 planner 消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (
      msg.role === 'assistant' &&
      msg.agentType === 'planner' &&
      msg.content
    ) {
      const parsed = parsePartialJson<PlannerResponse>(msg.content)
      if (parsed?.data?.todos && Array.isArray(parsed.data.todos)) {
        return parsed.data.todos
      }
    }
  }
  return []
}

// 渲染消息内容
const renderMessageContent = (
  content: string,
  showCursor?: boolean,
  messages?: AIMessage[],
  parsed?: ReturnType<
    typeof parsePartialJson<{ type?: string; component?: string }>
  >,
  agentType?: string,
) => {
  // 检查是否有 JSON 结构（通过检查内容是否包含 JSON 特征来判断）
  const hasJsonStructure = content.trim().match(/\{[\s\S]*\}/) !== null

  // 确定要使用的组件
  let component: string | null = null
  if (parsed?.data?.type === 'component' && parsed.data.component) {
    component = parsed.data.component
  } else if (hasJsonStructure && agentType) {
    // 如果 JSON 不完整，但可以根据 agentType 推断组件类型
    const componentMap: Record<string, string> = {
      planner: 'planner-response',
      executor: 'executor-response',
      verifier: 'verifier-response',
    }
    component = componentMap[agentType] || null
  }

  // 如果有组件类型，尝试使用组件渲染
  if (component) {
    // 准备组件 props
    const props: any = { content }

    // Verifier 需要 planner 的 todos
    if (component === 'verifier-response' && messages) {
      const plannerTodos = findPlannerTodos(messages)
      if (plannerTodos.length > 0) {
        props.config = { plannerTodos }
      }
    }

    // 使用一个包装组件来检查渲染结果
    // 如果组件返回 null，但 JSON 结构存在，说明 JSON 不完整，应该显示部分内容
    return (
      <div className="text-sm prose prose-sm max-w-none text-base-content break-words">
        <ComponentRendererWrapper
          component={component}
          props={props}
          hasJsonStructure={hasJsonStructure}
          rawContent={content}
        />
        {showCursor && <span className="ai-cursor" />}
      </div>
    )
  }

  // 如果没有 component 类型，但有 JSON 结构，可能是 JSON 不完整
  // 这种情况下，不显示原始 JSON，而是等待更多内容
  if (hasJsonStructure && !parsed?.isValid) {
    // JSON 不完整，但不显示原始内容，等待组件解析
    return null
  }

  // 如果没有 JSON 结构，使用 markdown 渲染
  return (
    <div className="text-sm prose prose-sm max-w-none text-base-content break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
      {showCursor && <span className="ai-cursor" />}
    </div>
  )
}

// 包装组件，用于检查组件渲染结果
const ComponentRendererWrapper: React.FC<{
  component: string
  props: any
  hasJsonStructure: boolean
  rawContent: string
}> = ({ component, props, hasJsonStructure }) => {
  const rendered = <ComponentRenderer component={component} props={props} />
  
  // 如果组件返回 null 或 undefined，但 JSON 结构存在，说明 JSON 不完整
  // 这种情况下，不显示原始 JSON，也不显示等待提示，直接返回 null
  // 组件会在有数据时自动显示
  if (!rendered && hasJsonStructure) {
    return null
  }
  
  return rendered
}

// 渲染时间戳
const renderTimestamp = (timestamp: Date) => {
  return (
    <div className="text-xs text-base-content/40">
      <span>{formatDateTime(timestamp)}</span>
    </div>
  )
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isSticky,
  onRef,
  onToolCallConfirm,
  onToolCallCancel,
  isStreaming,
  isLastAssistantMessage,
  messages,
}) => {
  const [viewingToolCall, setViewingToolCall] = useState<ToolCall | null>(null)

  // 判断是否应该显示光标：是最后一个 assistant 消息，正在流式输出，且不是 tool 消息
  const shouldShowCursor =
    message.role === 'assistant' && isLastAssistantMessage && isStreaming

  // 推断消息的行为类型
  const messageAction = inferMessageAction(message)

  // 判断行为是否正在进行中
  const isActionActive =
    message.role === 'assistant' &&
    isLastAssistantMessage &&
    isStreaming &&
    !!messageAction

  // 使用 useMemo 缓存 JSON 解析结果
  const parsedContent = useMemo(() => {
    if (!message.content) return null
    return parsePartialJson<{ type?: string; component?: string }>(
      message.content,
    )
  }, [message.content])

  return (
    <div
      ref={onRef}
      data-message-id={message.id}
      className={getMessageContainerClasses(message.role, isSticky)}
      style={isSticky ? { top: 0 } : undefined}
    >
      <div className={getMessageContentClasses(message.role)}>
        {/* 显示 reasoning/thinking 内容（只在有实际内容时显示） */}
        {message.reasoning && message.reasoning.trim().length > 0 && (
          <ReasoningSection reasoning={message.reasoning} />
        )}

        {/* 显示主要内容 */}
        {message.content &&
          (message.role === 'tool' ? (
            <div className="mt-2">
              {message.name && (
                <div className="text-xs font-semibold text-base-content/70 mb-2">
                  工具: {message.name}
                </div>
              )}
              <div className="bg-base-200 rounded-lg p-3 border border-base-300">
                <ToolResultDisplay
                  items={parseToolResultContent(message.content)}
                />
              </div>
            </div>
          ) : (
            renderMessageContent(
              message.content,
              shouldShowCursor,
              messages,
              parsedContent || undefined,
              message.agentType,
            )
          ))}
        {/* 如果没有内容但正在流式输出，也显示光标 */}
        {!message.content && shouldShowCursor && (
          <div className="text-sm prose prose-sm max-w-none text-base-content break-words">
            <span className="ai-cursor" />
          </div>
        )}

        {/* 显示待确认的工具调用 */}
        {message.pendingToolCalls && message.pendingToolCalls.length > 0 && (
          <ToolCallsSection
            toolCalls={message.pendingToolCalls}
            variant="pending"
            onViewToolCall={setViewingToolCall}
            onConfirm={() => onToolCallConfirm?.(message.pendingToolCalls!)}
            onCancel={() => onToolCallCancel?.(message.id)}
          />
        )}

        {/* 显示已完成的工具调用 */}
        {message.tool_calls &&
          message.tool_calls.length > 0 &&
          !message.pendingToolCalls && (
            <ToolCallsSection
              toolCalls={message.tool_calls}
              variant="completed"
              onViewToolCall={setViewingToolCall}
            />
          )}

        {/* 工具调用详情 Modal */}
        <ToolCallDetailModal
          toolCall={viewingToolCall}
          onClose={() => setViewingToolCall(null)}
        />

        {/* 行为标签和时间戳放在同一行 */}
        <div className="flex items-center gap-2 mt-2">
          {message.role === 'assistant' && messageAction && (
            <AgentActionLabel
              action={messageAction}
              isActive={!!isActionActive}
            />
          )}
          {renderTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  )
}
