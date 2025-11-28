import { useState, useEffect, useMemo } from 'react'
import { useAppSelector } from '../../redux/hooks'
import Select, { SelectOption } from '../Select'

interface AIConfigSelectorProps {
  selectedConfigId?: string
  onConfigChange?: (configId: string) => void
}

const AIConfigSelector = ({
  selectedConfigId: externalSelectedConfigId,
  onConfigChange,
}: AIConfigSelectorProps) => {
  const { configs, loading: loadingConfigs } = useAppSelector(
    (state) => state.aiConfig,
  )
  const [internalSelectedConfigId, setInternalSelectedConfigId] =
    useState<string>('')

  // 使用外部传入的 selectedConfigId，如果没有则使用内部状态
  const selectedConfigId =
    externalSelectedConfigId !== undefined
      ? externalSelectedConfigId
      : internalSelectedConfigId

  // 当 configs 变化时，自动选择第一个配置（如果没有选中）
  useEffect(() => {
    if (configs.length > 0) {
      const newSelectedId = (() => {
        // 如果外部传入了 selectedConfigId，优先使用
        if (externalSelectedConfigId) {
          const exists = configs.some(
            (c) => c.id === externalSelectedConfigId,
          )
          return exists ? externalSelectedConfigId : configs[0].id
        }
        // 否则检查内部状态
        const currentConfigExists = configs.some(
          (c) => c.id === internalSelectedConfigId,
        )
        return currentConfigExists && internalSelectedConfigId
          ? internalSelectedConfigId
          : configs[0].id
      })()

      if (externalSelectedConfigId === undefined) {
        setInternalSelectedConfigId(newSelectedId)
      }
      if (onConfigChange) {
        onConfigChange(newSelectedId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs])

  // 将 AIConfig[] 转换为 SelectOption[]
  const selectOptions = useMemo<SelectOption[]>(() => {
    return configs.map((config) => ({
      value: config.id,
      label: `${config.name} (${config.model})`,
    }))
  }, [configs])

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
    <Select
      value={selectedConfigId}
      options={selectOptions}
      onChange={handleConfigSelect}
      placeholder={loadingConfigs ? '加载中...' : '选择 AI 配置'}
      disabled={loadingConfigs}
      size="xs"
      className="max-w-[120px]"
    />
  )
}

export default AIConfigSelector
