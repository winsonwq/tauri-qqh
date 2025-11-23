import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ComponentProps, ComponentRenderer } from '../ComponentRegistry'
import { parsePartialJson } from '../../../utils/partialJsonParser'
import { markdownComponents } from '../MarkdownComponents'

// 字段渲染配置类型
type FieldRenderConfig =
  | {
      type: 'component'
      component: string
      data: any
      props?: Record<string, any> | ((data: any) => Record<string, any>)
    }
  | { type: 'markdown'; data: string }

interface StreamJsonDisplayConfig {
  containerClassName?: string
  // 字段映射配置：将响应数据字段映射到渲染配置
  fieldMapping?: Record<string, FieldRenderConfig>
  // 自定义字段提取函数
  extractFields?: (data: Record<string, any>) => Record<string, any>
  // 自定义 JSON 解析函数（可选，默认使用通用解析）
  parseJson?: (content: string) => { data: Record<string, any>; isValid: boolean }
  // 自定义空数据处理：当没有有效数据时的渲染逻辑
  renderEmptyContent?: (content: string, hasJsonStructure: boolean) => React.ReactNode
  // 额外的内容渲染
  renderExtraContent?: (data: Record<string, any>, isValid: boolean) => React.ReactNode
}

interface StreamJsonDisplayProps {
  props: ComponentProps & { config?: StreamJsonDisplayConfig }
}

// 字段组件分发器（用于字段级别的组件渲染）
// 使用统一的 ComponentRenderer，通过注册表管理组件
const FieldComponentRenderer: React.FC<{
  component: string
  data: any
  props?: Record<string, any>
}> = ({ component, data, props = {} }) => {
  // 将 component 名称映射到注册表中的名称
  const componentNameMap: Record<string, string> = {
    TodoList: 'todo-list',
  }
  const registeredName = componentNameMap[component] || component.toLowerCase()
  
  return (
    <ComponentRenderer
      component={registeredName}
      props={{ ...props, todos: data }}
    />
  )
}

const StreamJsonDisplay: React.FC<StreamJsonDisplayProps> = ({ props }) => {
  const { content, config } = props as {
    content: string
    config?: StreamJsonDisplayConfig
  }

  if (!config) {
    return (
      <div className="stream-json-display">
        <div className="text-sm text-error">配置错误：缺少 config</div>
      </div>
    )
  }

  const {
    containerClassName,
    fieldMapping,
    extractFields,
    parseJson,
    renderEmptyContent,
    renderExtraContent,
  } = config

  // 始终尝试解析 JSON，即使不完整
  const parsed = useMemo(() => {
    // 如果提供了自定义解析函数，使用它
    if (parseJson) {
      return parseJson(content)
    }

    // 默认通用 JSON 解析
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        data: {} as Record<string, any>,
        isValid: false,
      }
    }

    try {
      return parsePartialJson<Record<string, any>>(jsonMatch[0])
    } catch (error) {
      console.warn('JSON 解析失败:', error)
      return {
        data: {} as Record<string, any>,
        isValid: false,
      }
    }
  }, [content, parseJson])

  const { data, isValid } = parsed

  // 检查是否找到了 JSON 结构
  const hasJsonStructure = useMemo(() => {
    return !!content.match(/\{[\s\S]*\}/)
  }, [content])

  // 提取字段数据
  const extractedFields = useMemo(() => {
    if (extractFields) {
      return extractFields(data)
    }

    // 默认通用字段提取：直接返回所有字段（排除 type 和 component）
    const result: Record<string, any> = {}
    Object.entries(data).forEach(([key, value]) => {
      // 跳过 type 和 component 字段（这些是元数据）
      if (key !== 'type' && key !== 'component') {
        result[key] = value
      }
    })
    return result
  }, [data, extractFields])

  // 检查是否有任何有效的数据字段
  const hasData = useMemo(() => {
    return Object.values(extractedFields).some((value) => {
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'string') return value.trim().length > 0
      if (typeof value === 'boolean') return true // boolean 值也算有效数据
      return value !== undefined && value !== null
    })
  }, [extractedFields])

  // 如果没有有效数据，使用自定义的空内容渲染或返回 null
  if (!hasData) {
    if (renderEmptyContent) {
      return (
        <div className={`stream-json-display ${containerClassName || ''}`}>
          {renderEmptyContent(content, hasJsonStructure)}
        </div>
      )
    }
    // 默认：如果没有有效数据，不显示任何内容
    return null
  }

  // 自动生成字段映射配置
  const defaultFieldMapping = useMemo<Record<string, FieldRenderConfig>>(() => {
    // 如果提供了自定义 fieldMapping，需要从 extractedFields 中填充 data
    if (fieldMapping) {
      const mergedMapping: Record<string, FieldRenderConfig> = {}
      Object.entries(fieldMapping).forEach(([fieldName, config]) => {
        // 如果配置中没有 data，从 extractedFields 中获取
        if (config.type === 'component') {
          const fieldValue = extractedFields[fieldName]
          mergedMapping[fieldName] = {
            type: 'component',
            component: config.component,
            data: fieldValue,
            props: config.props,
          }
        } else {
          mergedMapping[fieldName] = config
        }
      })
      // 同时处理 extractedFields 中其他未在 fieldMapping 中定义的字段
      Object.entries(extractedFields).forEach(([fieldName, fieldValue]) => {
        if (!mergedMapping[fieldName] && fieldValue !== undefined && fieldValue !== null) {
          // 自动生成映射
          if (fieldName === 'todos' && Array.isArray(fieldValue) && fieldValue.length > 0) {
            mergedMapping[fieldName] = {
              type: 'component',
              component: 'TodoList',
              data: fieldValue,
            }
          } else if (typeof fieldValue === 'string' && fieldValue.trim().length > 0) {
            mergedMapping[fieldName] = {
              type: 'markdown',
              data: fieldValue,
            }
          }
        }
      })
      return mergedMapping
    }

    // 自动从 extractedFields 中生成映射
    // 根据字段类型和名称自动决定渲染方式
    const mapping: Record<string, FieldRenderConfig> = {}
    
    Object.entries(extractedFields).forEach(([fieldName, fieldValue]) => {
      // 跳过无效值
      if (fieldValue === undefined || fieldValue === null) {
        return
      }

      // todos 字段使用 TodoList 组件
      if (fieldName === 'todos' && Array.isArray(fieldValue) && fieldValue.length > 0) {
        mapping[fieldName] = {
          type: 'component',
          component: 'TodoList',
          data: fieldValue,
        }
        return
      }

      // 字符串字段使用 markdown 渲染
      if (typeof fieldValue === 'string' && fieldValue.trim().length > 0) {
        mapping[fieldName] = {
          type: 'markdown',
          data: fieldValue,
        }
        return
      }

      // 布尔值等其他类型跳过（不渲染）
    })

    return mapping
  }, [fieldMapping, extractedFields])

  // 渲染字段
  const renderField = (
    fieldName: string,
    config: FieldRenderConfig,
  ): React.ReactNode => {
    switch (config.type) {
      case 'component':
        // 对于 component 类型，使用 config.data，如果为空则不渲染
        if (!config.data || (Array.isArray(config.data) && config.data.length === 0)) {
          return null
        }
        // 如果 props 是函数，调用它来生成 props
        const componentProps = typeof config.props === 'function' 
          ? config.props(config.data)
          : config.props
        return (
          <FieldComponentRenderer
            key={fieldName}
            component={config.component}
            data={config.data}
            props={componentProps}
          />
        )
      case 'markdown':
        // 对于 markdown 类型，使用 config.data，如果为空则不渲染
        if (!config.data || typeof config.data !== 'string' || config.data.trim().length === 0) {
          return null
        }
        return (
          <div
            key={fieldName}
            className="summary-section prose prose-sm max-w-none text-base-content"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {config.data}
            </ReactMarkdown>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={`stream-json-display space-y-4 ${
        containerClassName || ''
      }`}
    >
      {/* 根据字段映射渲染各个字段 */}
      {Object.entries(defaultFieldMapping).map(([fieldName, config]) =>
        renderField(fieldName, config),
      )}

      {/* 额外的内容渲染 */}
      {renderExtraContent && renderExtraContent(data, isValid)}

      {/* 流式传输提示 */}
      {!isValid && hasData && (
        <div className="text-xs text-warning/70 italic">正在接收数据...</div>
      )}
    </div>
  )
}

export default StreamJsonDisplay
export type { StreamJsonDisplayConfig }
