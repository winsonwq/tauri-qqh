import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ComponentProps } from '../ComponentRegistry'
import { parsePartialJson } from '../../../utils/partialJsonParser'
import { ExecutorResponse } from '../../../agents/agentTypes'
import { markdownComponents } from '../MarkdownComponents'
import TodoList from './TodoList'

interface ExecutorResponseDisplayProps {
  props: ComponentProps
}

const ExecutorResponseDisplay: React.FC<ExecutorResponseDisplayProps> = ({
  props,
}) => {
  const { content } = props

  // 解析 JSON
  const parsed = useMemo(() => {
    try {
      return parsePartialJson<ExecutorResponse>(content)
    } catch (error) {
      console.warn('JSON 解析失败:', error)
      return {
        data: {} as Partial<ExecutorResponse>,
        isValid: false,
        raw: content,
      }
    }
  }, [content])

  const { data } = parsed

  // 提取数据字段，使用安全的默认值
  const summary = data?.summary
  const todos = data?.todos

  // 检查是否有有效数据，确保 summary 是字符串类型
  const summaryText = typeof summary === 'string' ? summary : String(summary || '')
  const todosArray = Array.isArray(todos) ? todos : []
  
  return (
    <div className="executor-response stream-json-display space-y-4">
      {/* 渲染 summary */}
      {summaryText.trim().length > 0 && (
        <div className="summary-section prose prose-sm max-w-none text-base-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {summaryText}
          </ReactMarkdown>
        </div>
      )}

      {/* 渲染 todos */}
      {todosArray.length > 0 && (
        <TodoList todos={todosArray} />
      )}
    </div>
  )
}

export default ExecutorResponseDisplay

