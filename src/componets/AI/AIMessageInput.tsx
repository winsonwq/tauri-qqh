import { useState, useRef } from 'react'
import {
  FaArrowUp,
  FaStop,
} from 'react-icons/fa'
import { HiArrowPath } from 'react-icons/hi2'
import { TbInfinity, TbMessageCircle } from 'react-icons/tb'
import RichTextEditor, { RichTextEditorRef } from './RichTextEditor'
import { MentionOption } from './MentionPlugin'
import AIConfigSelector from './AIConfigSelector'
import Select from '../Select'

export type AIMode = 'ask' | 'agents'

interface AIMessageInputProps {
  onSend?: (message: string, configId?: string) => void
  placeholder?: string
  isStreaming?: boolean
  onStop?: () => void
  mode?: AIMode
  onModeChange?: (mode: AIMode) => void
}

// 示例的 mention 选项（可以根据实际需求替换为 API 调用）
const defaultMentionOptions: MentionOption[] = []

const AIMessageInput = ({
  onSend,
  placeholder = '在这里输入消息，按 Enter 发送...',
  isStreaming = false,
  onStop,
  mode = 'ask',
  onModeChange,
}: AIMessageInputProps) => {
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const editorRef = useRef<RichTextEditorRef>(null)

  const handleSend = (content: string) => {
    if (content.trim() && onSend) {
      onSend(content.trim(), selectedConfigId || undefined)
    }
  }

  const handleSendButtonClick = () => {
    if (editorRef.current) {
      editorRef.current.send()
    }
  }

  // 可选的搜索函数（用于异步搜索）
  const handleMentionSearch = async (
    query: string,
    _trigger: string,
  ): Promise<MentionOption[]> => {
    // 这里可以实现实际的搜索逻辑，比如调用 API
    // 目前使用简单的过滤
    return defaultMentionOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query.toLowerCase()) ||
        opt.value.toLowerCase().includes(query.toLowerCase()),
    )
  }

  return (
    <div className="flex flex-col bg-base-200 border border-base-300 rounded-lg">
      {/* 输入框区域 */}
      <div className="relative">
        <RichTextEditor
          ref={editorRef}
          placeholder={placeholder}
          onSend={handleSend}
          minHeight={40}
          maxHeight={200}
          mentionOptions={defaultMentionOptions}
          onMentionSearch={handleMentionSearch}
          triggers={['#', '@']}
        />
      </div>

      {/* 图标按钮区域 */}
      <div className="flex items-center justify-between px-2 pb-2">
        {/* 左侧图标组 */}
        <div className="flex items-center gap-1.5">
          {/* 模式选择器 */}
          <div className="w-24">
            <Select
              value={mode}
              options={[
                { value: 'ask', label: 'Ask', icon: TbMessageCircle },
                { value: 'agents', label: 'Agents', icon: TbInfinity },
              ]}
              onChange={(value) => {
                if (onModeChange) {
                  onModeChange(value as AIMode)
                }
              }}
              size="xs"
              disabled={isStreaming}
            />
          </div>
          {/* AI 配置选择器 */}
          <AIConfigSelector
            selectedConfigId={selectedConfigId}
            onConfigChange={setSelectedConfigId}
          />
        </div>

        {/* 右侧发送/停止按钮 */}
        <div className="flex items-center">
          {isStreaming ? (
            <button
              onClick={() => {
                if (onStop) {
                  onStop()
                }
              }}
              className="btn btn-error btn-xs btn-circle"
              title="停止生成"
            >
              <FaStop className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={handleSendButtonClick}
              className="btn btn-primary btn-xs btn-circle"
              title="发送（按 Enter 发送）"
            >
              <FaArrowUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AIMessageInput
