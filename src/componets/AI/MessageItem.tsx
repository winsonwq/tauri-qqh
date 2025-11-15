import React, { useState } from 'react'
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

interface MessageItemProps {
  message: AIMessage
  isSticky: boolean
  onRef: (element: HTMLDivElement | null) => void
  onToolCallConfirm?: (toolCalls: ToolCall[]) => void
  onToolCallCancel?: (messageId: string) => void
  isStreaming?: boolean
  isLastAssistantMessage?: boolean
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

// 渲染消息内容
const renderMessageContent = (content: string, showCursor?: boolean) => {
  return (
    <div className="text-sm prose prose-sm max-w-none text-base-content break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
      {showCursor && <span className="ai-cursor" />}
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

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isSticky,
  onRef,
  onToolCallConfirm,
  onToolCallCancel,
  isStreaming,
  isLastAssistantMessage,
}) => {
  const [viewingToolCall, setViewingToolCall] = useState<ToolCall | null>(null)

  // 判断是否应该显示光标：是最后一个 assistant 消息，正在流式输出，且不是 tool 消息
  const shouldShowCursor =
    message.role === 'assistant' && isLastAssistantMessage && isStreaming

  return (
    <div
      ref={onRef}
      data-message-id={message.id}
      className={getMessageContainerClasses(message.role, isSticky)}
      style={isSticky ? { top: 0 } : undefined}
    >
      <div className={getMessageContentClasses(message.role)}>
        {/* 显示 reasoning/thinking 内容 */}
        {message.reasoning && <ReasoningSection reasoning={message.reasoning} />}

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
                <ToolResultDisplay items={parseToolResultContent(message.content)} />
              </div>
            </div>
          ) : (
            renderMessageContent(message.content, shouldShowCursor)
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

        {renderTimestamp(message.timestamp)}
      </div>
    </div>
  )
}

