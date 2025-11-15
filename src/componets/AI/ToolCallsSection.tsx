import React from 'react'
import { HiChevronRight } from 'react-icons/hi2'
import { ToolCall } from './ToolCallConfirmModal'

interface ToolCallsSectionProps {
  toolCalls: ToolCall[]
  variant: 'pending' | 'completed'
  onViewToolCall: (toolCall: ToolCall) => void
  onConfirm?: () => void
  onCancel?: () => void
}

export const ToolCallsSection: React.FC<ToolCallsSectionProps> = ({
  toolCalls,
  variant,
  onViewToolCall,
  onConfirm,
  onCancel,
}) => {
  const bgColor = variant === 'pending' ? 'bg-warning/10' : 'bg-info/10'
  const borderColor = variant === 'pending' ? 'border-warning/20' : 'border-info/20'
  const labelColor = variant === 'pending' ? 'text-warning' : 'text-info'
  const labelText = variant === 'pending' ? '工具调用' : '工具调用'

  return (
    <div className={`mt-3 p-3 ${bgColor} rounded-lg border ${borderColor}`}>
      <div className="space-y-1 mb-3">
        {toolCalls.map((toolCall, index) => {
          return (
            <button
              key={index}
              className="w-full flex items-center justify-between bg-base-100 cursor-pointer rounded p-2 hover:bg-base-200 transition-colors text-left"
              onClick={() => onViewToolCall(toolCall)}
            >
              <span className="font-medium text-sm text-base-content space-x-2">
                <span className={labelColor}>{labelText}</span>
                <span className="text-base-content">{toolCall.function.name}</span>
              </span>
              <HiChevronRight className="h-4 w-4 text-base-content/50 flex-shrink-0" />
            </button>
          )
        })}
      </div>
      {variant === 'pending' && onConfirm && onCancel && (
        <div className="flex gap-2">
          <button className="btn btn-sm btn-primary" onClick={onConfirm}>
            确认执行
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      )}
    </div>
  )
}

