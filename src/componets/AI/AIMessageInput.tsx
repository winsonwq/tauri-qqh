import { useState } from 'react'
import {
  FaPlus,
  FaPaperclip,
  FaSearch,
  FaArrowUp,
  FaStop,
} from 'react-icons/fa'
import RichTextEditor from './RichTextEditor'
import { MentionOption } from './MentionPlugin'
import AIConfigSelector from './AIConfigSelector'

interface AIMessageInputProps {
  onSend?: (message: string, configId?: string) => void
  placeholder?: string
  isStreaming?: boolean
  onStop?: () => void
}

// 示例的 mention 选项（可以根据实际需求替换为 API 调用）
const defaultMentionOptions: MentionOption[] = []

const AIMessageInput = ({
  onSend,
  placeholder = '在这里输入消息，按 Enter 发送...',
  isStreaming = false,
  onStop,
}: AIMessageInputProps) => {
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')

  const handleSend = (content: string) => {
    if (content.trim() && onSend) {
      onSend(content.trim(), selectedConfigId || undefined)
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

  const handleIconClick = (iconName: string) => {
    // TODO: 实现各个图标的功能
    console.log('点击了图标:', iconName)
  }

  return (
    <div className="flex flex-col bg-base-200 border border-base-300 rounded-lg">
      {/* 输入框区域 */}
      <div className="relative">
        <RichTextEditor
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
          <button
            onClick={() => handleIconClick('add')}
            className="btn btn-ghost btn-xs btn-square"
            title="添加"
          >
            <FaPlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleIconClick('attach')}
            className="btn btn-ghost btn-xs btn-square"
            title="附件"
          >
            <FaPaperclip className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleIconClick('search')}
            className="btn btn-ghost btn-xs btn-square"
            title="搜索"
          >
            <FaSearch className="w-4 h-4" />
          </button>

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
              <FaStop className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                // 发送按钮点击时，通过 Enter 键模拟发送
                // 注意：由于 RichTextEditor 已经处理了 Enter 键发送，
                // 这个按钮主要用于视觉提示，实际发送通过 Enter 键触发
                // 如果需要按钮也能发送，需要将编辑器实例通过 ref 暴露出来
              }}
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
