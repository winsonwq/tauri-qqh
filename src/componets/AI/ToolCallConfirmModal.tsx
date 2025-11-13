export interface ToolCall {
  id: string
  type: string
  function: {
    name: string
    arguments: string
  }
}

interface ToolCallConfirmModalProps {
  isOpen: boolean
  toolCalls: ToolCall[]
  onConfirm: () => void
  onCancel: () => void
}

const ToolCallConfirmModal = ({
  isOpen,
  toolCalls,
  onConfirm,
  onCancel,
}: ToolCallConfirmModalProps) => {
  if (!isOpen) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">确认工具调用</h3>
        <p className="mb-4">AI 请求调用以下工具：</p>
        <div className="space-y-2 mb-4">
          {toolCalls.map((toolCall, index) => {
            let args: any = {}
            try {
              args = JSON.parse(toolCall.function.arguments)
            } catch {
              // 忽略解析错误
            }
            return (
              <div key={index} className="bg-base-200 rounded-lg p-3">
                <div className="font-medium">{toolCall.function.name}</div>
                <div className="text-sm text-base-content/70 mt-1">
                  <pre className="whitespace-pre-wrap text-xs">
                    {JSON.stringify(args, null, 2)}
                  </pre>
                </div>
              </div>
            )
          })}
        </div>
        <div className="modal-action">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            确认执行
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onCancel}></div>
    </div>
  )
}

export default ToolCallConfirmModal

