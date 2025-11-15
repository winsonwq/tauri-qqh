import React from 'react'
import { ComponentRenderer } from './ComponentRegistry'
import './ComponentInit' // 确保组件已注册

export interface ToolResultContentItem {
  type: 'text' | 'json' | 'webcomponent' | 'component'
  value?: string // 对于 webcomponent 类型，value 是 HTML 字符串；对于 component 类型，value 可能为空
  componentName?: string // component 组件名
  props?: Record<string, any> // component 属性
}

interface ToolResultDisplayProps {
  items: ToolResultContentItem[]
}

const ToolResultDisplay: React.FC<ToolResultDisplayProps> = ({ items }) => {
  // 渲染单个内容项
  const renderItem = (item: ToolResultContentItem, index: number) => {
    switch (item.type) {
      case 'text':
        // 使用 whitespace-pre-wrap 来处理换行符 \n
        return (
          <div
            key={index}
            className="text-sm text-base-content whitespace-pre-wrap break-words"
          >
            {item.value || ''}
          </div>
        )

      case 'json':
        try {
          if (!item.value) {
            return (
              <div key={index} className="text-sm text-warning">
                无效的 JSON 数据
              </div>
            )
          }
          const jsonObj = JSON.parse(item.value)
          return (
            <div
              key={index}
              className="bg-base-200 rounded-lg p-3 border border-base-300"
            >
              <pre className="text-xs text-base-content/80 whitespace-pre-wrap break-words overflow-auto max-h-96">
                {JSON.stringify(jsonObj, null, 2)}
              </pre>
            </div>
          )
        } catch {
          // 如果 JSON 解析失败，作为文本显示
          return (
            <div
              key={index}
              className="text-sm text-base-content whitespace-pre-wrap break-words"
            >
              {item.value || ''}
            </div>
          )
        }

      case 'webcomponent':
        // 对于 webcomponent，使用 dangerouslySetInnerHTML 渲染 HTML 字符串
        // 这是真正的 Web Components，浏览器会自动识别并渲染
        if (item.value) {
          return (
            <div
              key={index}
              className="text-sm text-base-content"
              dangerouslySetInnerHTML={{ __html: item.value }}
            />
          )
        } else {
          return (
            <div key={index} className="text-sm text-warning">
              无效的 webcomponent 数据
            </div>
          )
        }

      case 'component':
        // 对于 component，使用 ComponentRenderer 渲染 React 组件
        if (item.componentName && item.props) {
          return (
            <div key={index} className="text-sm text-base-content">
              <ComponentRenderer
                componentName={item.componentName}
                props={item.props}
              />
            </div>
          )
        } else {
          return (
            <div key={index} className="text-sm text-warning">
              无效的 component 数据
            </div>
          )
        }

      default:
        return (
          <div
            key={index}
            className="text-sm text-base-content whitespace-pre-wrap break-words"
          >
            {item.value || ''}
          </div>
        )
    }
  }

  if (!items || items.length === 0) {
    return <div className="text-sm text-base-content/50 italic">无内容</div>
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => renderItem(item, index))}
    </div>
  )
}

// 解析工具调用结果内容的辅助函数
export function parseToolResultContent(
  content: string,
): ToolResultContentItem[] {
  try {
    // 尝试解析为 JSON
    const parsed = JSON.parse(content)

    // 如果包含 content 数组，使用它
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.content)) {
      return parsed.content.map((item: any) => {
        const type = (item.type || 'text') as string

        // 如果是 component 类型，解析 componentName 和 props
        if (type === 'component') {
          return {
            type: 'component' as const,
            componentName: item.componentName || item.tagName, // 兼容 tagName
            props: item.props || item.attributes || {}, // 兼容 attributes
            value: item.value || item.text || '', // 保留 value 以兼容旧格式
          }
        }

        // 如果是 webcomponent 类型，保留 HTML 字符串
        if (type === 'webcomponent') {
          return {
            type: 'webcomponent' as const,
            value: item.value || item.text || '',
          }
        }

        // 其他类型保持原有逻辑
        return {
          type: (type === 'text' || type === 'json' ? type : 'text') as
            | 'text'
            | 'json',
          value: item.value || item.text || '', // 兼容旧的 text 字段
        }
      })
    } else if (Array.isArray(parsed)) {
      // 如果直接是数组
      return parsed.map((item: any) => {
        const type = (item.type || 'text') as string

        if (type === 'component') {
          return {
            type: 'component' as const,
            componentName: item.componentName || item.tagName,
            props: item.props || item.attributes || {},
            value: item.value || item.text || '',
          }
        }

        if (type === 'webcomponent') {
          return {
            type: 'webcomponent' as const,
            value: item.value || item.text || '',
          }
        }

        return {
          type: (type === 'text' || type === 'json' ? type : 'text') as
            | 'text'
            | 'json',
          value: item.value || item.text || '',
        }
      })
    } else {
      // 如果是普通对象，转换为 text 类型
      return [
        {
          type: 'text',
          value: JSON.stringify(parsed, null, 2),
        },
      ]
    }
  } catch {
    // 如果解析失败，作为纯文本处理
    return [
      {
        type: 'text',
        value: content,
      },
    ]
  }
}

export default ToolResultDisplay
