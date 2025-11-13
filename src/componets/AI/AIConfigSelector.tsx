import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AIConfig } from '../../models'
import Dropdown from '../Dropdown'

interface AIConfigSelectorProps {
  selectedConfigId?: string
  onConfigChange?: (configId: string) => void
}

const AIConfigSelector = ({
  selectedConfigId: externalSelectedConfigId,
  onConfigChange,
}: AIConfigSelectorProps) => {
  const [configs, setConfigs] = useState<AIConfig[]>([])
  const [internalSelectedConfigId, setInternalSelectedConfigId] =
    useState<string>('')
  const [loadingConfigs, setLoadingConfigs] = useState(false)

  // 使用外部传入的 selectedConfigId，如果没有则使用内部状态
  const selectedConfigId =
    externalSelectedConfigId !== undefined
      ? externalSelectedConfigId
      : internalSelectedConfigId

  // 加载 AI 配置列表（仅在组件挂载时）
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        setLoadingConfigs(true)
        const configsList = await invoke<AIConfig[]>('get_ai_configs')
        setConfigs(configsList)
        // 如果有配置且没有选中，默认选择第一个
        if (configsList.length > 0) {
          const newSelectedId = (() => {
            // 如果外部传入了 selectedConfigId，优先使用
            if (externalSelectedConfigId) {
              const exists = configsList.some(
                (c) => c.id === externalSelectedConfigId,
              )
              return exists ? externalSelectedConfigId : configsList[0].id
            }
            // 否则检查内部状态
            const currentConfigExists = configsList.some(
              (c) => c.id === internalSelectedConfigId,
            )
            return currentConfigExists && internalSelectedConfigId
              ? internalSelectedConfigId
              : configsList[0].id
          })()

          if (externalSelectedConfigId === undefined) {
            setInternalSelectedConfigId(newSelectedId)
          }
          if (onConfigChange) {
            onConfigChange(newSelectedId)
          }
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

  // 获取当前选中的配置
  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedConfigId),
    [configs, selectedConfigId],
  )

  // 计算 summary 显示的文本
  const summaryText = useMemo(() => {
    if (loadingConfigs) {
      return '加载中...'
    }
    if (selectedConfig) {
      return `${selectedConfig.name} (${selectedConfig.model})`
    }
    return '选择 AI 配置'
  }, [loadingConfigs, selectedConfig])

  const handleConfigSelect = (configId: string) => {
    if (externalSelectedConfigId === undefined) {
      setInternalSelectedConfigId(configId)
    }
    if (onConfigChange) {
      onConfigChange(configId)
    }
  }

  if (configs.length === 0) {
    return null
  }

  return (
    <Dropdown
      selectedId={selectedConfigId}
      options={configs}
      onSelect={handleConfigSelect}
      summary={
        <span title={summaryText} className="truncate">
          {summaryText}
        </span>
      }
      renderOption={(config, _isSelected) => (
        <>
          <div className="font-medium truncate">{config.name}</div>
          <div className="text-xs opacity-70 truncate">{config.model}</div>
        </>
      )}
      position="top"
      loading={loadingConfigs}
      summaryClassName="btn btn-xs text-xs max-w-[120px] truncate"
    />
  )
}

export default AIConfigSelector
