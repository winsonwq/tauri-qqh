import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parsePartialJson } from '../utils/jsonParser'
import { PlannerResponse } from '../core/types'
import { markdownComponents } from './MarkdownComponents'
import TodoList from './TodoList'

export interface PlannerResponseDisplayProps {
  content: string
}

const PlannerResponseDisplay: React.FC<PlannerResponseDisplayProps> = ({
  content,
}) => {
  // 解析 JSON
  const parsed = useMemo(() => {
    try {
      return parsePartialJson<PlannerResponse>(content)
    } catch (error) {
      console.warn('JSON 解析失败:', error)
      return {
        data: {} as Partial<PlannerResponse>,
        isValid: false,
        raw: content,
      }
    }
  }, [content])

  const { data } = parsed

  // 检查是否有 JSON 结构（通过检查内容是否包含 JSON 特征来判断）
  const hasJsonStructure = content.trim().match(/\{[\s\S]*\}/) !== null

  // 如果没有 JSON 结构，可能是纯文本总结
  if (!hasJsonStructure && content.trim().length > 0) {
    return (
      <div className="planner-response stream-json-display">
        <div className="summary-section prose prose-sm max-w-none text-base-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents as any}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    )
  }

  // 提取数据字段，使用安全的默认值
  const summary = data?.summary
  const todos = data?.todos
  const needsMorePlanning = data?.needsMorePlanning

  // 检查是否有有效数据，确保 summary 是字符串类型
  const summaryText = typeof summary === 'string' ? summary : String(summary || '')
  const todosArray = Array.isArray(todos) ? todos : []
  const hasData =
    (summaryText.trim().length > 0) ||
    (todosArray.length > 0) ||
    needsMorePlanning !== undefined

  // 如果没有有效数据，不显示
  // 注意：流式传输时，即使 JSON 不完整，如果有部分数据也应该显示
  if (!hasData) {
    return null
  }

  return (
    <div className="planner-response stream-json-display space-y-4">
      {/* 渲染 summary */}
      {summaryText.trim().length > 0 && (
        <div className="summary-section prose prose-sm max-w-none text-base-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents as any}
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

export default PlannerResponseDisplay

