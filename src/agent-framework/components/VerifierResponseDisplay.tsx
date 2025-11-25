import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parsePartialJson } from '../utils/jsonParser'
import { VerifierResponse, Todo } from '../core/types'
import { markdownComponents } from './MarkdownComponents'
import TodoList from './TodoList'

export interface VerifierResponseDisplayProps {
  content: string
  plannerTodos?: Todo[]
}

const VerifierResponseDisplay: React.FC<VerifierResponseDisplayProps> = ({
  content,
  plannerTodos
}) => {
  // 解析 JSON
  const parsed = useMemo(() => {
    try {
      return parsePartialJson<VerifierResponse>(content)
    } catch (error) {
      console.warn('JSON 解析失败:', error)
      return {
        data: null as VerifierResponse | null,
        isValid: false,
      }
    }
  }, [content])

  const { data } = parsed

  const todos: Todo[] = useMemo(() => {
    if (!data || !data.tasks || !Array.isArray(data.tasks)) {
      return []
    }
    return data.tasks.map((task) => {
      const status: Todo['status'] = task.completed ? 'completed' : 'failed'
      let description = task.id || '任务'
      if (plannerTodos && Array.isArray(plannerTodos)) {
        const plannerTodo = plannerTodos.find((t) => t.id === task.id)
        if (plannerTodo && plannerTodo.description) {
          description = plannerTodo.description
        }
      }
      // 安全地处理 task.feedback
      let result: string | undefined = undefined
      if (task.feedback) {
        if (typeof task.feedback === 'string') {
          result = task.feedback
        } else if (typeof task.feedback === 'object') {
          try {
            result = JSON.stringify(task.feedback, null, 2)
          } catch {
            result = String(task.feedback)
          }
        } else {
          result = String(task.feedback)
        }
      }
      return {
        id: task.id,
        description,
        status,
        result,
        priority: 0,
      }
    })
  }, [data, plannerTodos])

  // 检查是否有有效数据
  const overallFeedback = data?.overallFeedback
  const overallFeedbackText = useMemo(() => {
    if (!overallFeedback) return ''
    if (typeof overallFeedback === 'string') {
      return overallFeedback
    }
    if (typeof overallFeedback === 'object') {
      try {
        return JSON.stringify(overallFeedback, null, 2)
      } catch {
        return String(overallFeedback)
      }
    }
    return String(overallFeedback)
  }, [overallFeedback])

  // 获取最终总结（任务完成时由 verifier 提供）
  const summaryText = useMemo(() => {
    if (!data?.summary) return ''
    if (typeof data.summary === 'string') {
      return data.summary
    }
    return String(data.summary)
  }, [data?.summary])
  
  const hasData =
    (overallFeedbackText.trim().length > 0) ||
    (summaryText.trim().length > 0) ||
    todos.length > 0 ||
    data?.allCompleted !== undefined

  if (!hasData) {
    return null
  }

  return (
    <div className="verifier-response stream-json-display space-y-4">
      {/* 显示最终总结（优先级最高） */}
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

      {/* 如果没有总结，显示整体反馈 */}
      {!summaryText.trim() && overallFeedbackText.trim().length > 0 && (
        <div className="summary-section prose prose-sm max-w-none text-base-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents as any}
          >
            {overallFeedbackText}
          </ReactMarkdown>
        </div>
      )}

      {todos.length > 0 && (
        <TodoList 
          todos={todos} 
          title={`任务验证结果 (${todos.length})`}
          collapseCompleted={false}
        />
      )}
    </div>
  )
}

export default VerifierResponseDisplay

