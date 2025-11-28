import React from 'react'
import { ToolCall } from './ToolCallConfirmModal'

interface ToolCallDetailModalProps {
  toolCall: ToolCall | null
  onClose: () => void
}

export const ToolCallDetailModal: React.FC<ToolCallDetailModalProps> = ({
  toolCall,
  onClose,
}) => {
  if (!toolCall) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">工具调用详情</h3>
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-base-content/70 mb-1">工具名称</div>
            <div className="text-sm font-medium">{toolCall.function.name}</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-base-content/70 mb-1">参数</div>
            <div className="bg-base-200 rounded-lg p-3">
              <pre className="text-xs text-base-content/80 whitespace-pre-wrap break-words">
                {(() => {
                  try {
                    const args = JSON.parse(toolCall.function.arguments)
                    return JSON.stringify(args, null, 2)
                  } catch {
                    return toolCall.function.arguments
                  }
                })()}
              </pre>
            </div>
          </div>
        </div>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  )
}

