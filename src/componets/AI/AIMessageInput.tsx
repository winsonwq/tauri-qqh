import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FaPlus, FaPaperclip, FaSearch, FaArrowUp, FaStop } from 'react-icons/fa'
import RichTextEditor from './RichTextEditor'
import { MentionOption } from './MentionPlugin'
import { AIConfig } from '../../models'
import Select from '../Select'

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
  const [configs, setConfigs] = useState<AIConfig[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [loadingConfigs, setLoadingConfigs] = useState(false)

  // 加载 AI 配置列表（仅在组件挂载时）
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        setLoadingConfigs(true)
        const configsList = await invoke<AIConfig[]>('get_ai_configs')
        setConfigs(configsList)
        // 如果有配置且没有选中，默认选择第一个
        if (configsList.length > 0) {
          setSelectedConfigId((prev) => {
            // 如果当前选中的配置不存在于列表中，或者没有选中，则选择第一个
            const currentConfigExists = configsList.some((c) => c.id === prev)
            return currentConfigExists && prev ? prev : configsList[0].id
          })
        }
      } catch (err) {
        console.error('加载 AI 配置失败:', err)
      } finally {
        setLoadingConfigs(false)
      }
    }
    loadConfigs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = (content: string) => {
    if (content.trim() && onSend) {
      onSend(content.trim(), selectedConfigId || undefined)
    }
  }

  // 可选的搜索函数（用于异步搜索）
  const handleMentionSearch = async (query: string, _trigger: string): Promise<MentionOption[]> => {
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

  // 使用 useMemo 优化配置选项的生成
  const configOptions = useMemo(
    () =>
      configs.map((config) => ({
        value: config.id,
        label: `${config.name} (${config.model})`,
      })),
    [configs],
  )

  return (
    <div className="flex flex-col bg-base-200 border border-base-300 rounded-lg">
      {/* AI 配置选择器 */}
      {configs.length > 0 && (
        <div className="px-2 pt-2 pb-1 border-b border-base-300">
          <Select
            value={selectedConfigId}
            options={configOptions}
            onChange={(value) => setSelectedConfigId(value)}
            disabled={loadingConfigs}
            size="sm"
            className="text-xs"
          />
        </div>
      )}

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
